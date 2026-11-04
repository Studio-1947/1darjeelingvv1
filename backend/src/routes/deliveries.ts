import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import { authenticateToken } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { requireTravellerMode } from '../middleware/mode';
import { addHostNotification, addInAppNotification } from '../lib/inApp';
import { ownListingIds } from '../lib/hostAccess';
import { isListingHostLapsed } from '../lib/hostPlan';
import { isPlausiblePhone } from '../lib/phone';

const router = Router();

/**
 * Home delivery (board: Restaurant / Cafe -> "Asking for home delivery"). A traveller picks items
 * from a cafe's menu or a shop's goods, gives an address and a phone, and the host answers:
 * accepted or declined, then delivered. Payment is between them, as with every booking.
 */
const STATUSES = ['accepted', 'declined', 'delivered'] as const;
const MAX_ITEMS = 20;

function out(r: typeof schema.deliveryRequests.$inferSelect, extra: Record<string, unknown> = {}) {
  return {
    id: r.id, listing_id: r.listingId, items: r.items, address: r.address, phone: r.phone, note: r.note,
    status: r.status, host_note: r.hostNote, created_at: r.createdAt, updated_at: r.updatedAt, ...extra,
  };
}

/**
 * @openapi
 * /deliveries:
 *   post:
 *     summary: Ask a cafe, restaurant or shop with home delivery to deliver
 *     tags: [Deliveries]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/', authenticateToken, requireTravellerMode, rateLimiter(20, 60 * 60 * 1000, 'delivery_request'), async (req: Request, res: Response) => {
  const { listing_id, items, address, phone, note } = req.body || {};
  const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, String(listing_id || ''))).limit(1);
  if (!listing) return res.status(404).json({ detail: 'Listing not found' });
  if (!['cafe', 'shop', 'homestay'].includes(listing.type) || listing.extras?.home_delivery !== true) {
    return res.status(400).json({ detail: 'This place does not offer home delivery' });
  }
  if (await isListingHostLapsed(listing.providerId)) return res.status(409).json({ detail: 'This place is not taking requests right now' });
  if (listing.extras?.available === false) return res.status(409).json({ detail: 'This place is not taking requests right now', code: 'unavailable' });

  const list = Array.isArray(items) ? items : [];
  const clean = list
    .map((i: any) => ({ name: String(i?.name ?? '').trim().slice(0, 80), qty: Math.min(Math.max(parseInt(i?.qty, 10) || 1, 1), 50), price: Number(i?.price) > 0 ? Number(i.price) : undefined }))
    .filter((i) => i.name);
  if (!clean.length) return res.status(400).json({ detail: 'Pick at least one item' });
  if (clean.length > MAX_ITEMS) return res.status(400).json({ detail: `At most ${MAX_ITEMS} items` });
  const addr = typeof address === 'string' ? address.trim() : '';
  if (addr.length < 8 || addr.length > 300) return res.status(400).json({ detail: 'Add the delivery address (8 to 300 characters)' });
  const ph = typeof phone === 'string' && phone.trim() ? phone.trim() : req.user.phone;
  if (!isPlausiblePhone(ph)) return res.status(400).json({ detail: 'Add a phone number the place can call' });

  const now = new Date().toISOString();
  const [row] = await db.insert(schema.deliveryRequests).values({
    id: uuidv4(), userId: req.user.id, listingId: listing.id, providerId: listing.providerId,
    items: clean, address: addr, phone: ph, note: typeof note === 'string' ? note.trim().slice(0, 500) : '',
    status: 'open', createdAt: now, updatedAt: null,
  }).returning();

  const summary = clean.map((i) => `${i.qty} × ${i.name}`).join(', ');
  await addHostNotification(listing.providerId, {
    kind: 'delivery_request', title: `Home delivery request: ${listing.title}`,
    body: `${req.user.name || 'A traveller'} asks for ${summary}. Deliver to ${addr}.`, refId: row.id,
  });
  res.status(201).json({ request: out(row, { listing_title: listing.title }) });
});

/** The traveller's own requests, newest first. */
router.get('/mine', authenticateToken, async (req: Request, res: Response) => {
  const rows = await db.select({ d: schema.deliveryRequests, title: schema.listings.title }).from(schema.deliveryRequests)
    .innerJoin(schema.listings, eq(schema.listings.id, schema.deliveryRequests.listingId))
    .where(eq(schema.deliveryRequests.userId, req.user.id)).orderBy(desc(schema.deliveryRequests.createdAt)).limit(50);
  res.json({ items: rows.map(({ d, title }) => out(d, { listing_title: title })) });
});

