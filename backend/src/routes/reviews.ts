import { Router, Request, Response } from 'express';
import { isCompleted } from '../lib/travellerDashboard';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { eq, and, desc } from 'drizzle-orm';
import { authenticateToken, optionalUser } from '../middleware/auth';
import { requireActiveSupport } from '../middleware/support';
import { SPOT_TYPE, isSpotPublished } from '../lib/spots';
import { routeParam } from '../lib/routeParam';
import { REFERRAL_CODE_IN_TEXT, REFERRAL_IN_REVIEW_DETAIL, reviewEligibility, type ReviewEligibility } from '../lib/reviewRules';
import { isExemptFromSupport, isSupportActive } from '../lib/support';

const router = Router();

// ============ REVIEWS ============
// Listing reviews and star ratings. One review per (user, listing); re-submitting edits it. Reading
// is public; writing/removing requires auth and touches only the caller's own review.

const MAX_COMMENT_LEN = 2000;
const MAX_REVIEW_PHOTOS = 6;
const MAX_PHOTO_URL_LEN = 2000;

function reviewOut(r: typeof schema.reviews.$inferSelect) {
  return {
    id: r.id,
    listing_id: r.listingId,
    user_id: r.userId,
    rating: r.rating,
    comment: r.comment,
    photos: r.photos || [],
    author_name: r.authorName,
    created_at: r.createdAt,
    updated_at: r.updatedAt,
  };
}

