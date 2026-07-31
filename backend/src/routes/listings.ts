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

/** The listing types the app knows how to render. Mirrors the enum in the OpenAPI blocks below. */
const LISTING_TYPES = ['spot', 'homestay', 'driver', 'shop', 'cafe', 'event', 'biodiversity'];

const MAX_TITLE_LEN = 160;
const MAX_LOCATION_LEN = 160;
const MAX_DESCRIPTION_LEN = 8000;
const MAX_TAGS = 12;
const MAX_TAG_LEN = 40;
const MAX_PRICE = 1_000_000;
/** Upper bound for `limit`, so a public caller can't ask for the whole table in one query. */
const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 60;

/**
 * Validates the caller-supplied columns of a listing payload. Returns an error message, or null.
 *
 * These columns land in a typed table (`price` is a NOT NULL integer, `title` is NOT NULL), so
 * without this a wrong-typed field became a driver error and a 500 on what is really a bad
 * request. `partial` is for PATCH/PUT, where an absent key means "leave it alone" — but a key
 * that *is* present still has to be valid, which is what stops a spot being blanked out through
 * the generic update route.
 */
function validateListingPayload(body: any, { partial }: { partial: boolean }): string | null {
  for (const field of ['title', 'description', 'location'] as const) {
    const value = body[field];
    if (value === undefined) {
      if (partial) continue;
      return `${field} is required`;
    }
    if (typeof value !== 'string' || !value.trim()) return `${field} cannot be empty`;
  }
  const lengths: Array<[string, number]> = [
    ['title', MAX_TITLE_LEN], ['location', MAX_LOCATION_LEN], ['description', MAX_DESCRIPTION_LEN],
  ];
  for (const [field, max] of lengths) {
    if (typeof body[field] === 'string' && body[field].trim().length > max) {
      return `${field} must be ${max} characters or fewer`;
    }
  }

  if (body.type !== undefined && !LISTING_TYPES.includes(body.type)) {
    return `type must be one of: ${LISTING_TYPES.join(', ')}`;
  }

  if (body.price !== undefined && body.price !== null) {
    const price = Number(body.price);
    if (!Number.isInteger(price) || price < 0 || price > MAX_PRICE) {
      return 'price must be a whole number of rupees between 0 and 1000000';
    }
  }

  if (body.image !== undefined && body.image !== null && body.image !== '') {
    if (typeof body.image !== 'string' || !/^https?:\/\//i.test(body.image.trim())) {
      return 'image must be an http(s) URL';
    }
  }

  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) return 'tags must be an array';
    if (body.tags.length > MAX_TAGS) return `tags accepts at most ${MAX_TAGS} entries`;
    if (body.tags.some((tag: unknown) => typeof tag !== 'string' || !tag.trim() || tag.length > MAX_TAG_LEN)) {
      return `each tag must be a non-empty string of ${MAX_TAG_LEN} characters or fewer`;
    }
  }

  for (const axis of ['latitude', 'longitude'] as const) {
    const value = body[axis];
    if (value === undefined || value === null || value === '') continue;
    // Only real numbers count: a blank-ish value like " " coerces to 0 and would silently pin
    // the listing to the Gulf of Guinea rather than leaving the map unset.
    if (typeof value !== 'number' && typeof value !== 'string') return `${axis} must be a number`;
    const n = typeof value === 'number' ? value : Number(value.trim());
    if (!Number.isFinite(n) || (typeof value === 'string' && !value.trim())) {
      return `${axis} must be a number`;
    }
    const limit = axis === 'latitude' ? 90 : 180;
    if (n < -limit || n > limit) return `${axis} must be between -${limit} and ${limit}`;
  }

  return null;
}

/** Coordinate as stored: a finite number, or null when it was left unset. */
function coord(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

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
  // Clamped, not trusted: a negative value made Postgres reject the query outright (a 500 on a
  // public route) and a huge one pulled the whole table plus a review lookup for every row.
  const requestedLimit = parseInt(req.query.limit as string, 10);
  const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, MAX_PAGE_SIZE)
    : DEFAULT_PAGE_SIZE;

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
  const payloadError = validateListingPayload(req.body, { partial: false });
  if (payloadError) return res.status(400).json({ detail: payloadError });

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
    title: String(title).trim(),
    type,
    description: String(description).trim(),
    location: String(location).trim(),
    // Numeric strings are accepted here (a form input hands back "27.036"): the validator has
    // already confirmed they parse and are in range, so create and update agree on what's stored.
    latitude: coord(latitude),
    longitude: coord(longitude),
    price: price != null ? Number(price) : 0,
    image: typeof image === 'string' ? image.trim() : '',
    tags: Array.isArray(tags) ? tags.map((tag: string) => tag.trim()) : [],
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

  // Everything this route can write goes through the same rules as create. Without this the
  // generic update route was a way around the validation on /admin/spots for the very same rows.
  const payloadError = validateListingPayload(req.body, { partial: true });
  if (payloadError) return res.status(400).json({ detail: payloadError });

  // `type` is deliberately absent: a listing can never be re-typed, so a provider cannot
  // convert one of their own listings into an (admin-only) spot after the fact.
  const allowed = ['title', 'description', 'location', 'latitude', 'longitude', 'price', 'image', 'tags', 'extras'] as const;
  const updateFields: Record<string, any> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updateFields[key] = req.body[key];
    }
  }
  for (const key of ['title', 'description', 'location'] as const) {
    if (updateFields[key] !== undefined) updateFields[key] = String(updateFields[key]).trim();
  }
  if (updateFields.price !== undefined && updateFields.price !== null) {
    updateFields.price = Number(updateFields.price);
  }
  if (updateFields.image !== undefined) {
    updateFields.image = typeof updateFields.image === 'string' ? updateFields.image.trim() : '';
  }
  if (Array.isArray(updateFields.tags)) {
    updateFields.tags = updateFields.tags.map((tag: string) => tag.trim());
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

  // Range and finiteness are already settled by the validator above; this only normalises the
  // accepted forms to what the column stores. NaN is a number to `typeof`, which is how it used
  // to reach the database and produce a listing with an unplottable pin.
  for (const axis of ['latitude', 'longitude'] as const) {
    if (updateFields[axis] !== undefined) updateFields[axis] = coord(updateFields[axis]);
  }

  if (Object.keys(updateFields).length > 0) {
    await db.update(schema.listings).set(updateFields).where(eq(schema.listings.id, listing.id));
  }

  const [updated] = await db.select().from(schema.listings).where(eq(schema.listings.id, listing.id)).limit(1);
  // Another admin can delete the row between the update and this read; answer 404 rather than
  // throwing on an undefined row.
  if (!updated) return res.status(404).json({ detail: 'Not found' });
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