/** Requests to the host's own places, newest first, with who asked. */
router.get('/host', authenticateToken, async (req: Request, res: Response) => {
  const ids = await ownListingIds(req.user.id);
  if (!ids.length) return res.json({ items: [] });
  const rows = await db.select({ d: schema.deliveryRequests, title: schema.listings.title, name: schema.users.name })
    .from(schema.deliveryRequests)
    .innerJoin(schema.listings, eq(schema.listings.id, schema.deliveryRequests.listingId))
    .innerJoin(schema.users, eq(schema.users.id, schema.deliveryRequests.userId))
    .where(inArray(schema.deliveryRequests.providerId, ids)).orderBy(desc(schema.deliveryRequests.createdAt)).limit(100);
  res.json({ items: rows.map(({ d, title, name }) => out(d, { listing_title: title, customer: { name } })) });
});

/** The host answers: accepted, declined, then delivered. The traveller is told each time. */
router.patch('/:id', authenticateToken, async (req: Request, res: Response) => {
  const status = req.body?.status;
  if (!(STATUSES as readonly string[]).includes(status)) return res.status(400).json({ detail: `status must be one of ${STATUSES.join(', ')}` });
  const ids = await ownListingIds(req.user.id);
  const [row] = await db.select().from(schema.deliveryRequests)
    .where(and(eq(schema.deliveryRequests.id, String(req.params.id)), ids.length ? inArray(schema.deliveryRequests.providerId, ids) : eq(schema.deliveryRequests.id, '__none__'))).limit(1);
  if (!row) return res.status(404).json({ detail: 'Request not found' });
  const order: Record<string, string[]> = { open: ['accepted', 'declined'], accepted: ['delivered', 'declined'] };
  if (!order[row.status]?.includes(status)) return res.status(409).json({ detail: `A ${row.status} request cannot become ${status}` });
  const hostNote = typeof req.body?.host_note === 'string' ? req.body.host_note.trim().slice(0, 300) : row.hostNote;
  const [updated] = await db.update(schema.deliveryRequests)
    .set({ status, hostNote, updatedAt: new Date().toISOString() }).where(eq(schema.deliveryRequests.id, row.id)).returning();
  const [listing] = await db.select({ title: schema.listings.title }).from(schema.listings).where(eq(schema.listings.id, row.listingId)).limit(1);
  const words: Record<string, string> = { accepted: 'is on its way soon', declined: 'could not be taken', delivered: 'has been delivered' };
  await addInAppNotification(row.userId, {
    kind: `delivery_${status}`, title: `${listing?.title || 'Your order'}: ${status}`,
    body: `Your home delivery request ${words[status]}.${hostNote ? ` ${hostNote}` : ''}`, refId: row.id,
  });
  res.json({ request: out(updated) });
});

/** The traveller can cancel while the host has not answered. */
router.post('/:id/cancel', authenticateToken, async (req: Request, res: Response) => {
  const [row] = await db.select().from(schema.deliveryRequests)
    .where(and(eq(schema.deliveryRequests.id, String(req.params.id)), eq(schema.deliveryRequests.userId, req.user.id))).limit(1);
  if (!row) return res.status(404).json({ detail: 'Request not found' });
  if (row.status !== 'open') return res.status(409).json({ detail: 'The place has already answered' });
  const [updated] = await db.update(schema.deliveryRequests).set({ status: 'cancelled', updatedAt: new Date().toISOString() })
    .where(eq(schema.deliveryRequests.id, row.id)).returning();
  res.json({ request: out(updated) });
});

export default router;
