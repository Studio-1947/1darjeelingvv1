import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { eq, or, and, ilike, inArray } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { storeBase64Image, ImageUploadError } from '../lib/imageUpload';
import {
  SPOT_TYPE, SPOT_FORBIDDEN_MESSAGE, canWriteSpots, parseSpotExtras,
  isSpotPublished, publicSpotVisibility, spotOrdering, SpotValidationError,
} from '../lib/spots';

async function resolveOwnProviderId(userId: string): Promise<string | null> {
  const providersList = await db.select().from(schema.providers).where(eq(schema.providers.userId, userId));
  const active = providersList.find(p => p.status === 'active');
  return active ? active.id : null;
}

const router = Router();

// ============ LISTINGS ============

/**
 * @openapi
 * /listings:
 *   get:
 *     summary: List/search listings
 *     tags: [Listings]
 *     parameters:
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [spot, homestay, driver, shop, cafe, event, biodiversity] }
 *         description: Filter by listing type
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Case-insensitive search across title, description, location
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 60 }
 *     responses:
 *       200:
 *         description: Matching listings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Listing' }
 *   post:
 *     summary: Create a listing
 *     description: >
 *       Callers must be an active provider (listing is created under their own provider id — any
 *       provider_id in the body is ignored) or an admin (may set provider_id explicitly). Other
 *       authenticated users (e.g. tourists) are rejected. `type=spot` is admin-only: tourist spots
 *       are curated content, so a provider creating one gets a 403 — use /admin/spots instead.
 *     tags: [Listings]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, type, description, location]
 *             properties:
 *               title: { type: string }
 *               type: { type: string, enum: [spot, homestay, driver, shop, cafe, event, biodiversity] }
 *               description: { type: string }
 *               location: { type: string }
 *               price: { type: integer, default: 0 }
 *               image: { type: string }
 *               tags: { type: array, items: { type: string } }
 *               provider_id: { type: string, description: "Admin only — ignored for non-admin callers" }
 *               extras: { type: object }
 *     responses:
 *       200:
 *         description: Created listing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 item: { $ref: '#/components/schemas/Listing' }
 *       400:
 *         description: Missing required fields
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403:
 *         description: Caller is not an active provider or admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
/** Rating summary (count + 1-decimal average) per listing id, for the ids given. */
async function ratingsForListings(listingIds: string[]): Promise<Map<string, { count: number; average: number }>> {
  const out = new Map<string, { count: number; average: number }>();
  if (listingIds.length === 0) return out;
  const rows = await db.select({ listingId: schema.reviews.listingId, rating: schema.reviews.rating })
    .from(schema.reviews)
    .where(inArray(schema.reviews.listingId, listingIds));
  const acc = new Map<string, { sum: number; count: number }>();
  for (const r of rows) {
    const a = acc.get(r.listingId) || { sum: 0, count: 0 };
    a.sum += r.rating;
    a.count += 1;
    acc.set(r.listingId, a);
  }
  for (const [id, a] of acc) {
    out.set(id, { count: a.count, average: Math.round((a.sum / a.count) * 10) / 10 });
  }
  return out;
}

// Get list of listings with filter
router.get('/', async (req: Request, res: Response) => {
  const type = req.query.type as string | undefined;
  const q = req.query.q as string | undefined;
  const limit = parseInt(req.query.limit as string) || 60;

  // Draft spots must never surface on a public read — this route has no auth, so the
  // predicate is unconditional here and admins get their drafts from /admin/spots instead.
  const conditions = [publicSpotVisibility()];
  if (type) {
    conditions.push(eq(schema.listings.type, type));
  }
  if (q) {
    conditions.push(
      or(
        ilike(schema.listings.title, `%${q}%`),
        ilike(schema.listings.description, `%${q}%`),
        ilike(schema.listings.location, `%${q}%`)
      )!
    );
  }

  // The spots feed is curated, so it follows the admin's own order (featured first, then
  // the manual sort order). Every other type keeps the table's natural order as before.
  const query = db.select().from(schema.listings).where(and(...conditions));
  const items = type === SPOT_TYPE
    ? await query.orderBy(...spotOrdering()).limit(limit)
    : await query.limit(limit);

  const providerIds = [...new Set(items.map(item => item.providerId))];
  const providerRows = providerIds.length > 0
    ? await db.select({ id: schema.providers.id, kycStatus: schema.providers.kycStatus, status: schema.providers.status })
        .from(schema.providers)
        .where(inArray(schema.providers.id, providerIds))
    : [];
  const providerById = new Map(providerRows.map(p => [p.id, p]));
  const ratingByListing = await ratingsForListings(items.map(i => i.id));

  const itemsReturn = items.map(item => {
    const provider = providerById.get(item.providerId);
    const rating = ratingByListing.get(item.id);
    return {
      id: item.id,
      title: item.title,
      type: item.type,
      description: item.description,
      location: item.location,
      latitude: item.latitude,
      longitude: item.longitude,
      price: item.price,
      image: item.image,
      tags: item.tags,
      provider_id: item.providerId,
      extras: item.extras,
      created_at: item.createdAt,
      rating: rating?.average ?? 0,
      review_count: rating?.count ?? 0,
      // Verified badge must never show for a provider an admin has suspended (flipped off
      // "active"), even if their kycStatus was previously computed as "verified".
      provider_verified: provider?.kycStatus === 'verified' && provider?.status === 'active'
    };
  });

  res.json({ items: itemsReturn });
});

