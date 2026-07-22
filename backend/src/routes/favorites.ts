import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { requireActiveSupport } from '../middleware/support';

const router = Router();

// ============ FAVORITES ============
// A tourist's saved listings. One row per (user, listing), enforced by a DB-level unique index so
// a double-tap or two concurrent saves can't create duplicates. All routes require auth and act
// only on the caller's own rows.

/**
 * @openapi
 * /favorites:
 *   get:
 *     summary: List the current user's saved listings, enriched with listing summaries
 *     tags: [Favorites]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: The user's saved listings (newest first)
 *   post:
 *     summary: Save a listing to the current user's favorites
 *     tags: [Favorites]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [listing_id]
 *             properties:
 *               listing_id: { type: string }
 *     responses:
 *       200: { description: Saved (idempotent — saving an already-saved listing is a no-op) }
 *       402:
 *         description: The caller's annual platform support fee is not active
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       404: { description: Listing not found }
 */
// List the caller's saved listings, shaped like GET /listings items so the frontend's ListingCard
// renders them unchanged (including the provider_verified badge).
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  const rows = await db.select()
    .from(schema.favorites)
    .where(eq(schema.favorites.userId, req.user.id))
    .orderBy(desc(schema.favorites.createdAt));

  const listingIds = rows.map(r => r.listingId);
  if (listingIds.length === 0) return res.json({ items: [] });

  const listings = await db.select().from(schema.listings).where(inArray(schema.listings.id, listingIds));
  const listingById = new Map(listings.map(l => [l.id, l]));

  const providerIds = [...new Set(listings.map(l => l.providerId))];
  const providerRows = providerIds.length > 0
    ? await db.select({ id: schema.providers.id, kycStatus: schema.providers.kycStatus, status: schema.providers.status })
        .from(schema.providers)
        .where(inArray(schema.providers.id, providerIds))
    : [];
  const providerById = new Map(providerRows.map(p => [p.id, p]));

  // Preserve the favorites order (newest saved first); a listing that was deleted since it was
  // saved simply drops out rather than surfacing as a broken card.
  const items = rows
    .map(r => listingById.get(r.listingId))
    .filter((l): l is NonNullable<typeof l> => !!l)
    .map(l => {
      const provider = providerById.get(l.providerId);
      return {
        id: l.id,
        title: l.title,
        type: l.type,
        description: l.description,
        location: l.location,
        latitude: l.latitude,
        longitude: l.longitude,
        price: l.price,
        image: l.image,
        tags: l.tags,
        provider_id: l.providerId,
        extras: l.extras,
        created_at: l.createdAt,
        provider_verified: provider?.kycStatus === 'verified' && provider?.status === 'active',
      };
    });

  res.json({ items });
});

/**
 * @openapi
 * /favorites/ids:
 *   get:
 *     summary: Just the listing ids the current user has saved (for reflecting save-button state)
 *     tags: [Favorites]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Array of saved listing ids }
 */
// A lightweight companion to GET / — the frontend loads this once so every save button on a page
// can reflect its state without each one fetching the full enriched list.
router.get('/ids', authenticateToken, async (req: Request, res: Response) => {
  const rows = await db.select({ listingId: schema.favorites.listingId })
    .from(schema.favorites)
    .where(eq(schema.favorites.userId, req.user.id));
  res.json({ ids: rows.map(r => r.listingId) });
});

// Save a listing. Idempotent: onConflictDoNothing means re-saving an already-saved listing is a
// no-op success rather than a unique-violation error.
router.post('/', authenticateToken, requireActiveSupport, async (req: Request, res: Response) => {
  const { listing_id } = req.body || {};
  if (!listing_id) return res.status(400).json({ detail: 'listing_id is required' });

  const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, listing_id)).limit(1);
  if (!listing) return res.status(404).json({ detail: 'Listing not found' });

  await db.insert(schema.favorites)
    .values({ id: uuidv4(), userId: req.user.id, listingId: listing_id, createdAt: new Date().toISOString() })
    .onConflictDoNothing({ target: [schema.favorites.userId, schema.favorites.listingId] });

  res.json({ ok: true });
});

/**
 * @openapi
 * /favorites/{listingId}:
 *   delete:
 *     summary: Remove a listing from the current user's favorites
 *     tags: [Favorites]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: listingId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Removed (idempotent — removing a listing that wasn't saved is a no-op) }
 */
// Unsave a listing. Idempotent: removing something not saved is a no-op success.
router.delete('/:listingId', authenticateToken, async (req: Request, res: Response) => {
  await db.delete(schema.favorites)
    .where(and(
      eq(schema.favorites.userId, req.user.id),
      eq(schema.favorites.listingId, req.params.listingId as any)
    ));
  res.json({ ok: true });
});

export default router;
