import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { and, eq, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { routeParam } from '../lib/routeParam';
import { normQuery, scrubQuery, searchHour, searchInsights } from '../lib/searchEvents';

/**
 * The search log (lib/searchEvents.ts): the website sends a search once its results have settled
 * on screen, and the result opened, if any. No sign-in, nothing about the person: a random code
 * for the browser visit, the words (cleaned here again), the category and the counts.
 *
 *   POST  /api/search-events             { session, q, type?, surface, source, results, fallback }
 *   PATCH /api/search-events/:id/opened  { session, listing_id, rank }
 *   GET   /api/admin/search-insights?days=30&type=homestay
 */
const router = Router();
// A person searching sends a few a minute; 30 keeps one address from flooding the report.
const log = rateLimiter(30, 60 * 1000, 'search_events');

const SESSION = /^[A-Za-z0-9_-]{8,64}$/;
const TYPES = new Set(['spot', 'homestay', 'driver', 'guide', 'shop', 'cafe', 'event', 'biodiversity', 'food']);

router.post('/search-events', log, async (req: Request, res: Response) => {
  const b = req.body || {};
  const session = typeof b.session === 'string' && SESSION.test(b.session) ? b.session : null;
  const q = scrubQuery(typeof b.q === 'string' ? b.q : '');
  if (!session || !q) return res.status(400).json({ detail: 'session and q are needed', code: 'bad_search_event' });
  const results = Number.isInteger(b.results) && b.results >= 0 ? Math.min(b.results, 100_000) : 0;
  const id = uuidv4();
  await db.insert(schema.searchEvents).values({
    id,
    session,
    q,
    qNorm: normQuery(q),
    type: typeof b.type === 'string' && TYPES.has(b.type) ? b.type : null,
    surface: b.surface === 'sheet' ? 'sheet' : 'category',
    source: b.source === 'voice' ? 'voice' : 'typed',
    results,
    fallback: b.fallback === true,
    createdAt: searchHour(),
  });
  res.status(201).json({ id });
});

router.patch('/search-events/:id/opened', log, async (req: Request, res: Response) => {
  const id = routeParam(req, 'id');
  const b = req.body || {};
  const session = typeof b.session === 'string' && SESSION.test(b.session) ? b.session : null;
  const listingId = typeof b.listing_id === 'string' && b.listing_id.length <= 64 ? b.listing_id : null;
  if (!id || !session || !listingId) return res.status(400).json({ detail: 'session and listing_id are needed', code: 'bad_search_event' });
  const rank = Number.isInteger(b.rank) && b.rank >= 1 ? Math.min(b.rank, 10_000) : null;
  // Only the visit that made the search can say what it opened, and only the first open counts.
  await db.update(schema.searchEvents)
    .set({ openedListingId: listingId, openedRank: rank })
    .where(and(eq(schema.searchEvents.id, id), eq(schema.searchEvents.session, session), isNull(schema.searchEvents.openedListingId)));
  res.status(204).end();
});

router.get('/admin/search-insights', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const days = [7, 30, 90, 180].includes(Number(req.query.days)) ? Number(req.query.days) : 30;
  const type = typeof req.query.type === 'string' && TYPES.has(req.query.type) ? req.query.type : null;
  res.json(await searchInsights(days, type));
});

export default router;