/** Validates the `photos` field of a review submission; returns the cleaned array or an error message. */
function parseReviewPhotos(value: unknown): { photos: string[] } | { error: string } {
  if (value === undefined) return { photos: [] };
  if (!Array.isArray(value)) return { error: 'photos must be an array' };
  if (value.length > MAX_REVIEW_PHOTOS) return { error: `photos accepts at most ${MAX_REVIEW_PHOTOS} entries` };
  const photos: string[] = [];
  for (const url of value) {
    if (typeof url !== 'string' || !url.trim()) return { error: 'each photo must be a non-empty URL string' };
    if (url.length > MAX_PHOTO_URL_LEN) return { error: 'photo URL is too long' };
    if (!/^https?:\/\//i.test(url)) return { error: 'each photo must be an http(s) URL' };
    photos.push(url.trim());
  }
  return { photos };
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
 *       200: { description: 'Reviews (newest first) and a { count, average } summary' }
 */
router.get('/listing/:listingId', async (req: Request, res: Response) => {
  const all = await db.select()
    .from(schema.reviews)
    .where(eq(schema.reviews.listingId, routeParam(req, 'listingId')))
    .orderBy(desc(schema.reviews.createdAt));

  // A signed-in reader never sees reviews by someone they blocked. The summary is counted over
  // what they see, so the number and the list agree.
  const viewer = await optionalUser(req);
  let rows = all;
  if (viewer) {
    const blocked = await db
      .select({ id: schema.userBlocks.blockedId })
      .from(schema.userBlocks)
      .where(eq(schema.userBlocks.blockerId, viewer.id));
    if (blocked.length) {
      const hidden = new Set(blocked.map((b) => b.id));
      rows = all.filter((r) => !hidden.has(r.userId));
    }
  }

  const count = rows.length;
  const average = count === 0 ? 0 : Math.round((rows.reduce((s, r) => s + r.rating, 0) / count) * 10) / 10;

  // Whether this reader may write a review, so the website and app can show "after a completed
  // booking" instead of a form the server would refuse. null when signed out.
  let canReviewOut: { allowed: boolean; code?: string } | null = null;
  if (viewer) {
    const listingId = routeParam(req, 'listingId');
    const [listing] = await db.select({ type: schema.listings.type }).from(schema.listings).where(eq(schema.listings.id, listingId)).limit(1);
    if (listing) {
      const verdict = await eligibilityFor(viewer, listingId, listing.type);
      canReviewOut = verdict.allowed ? { allowed: true } : { allowed: false, code: verdict.code };
    }
  }

  res.json({ summary: { count, average }, reviews: rows.map(reviewOut), can_review: canReviewOut });
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
 *               photos: { type: array, items: { type: string }, maxItems: 6, description: "http(s) URLs, e.g. from POST /listings/upload" }
 *     responses:
 *       200: { description: The saved review }
 *       400: { description: Invalid rating, comment, or photos }
 *       402:
 *         description: The caller's annual platform support fee is not active
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       403: { description: 'A homestay, driver or guide the caller has no completed booking with (code stay_required)' }
 *       404: { description: Listing not found }
 */
/** May this user review this listing? See lib/reviewRules.ts reviewEligibility. */
async function eligibilityFor(user: NonNullable<Request['user']>, listingId: string, listingType: string): Promise<ReviewEligibility> {
  const mine = await db.select({ status: schema.bookings.status, checkIn: schema.bookings.checkIn, checkOut: schema.bookings.checkOut })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.userId, user.id), eq(schema.bookings.listingId, listingId)));
  return reviewEligibility({
    listingType,
    hasCompletedBooking: mine.some((b) => isCompleted(b)),
    hasPass: isExemptFromSupport(user) || isSupportActive(user),
  });
}

/**
 * Anyone can review a place they finished a trip with. Otherwise pass holders can review, except
 * homestays, drivers and guides, which need a completed booking (403 stay_required).
 */
async function canReview(req: Request, res: Response, next: () => void) {
  const listingId = req.body?.listing_id;
  if (!listingId || typeof listingId !== 'string' || !req.user) return requireActiveSupport(req, res, next);
  const [listing] = await db.select({ type: schema.listings.type }).from(schema.listings).where(eq(schema.listings.id, listingId)).limit(1);
  // An unknown listing is the handler's 404, not a payment or stay question.
  if (!listing) return next();
  const verdict = await eligibilityFor(req.user, listingId, listing.type);
  if (verdict.allowed) return next();
  return res.status(verdict.code === 'stay_required' ? 403 : 402).json({ detail: verdict.detail, code: verdict.code });
}

router.post('/', authenticateToken, canReview, async (req: Request, res: Response) => {
  const { listing_id, rating, comment, photos } = req.body || {};

  if (!listing_id) return res.status(400).json({ detail: 'listing_id is required' });
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return res.status(400).json({ detail: 'rating must be a whole number from 1 to 5' });
  }
  const text = typeof comment === 'string' ? comment.trim() : '';
  if (text.length > MAX_COMMENT_LEN) {
    return res.status(400).json({ detail: `Comment must be ${MAX_COMMENT_LEN} characters or fewer` });
  }
  if (REFERRAL_CODE_IN_TEXT.test(text)) {
    return res.status(400).json({ detail: REFERRAL_IN_REVIEW_DETAIL, code: 'referral_code' });
  }
  const parsedPhotos = parseReviewPhotos(photos);
  if ('error' in parsedPhotos) return res.status(400).json({ detail: parsedPhotos.error });

  const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, listing_id)).limit(1);
  // A draft spot 404s everywhere else it is publicly reachable; it must not be reviewable either.
  if (!listing || (listing.type === SPOT_TYPE && !isSpotPublished(listing.extras))) {
    return res.status(404).json({ detail: 'Listing not found' });
  }

  const now = new Date().toISOString();
  const [row] = await db.insert(schema.reviews)
    .values({
      id: uuidv4(),
      userId: req.user.id,
      listingId: listing_id,
      rating,
      comment: text,
      photos: parsedPhotos.photos,
      authorName: req.user.name || 'Traveller',
      createdAt: now,
      updatedAt: null,
    })
    .onConflictDoUpdate({
      target: [schema.reviews.userId, schema.reviews.listingId],
      set: { rating, comment: text, photos: parsedPhotos.photos, authorName: req.user.name || 'Traveller', updatedAt: now },
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
  // Your own review, or any review as an admin acting on a report.
  const id = eq(schema.reviews.id, routeParam(req, 'id'));
  const deleted = await db.delete(schema.reviews)
    .where(req.user.role === 'admin' ? id : and(id, eq(schema.reviews.userId, req.user.id)))
    .returning();
  if (deleted.length === 0) return res.status(404).json({ detail: 'Review not found' });
  res.json({ ok: true });
});

export default router;
