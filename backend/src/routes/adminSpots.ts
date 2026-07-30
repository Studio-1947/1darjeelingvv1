import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import * as schema from '../schema';
import { and, eq, inArray } from 'drizzle-orm';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { storeBase64Image, ImageUploadError } from '../lib/imageUpload';
import {
  SPOT_TYPE, parseSpotExtras, spotOrdering, SpotValidationError, isSpotPublished,
} from '../lib/spots';

/**
 * Admin-only CRUD for tourist spots.
 *
 * Every route here is behind `authenticateToken + requireAdmin`, which is what makes
 * the section admin-owned; the public side (routes/listings.ts) only ever reads, and
 * refuses spot writes from anyone who is not an admin. Spots are stored as rows in
 * `listings` with `type='spot'` so they keep search, favourites, reviews and the
 * public detail page — see lib/spots.ts for the extras contract.
 */
const router = Router();

// Spots are curated by the platform rather than owned by a business. Attributing them to
// one synthetic provider id keeps the listings table's provider_id non-null and makes
// "who owns this" answerable, without inventing a provider row per place.
export const SPOT_PROVIDER_ID = 'admin-seed-provider';

const MAX_TITLE_LEN = 160;
const MAX_LOCATION_LEN = 160;
const MAX_DESCRIPTION_LEN = 8000;
const MAX_TAGS = 12;
const MAX_TAG_LEN = 40;
const MAX_PRICE = 1_000_000;

/** Shapes a spot row into the JSON the admin console consumes. */
function toAdminSpot(row: typeof schema.listings.$inferSelect, reviewCount = 0) {
  const extras = (row.extras || {}) as Record<string, any>;
  return {
    id: row.id,
    title: row.title,
    type: row.type,
    description: row.description,
    location: row.location,
    latitude: row.latitude,
    longitude: row.longitude,
    price: row.price,
    image: row.image,
    tags: row.tags,
    provider_id: row.providerId,
    created_at: row.createdAt,
    review_count: reviewCount,
    published: isSpotPublished(extras),
    featured: extras.featured === true,
    sort_order: Number.isInteger(extras.sort_order) ? extras.sort_order : 0,
    extras,
  };
}

/** Validates the non-extras columns of a spot payload. Returns an error message, or null. */
function validateCore(body: any, { partial }: { partial: boolean }): string | null {
  const required = ['title', 'description', 'location'] as const;
  for (const field of required) {
    const value = body[field];
    if (value === undefined) {
      if (partial) continue;
      return `${field} is required`;
    }
    if (typeof value !== 'string' || !value.trim()) return `${field} cannot be empty`;
  }
  if (typeof body.title === 'string' && body.title.trim().length > MAX_TITLE_LEN) {
    return `title must be ${MAX_TITLE_LEN} characters or fewer`;
  }
  if (typeof body.location === 'string' && body.location.trim().length > MAX_LOCATION_LEN) {
    return `location must be ${MAX_LOCATION_LEN} characters or fewer`;
  }
  if (typeof body.description === 'string' && body.description.trim().length > MAX_DESCRIPTION_LEN) {
    return `description must be ${MAX_DESCRIPTION_LEN} characters or fewer`;
  }
  if (body.price !== undefined && body.price !== null) {
    const price = Number(body.price);
    if (!Number.isInteger(price) || price < 0 || price > MAX_PRICE) {
      return 'price must be a whole number of rupees (0 for free entry)';
    }
  }
  if (body.image !== undefined && body.image !== null && body.image !== '') {
    if (typeof body.image !== 'string' || !/^https?:\/\//i.test(body.image.trim())) {
      return 'image must be an http(s) URL — upload the cover photo first';
    }
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags)) return 'tags must be an array';
    if (body.tags.length > MAX_TAGS) return `tags accepts at most ${MAX_TAGS} entries`;
    if (body.tags.some((tag: unknown) => typeof tag !== 'string' || !tag.trim() || tag.length > MAX_TAG_LEN)) {
      return `each tag must be a non-empty string of ${MAX_TAG_LEN} characters or fewer`;
    }
  }
  for (const coord of ['latitude', 'longitude'] as const) {
    const value = body[coord];
    if (value === undefined || value === null || value === '') continue;
    const n = Number(value);
    if (!Number.isFinite(n)) return `${coord} must be a number`;
    const limit = coord === 'latitude' ? 90 : 180;
    if (n < -limit || n > limit) return `${coord} must be between -${limit} and ${limit}`;
  }
  return null;
}

