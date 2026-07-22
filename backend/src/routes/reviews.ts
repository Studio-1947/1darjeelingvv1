import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { eq, and, desc } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// ============ REVIEWS ============
// Listing reviews and star ratings. One review per (user, listing); re-submitting edits it. Reading
// is public; writing/removing requires auth and touches only the caller's own review.

const MAX_COMMENT_LEN = 2000;

function reviewOut(r: typeof schema.reviews.$inferSelect) {
  return {
    id: r.id,
    listing_id: r.listingId,
    user_id: r.userId,
    rating: r.rating,
    comment: r.comment,
    author_name: r.authorName,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

/**
 * @openapi
 * /reviews/listing/{listingId}:
 *   get:
 *     summary: Public reviews for a listing, with the rating summary (count + average)
 *     tags: [Reviews]
 *     parameters:
 *       - in: path
 *         name: listingId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Reviews (newest first) and a { count, average } summary }
 */
router.get('/listing/:listingId', async (req: Request, res: Response) => {
  const rows = await db.select()
    .from(schema.reviews)
    .where(eq(schema.reviews.listingId, req.params.listingId as any))
    .orderBy(desc(schema.reviews.createdAt));

  const count = rows.length;
  const average = count === 0 ? 0 : Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10;

  res.json({ summary: { count, average }, reviews: rows.map(reviewOut) });
});

/**
 * @openapi
 * /reviews:
 *   post:
 *     summary: Create or update the current user's review for a listing
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [listing_id, rating]
 *             properties:
 *               listing_id: { type: string }
 *               rating: { type: integer, minimum: 1, maximum: 5 }
 *               comment: { type: string }
 *     responses:
 *       200: { description: The saved review }
 *       400: { description: Invalid rating or comment }
 *       404: { description: Listing not found }
 */
router.post('/', authenticateToken, async (req: Request, res: Response) => {
  const { listing_id, rating, comment } = req.body || {};

  if (!listing_id) return res.status(400).json({ detail: 'listing_id is required' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ detail: 'rating must be a whole number from 1 to 5' });
  }
  const text = typeof comment === 'string' ? comment.trim() : '';
  if (text.length > MAX_COMMENT_LEN) {
    return res.status(400).json({ detail: `Comment must be ${MAX_COMMENT_LEN} characters or fewer` });
  }

  const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, listing_id)).limit(1);
  if (!listing) return res.status(404).json({ detail: 'Listing not found' });

  const now = new Date().toISOString();
  const [row] = await db.insert(schema.reviews)
    .values({
      id: uuidv4(),
      userId: req.user.id,
      listingId: listing_id,
      rating,
      comment: text,
      authorName: req.user.name || 'Traveller',
      createdAt: now,
      updatedAt: null,
    })
    .onConflictDoUpdate({
      target: [schema.reviews.userId, schema.reviews.listingId],
      set: { rating, comment: text, authorName: req.user.name || 'Traveller', updatedAt: now },
    })
    .returning();

  res.json({ review: reviewOut(row) });
});

/**
 * @openapi
 * /reviews/{id}:
 *   delete:
 *     summary: Delete the current user's own review
 *     tags: [Reviews]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Removed }
 *       404: { description: No such review owned by the caller }
 */
router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  const deleted = await db.delete(schema.reviews)
    .where(and(eq(schema.reviews.id, req.params.id as any), eq(schema.reviews.userId, req.user.id)))
    .returning();
  if (deleted.length === 0) return res.status(404).json({ detail: 'Review not found' });
  res.json({ ok: true });
});

export default router;
