import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { eq, or, and, ilike, inArray } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import fs from 'fs';
import path from 'path';
import { uploadToMinIO } from '../lib/s3';

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
 *       authenticated users (e.g. tourists) are rejected.
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
// Get list of listings with filter
router.get('/', async (req: Request, res: Response) => {
  const type = req.query.type as string | undefined;
  const q = req.query.q as string | undefined;
  const limit = parseInt(req.query.limit as string) || 60;

  const conditions = [];
  if (type) {
    conditions.push(eq(schema.listings.type, type));
  }
  if (q) {
    conditions.push(
      or(
        ilike(schema.listings.title, `%${q}%`),
        ilike(schema.listings.description, `%${q}%`),
        ilike(schema.listings.location, `%${q}%`)
      )
    );
  }

  const items = await db.select()
    .from(schema.listings)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .limit(limit);

  const providerIds = [...new Set(items.map(item => item.providerId))];
  const providerRows = providerIds.length > 0
    ? await db.select({ id: schema.providers.id, kycStatus: schema.providers.kycStatus, status: schema.providers.status })
        .from(schema.providers)
        .where(inArray(schema.providers.id, providerIds))
    : [];
  const providerById = new Map(providerRows.map(p => [p.id, p]));

  const itemsReturn = items.map(item => {
    const provider = providerById.get(item.providerId);
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

  const [provider] = await db.select({ kycStatus: schema.providers.kycStatus, status: schema.providers.status })
    .from(schema.providers)
    .where(eq(schema.providers.id, item.providerId))
    .limit(1);

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
    extras,
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
  if (req.user.role === 'admin') return true;
  const ownProviderId = await resolveOwnProviderId(req.user.id);
  return !!ownProviderId && ownProviderId === listing.providerId;
}

// Upload image (returns local server URL)
router.post('/upload', authenticateToken, async (req: Request, res: Response) => {
  const { file, filename } = req.body;
  if (!file || !filename) {
    return res.status(400).json({ detail: 'File payload and filename are required' });
  }

  try {
    // Decode base64 file data
    const base64Data = file.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, 'base64');

    // Create unique key
    const ext = path.extname(filename) || '.jpg';
    const uniqueKey = `${uuidv4()}${ext}`;

    // Get Content-Type
    const match = file.match(/^data:(\w+\/\w+);base64,/);
    const contentType = match ? match[1] : 'image/jpeg';

    const fileUrl = await uploadToMinIO(buffer, uniqueKey, contentType);
    res.json({ url: fileUrl });
  } catch (err: any) {
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
    return res.status(403).json({ detail: 'You do not have permission to edit this listing' });
  }

  const allowed = ['title', 'description', 'location', 'price', 'image', 'tags', 'extras'] as const;
  const updateFields: Record<string, any> = {};
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      updateFields[key] = req.body[key];
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
    return res.status(403).json({ detail: 'You do not have permission to delete this listing' });
  }

  await db.delete(schema.listings).where(eq(schema.listings.id, listing.id));
  res.json({ ok: true });
});

export default router;