/** Coordinate as stored: a finite number, or null when the admin left the pin unset. */
function coord(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Review counts per spot id, so the console can warn before deleting a reviewed spot. */
async function reviewCounts(ids: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (ids.length === 0) return counts;
  const rows = await db.select({ listingId: schema.reviews.listingId })
    .from(schema.reviews)
    .where(inArray(schema.reviews.listingId, ids));
  for (const row of rows) counts.set(row.listingId, (counts.get(row.listingId) || 0) + 1);
  return counts;
}

/**
 * @openapi
 * /admin/spots:
 *   get:
 *     summary: List every tourist spot, including unpublished drafts (admin only)
 *     tags: [Admin, Spots]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: All spots in public display order (featured first, then sort order)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items: { type: array, items: { $ref: '#/components/schemas/Spot' } }
 *                 total: { type: integer }
 *       403:
 *         description: Not an admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.get('/admin/spots', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const rows = await db.select()
    .from(schema.listings)
    .where(eq(schema.listings.type, SPOT_TYPE))
    .orderBy(...spotOrdering());
  const counts = await reviewCounts(rows.map(r => r.id));
  res.json({ items: rows.map(row => toAdminSpot(row, counts.get(row.id) || 0)), total: rows.length });
});

/**
 * @openapi
 * /admin/spots/upload:
 *   post:
 *     summary: Upload a spot photo and get its public URL (admin only)
 *     description: Accepts a base64 data URL, stores it in the public bucket, max 20 MB decoded.
 *     tags: [Admin, Spots]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [file, filename]
 *             properties:
 *               file: { type: string, description: "data:image/*;base64,... payload" }
 *               filename: { type: string }
 *     responses:
 *       200:
 *         description: Stored image URL
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url: { type: string }
 *       400:
 *         description: Missing, empty or oversized image
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/admin/spots/upload', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  try {
    const url = await storeBase64Image(req.body?.file, req.body?.filename);
    res.json({ url });
  } catch (err: any) {
    if (err instanceof ImageUploadError) return res.status(400).json({ detail: err.message });
    res.status(500).json({ detail: err.message || 'Upload failed' });
  }
});

/**
 * @openapi
 * /admin/spots:
 *   post:
 *     summary: Create a tourist spot (admin only)
 *     tags: [Admin, Spots]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/SpotInput' }
 *     responses:
 *       200:
 *         description: The created spot
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 item: { $ref: '#/components/schemas/Spot' }
 *       400:
 *         description: Invalid payload
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       409:
 *         description: A spot with this title already exists
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
router.post('/admin/spots', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const body = req.body || {};
  const coreError = validateCore(body, { partial: false });
  if (coreError) return res.status(400).json({ detail: coreError });

  let extras;
  try {
    extras = parseSpotExtras(body.extras);
  } catch (err) {
    if (err instanceof SpotValidationError) return res.status(400).json({ detail: err.message });
    throw err;
  }

  const title = String(body.title).trim();
  // Titles double as the key for the frontend's curated editorial content, and a duplicate
  // spot is nearly always an accidental re-submit rather than two genuinely distinct places.
  const [duplicate] = await db.select({ id: schema.listings.id })
    .from(schema.listings)
    .where(and(eq(schema.listings.type, SPOT_TYPE), eq(schema.listings.title, title)))
    .limit(1);
  if (duplicate) {
    return res.status(409).json({ detail: `A tourist spot titled "${title}" already exists` });
  }

  const row = {
    id: uuidv4(),
    title,
    type: SPOT_TYPE,
    description: String(body.description).trim(),
    location: String(body.location).trim(),
    latitude: coord(body.latitude),
    longitude: coord(body.longitude),
    price: body.price != null ? Number(body.price) : 0,
    image: typeof body.image === 'string' ? body.image.trim() : '',
    tags: Array.isArray(body.tags) ? body.tags.map((tag: string) => tag.trim()) : [],
    providerId: SPOT_PROVIDER_ID,
    extras,
    createdAt: new Date().toISOString(),
  };

  await db.insert(schema.listings).values(row);
  res.json({ item: toAdminSpot(row as typeof schema.listings.$inferSelect) });
});

/** Loads a spot by id, or answers 404 — a non-spot listing id is not addressable here. */
async function loadSpot(req: Request, res: Response) {
  const [row] = await db.select().from(schema.listings)
    .where(and(eq(schema.listings.id, req.params.id as any), eq(schema.listings.type, SPOT_TYPE)))
    .limit(1);
  if (!row) {
    res.status(404).json({ detail: 'Tourist spot not found' });
    return null;
  }
  return row;
}

/**
 * @openapi
 * /admin/spots/{id}:
 *   patch:
 *     summary: Update a tourist spot (admin only)
 *     description: >
 *       Partial update. Any `extras` key left out keeps its stored value, so sending only
 *       `{"extras":{"published":false}}` unpublishes a spot without touching its gallery.
 *     tags: [Admin, Spots]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/SpotInput' }
 *     responses:
 *       200:
 *         description: The updated spot
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 item: { $ref: '#/components/schemas/Spot' }
 *       400:
 *         description: Invalid payload
 *       404:
 *         description: No spot with this id
 *       409:
 *         description: Another spot already uses this title
 */
const updateSpot = async (req: Request, res: Response) => {
  const existing = await loadSpot(req, res);
  if (!existing) return;

  const body = req.body || {};
  const coreError = validateCore(body, { partial: true });
  if (coreError) return res.status(400).json({ detail: coreError });

  let extras;
  try {
    extras = parseSpotExtras(body.extras ?? {}, (existing.extras || {}) as Record<string, any>);
  } catch (err) {
    if (err instanceof SpotValidationError) return res.status(400).json({ detail: err.message });
    throw err;
  }

  const updates: Record<string, any> = { extras };
  if (body.title !== undefined) {
    const title = String(body.title).trim();
    if (title !== existing.title) {
      const [duplicate] = await db.select({ id: schema.listings.id })
        .from(schema.listings)
        .where(and(eq(schema.listings.type, SPOT_TYPE), eq(schema.listings.title, title)))
        .limit(1);
      if (duplicate && duplicate.id !== existing.id) {
        return res.status(409).json({ detail: `A tourist spot titled "${title}" already exists` });
      }
    }
    updates.title = title;
  }
  if (body.description !== undefined) updates.description = String(body.description).trim();
  if (body.location !== undefined) updates.location = String(body.location).trim();
  if (body.latitude !== undefined) updates.latitude = coord(body.latitude);
  if (body.longitude !== undefined) updates.longitude = coord(body.longitude);
  if (body.price !== undefined && body.price !== null) updates.price = Number(body.price);
  if (body.image !== undefined) updates.image = typeof body.image === 'string' ? body.image.trim() : '';
  if (body.tags !== undefined) updates.tags = body.tags.map((tag: string) => tag.trim());

  await db.update(schema.listings).set(updates).where(eq(schema.listings.id, existing.id));
  const [updated] = await db.select().from(schema.listings).where(eq(schema.listings.id, existing.id)).limit(1);
  const counts = await reviewCounts([existing.id]);
  res.json({ item: toAdminSpot(updated, counts.get(existing.id) || 0) });
};

router.patch('/admin/spots/:id', authenticateToken, requireAdmin, updateSpot);
router.put('/admin/spots/:id', authenticateToken, requireAdmin, updateSpot);

/**
 * @openapi
 * /admin/spots/{id}/publish:
 *   post:
 *     summary: Publish or unpublish a tourist spot (admin only)
 *     tags: [Admin, Spots]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [published]
 *             properties:
 *               published: { type: boolean }
 *     responses:
 *       200:
 *         description: The updated spot
 *       400:
 *         description: published must be a boolean
 *       404:
 *         description: No spot with this id
 */
router.post('/admin/spots/:id/publish', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const existing = await loadSpot(req, res);
  if (!existing) return;

  const { published } = req.body || {};
  if (typeof published !== 'boolean') {
    return res.status(400).json({ detail: 'published must be a boolean' });
  }

  const extras = parseSpotExtras({ published }, (existing.extras || {}) as Record<string, any>);
  await db.update(schema.listings).set({ extras }).where(eq(schema.listings.id, existing.id));
  const [updated] = await db.select().from(schema.listings).where(eq(schema.listings.id, existing.id)).limit(1);
  res.json({ item: toAdminSpot(updated) });
});

/**
 * @openapi
 * /admin/spots/{id}:
 *   delete:
 *     summary: Delete a tourist spot (admin only)
 *     description: Cascades to the spot's favourites and reviews via their foreign keys.
 *     tags: [Admin, Spots]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *       404:
 *         description: No spot with this id
 */
router.delete('/admin/spots/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const existing = await loadSpot(req, res);
  if (!existing) return;
  await db.delete(schema.listings).where(eq(schema.listings.id, existing.id));
  res.json({ ok: true });
});

export default router;