/**
 * @openapi
 * /listings/{id}:
 *   get:
 *     summary: Get a single listing by id
 *     tags: [Listings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: The listing
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 item: { $ref: '#/components/schemas/Listing' }
 *       404:
 *         description: Listing not found
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// Get single listing detail
router.get('/:id', async (req: Request, res: Response) => {
  const [item] = await db.select().from(schema.listings).where(eq(schema.listings.id, req.params.id as any)).limit(1);
  if (!item) {
    return res.status(404).json({ detail: 'Not found' });
  }
  // A draft spot is unpublished content: it must not be reachable by guessing/keeping its id
  // either, so it 404s here exactly as it is filtered out of the list route above.
  if (item.type === SPOT_TYPE && !isSpotPublished(item.extras)) {
    return res.status(404).json({ detail: 'Not found' });
  }

  const [provider] = await db.select({
      kycStatus: schema.providers.kycStatus,
      status: schema.providers.status,
      contactPhone: schema.providers.contactPhone,
    })
    .from(schema.providers)
    .where(eq(schema.providers.id, item.providerId))
    .limit(1);

  const rating = (await ratingsForListings([item.id])).get(item.id);

  const itemReturn = {
    id: item.id,
    title: item.title,
    type: item.type,
    description: item.description,
    location: item.location,
    latitude: item.latitude,
    longitude: item.longitude,
    price: item.price,
    image: item.image,
    tags: item.tags,
    provider_id: item.providerId,
    extras: item.extras,
    created_at: item.createdAt,
    rating: rating?.average ?? 0,
    review_count: rating?.count ?? 0,
    // The provider's public contact line, so the detail page can offer call/WhatsApp for listings
    // that aren't booked online (shops, cafes, events). Only present when a provider row matches.
    provider_phone: provider?.contactPhone ?? null,
    // Verified badge must never show for a provider an admin has suspended (flipped off
    // "active"), even if their kycStatus was previously computed as "verified".
    provider_verified: provider?.kycStatus === 'verified' && provider?.status === 'active'
  };

  res.json({ item: itemReturn });
});

// Create a new listing
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  const { title, type, description, location, latitude = null, longitude = null, price = 0, image = '', tags = [], provider_id, extras = {} } = req.body;
  if (!title || !type || !description || !location) {
    return res.status(400).json({ detail: 'Title, type, description and location are required' });
  }

  // Tourist spots are curated editorial content, not a business someone lists. An active
  // provider may create every other type; only an admin may create a spot.
  if (type === SPOT_TYPE && !canWriteSpots(req.user.role)) {
    return res.status(403).json({ detail: SPOT_FORBIDDEN_MESSAGE });
  }

  let providerId: string;
  if (req.user.role === 'admin') {
    providerId = provider_id || req.user.id;
  } else {
    const ownProviderId = await resolveOwnProviderId(req.user.id);
    if (!ownProviderId) {
      return res.status(403).json({ detail: 'Only active providers or admins can create listings' });
    }
    providerId = ownProviderId;
  }

  let storedExtras = extras;
  if (type === SPOT_TYPE) {
    try {
      storedExtras = parseSpotExtras(extras);
    } catch (err) {
      if (err instanceof SpotValidationError) return res.status(400).json({ detail: err.message });
      throw err;
    }
  }

  const listing = {
    id: uuidv4(),
    title,
    type,
    description,
    location,
    latitude: typeof latitude === 'number' ? latitude : null,
    longitude: typeof longitude === 'number' ? longitude : null,
    price,
    image,
    tags,
    providerId,
    extras: storedExtras,
    createdAt: new Date().toISOString()
  };

  await db.insert(schema.listings).values(listing);

  const listingReturn = {
    id: listing.id,
    title: listing.title,
    type: listing.type,
    description: listing.description,
    location: listing.location,
    latitude: listing.latitude,
    longitude: listing.longitude,
    price: listing.price,
    image: listing.image,
    tags: listing.tags,
    provider_id: listing.providerId,
    extras: listing.extras,
    created_at: listing.createdAt
  };

  res.json({ item: listingReturn });
});

// Helper to verify listing management permissions
async function canManageListing(req: Request, listing: typeof schema.listings.$inferSelect): Promise<boolean> {
  // A spot is admin-owned content — a provider must not be able to edit or delete one even
  // if a spot row somehow carries their provider id (e.g. legacy data or a seeded row).
  if (listing.type === SPOT_TYPE) return canWriteSpots(req.user.role);
  if (req.user.role === 'admin') return true;
  const ownProviderId = await resolveOwnProviderId(req.user.id);
  return !!ownProviderId && ownProviderId === listing.providerId;
}

// Upload image (returns the public MinIO URL)
router.post('/upload', authenticateToken, async (req: Request, res: Response) => {
  try {
    const url = await storeBase64Image(req.body?.file, req.body?.filename);
    res.json({ url });
  } catch (err: any) {
    if (err instanceof ImageUploadError) return res.status(400).json({ detail: err.message });
    res.status(500).json({ detail: err.message || 'MinIO upload failed' });
  }
});

// Update listing handler (supports both PUT and PATCH)
const updateListingHandler = async (req: Request, res: Response) => {
  const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, req.params.id as any)).limit(1);
  if (!listing) {
    return res.status(404).json({ detail: 'Not found' });
  }
  if (!(await canManageListing(req, listing))) {
    return res.status(403).json({
      detail: listing.type === SPOT_TYPE
        ? SPOT_FORBIDDEN_MESSAGE
        : 'You do not have permission to edit this listing',
    });
  }

  // `type` is deliberately absent: a listing can never be re-typed, so a provider cannot
  // convert one of their own listings into an (admin-only) spot after the fact.
  const allowed = ['title', 'description', 'location', 'latitude', 'longitude', 'price', 'image', 'tags', 'extras'] as const;
  const updateFields: Record<string, any> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updateFields[key] = req.body[key];
    }
  }

  if (listing.type === SPOT_TYPE) {
    // Merged against what's stored, so a PATCH that sends only `published` keeps the gallery.
    try {
      updateFields.extras = parseSpotExtras(req.body.extras ?? {}, listing.extras || {});
    } catch (err) {
      if (err instanceof SpotValidationError) return res.status(400).json({ detail: err.message });
      throw err;
    }
  }

  for (const coord of ['latitude', 'longitude'] as const) {
    if (updateFields[coord] !== undefined && updateFields[coord] !== null && typeof updateFields[coord] !== 'number') {
      return res.status(400).json({ detail: `${coord} must be a number` });
    }
  }

  if (Object.keys(updateFields).length > 0) {
    await db.update(schema.listings).set(updateFields).where(eq(schema.listings.id, listing.id));
  }

  const [updated] = await db.select().from(schema.listings).where(eq(schema.listings.id, listing.id)).limit(1);
  const itemReturn = {
    id: updated.id,
    title: updated.title,
    type: updated.type,
    description: updated.description,
    location: updated.location,
    latitude: updated.latitude,
    longitude: updated.longitude,
    price: updated.price,
    image: updated.image,
    tags: updated.tags,
    provider_id: updated.providerId,
    extras: updated.extras,
    created_at: updated.createdAt
  };
  res.json({ item: itemReturn });
};

router.patch('/:id', authenticateToken, updateListingHandler);
router.put('/:id', authenticateToken, updateListingHandler);

// Delete a listing (provider who owns it, or admin)
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, req.params.id as any)).limit(1);
  if (!listing) {
    return res.status(404).json({ detail: 'Not found' });
  }
  if (!(await canManageListing(req, listing))) {
    return res.status(403).json({
      detail: listing.type === SPOT_TYPE
        ? SPOT_FORBIDDEN_MESSAGE
        : 'You do not have permission to delete this listing',
    });
  }

  await db.delete(schema.listings).where(eq(schema.listings.id, listing.id));
  res.json({ ok: true });
});

export default router;
