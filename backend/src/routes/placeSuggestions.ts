import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { and, desc, eq, gte, sql } from 'drizzle-orm';

import { db, schema } from '../db';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { routeParam } from '../lib/routeParam';
import { checkNameLike, checkPostText, tidyText } from '../lib/contentRules';
import { addInAppNotification } from '../lib/inApp';
import { emailEnabled, renderEmail, sendEmail } from '../lib/email';
import { log } from '../config';
import { createSpot, toAdminSpot } from './adminSpots';

/**
 * Suggest a place (prototype spots.js): anyone signed in, a guest or a host, proposes a spot aangan
 * is missing: its name, the town it is near, an optional area or landmark, a few lines about it,
 * the entry ticket (none is free) and up to four photos uploaded first through /listings/upload.
 *
 * A suggestion waits for the aangan team. Approving it creates an unpublished spot through the same
 * code the admin spot form uses (routes/adminSpots.ts createSpot), so the team checks the details and
 * publishes it from Tourist spots; rejecting it keeps a short note for the sender. Either way the
 * sender is told in the app (and by email when set up).
 */
const router = Router();

export const MAX_SUGGESTION_PHOTOS = 4;
const MAX_NAME = 120;
const MAX_PLACE = 80;
const MAX_AREA = 80;
export const MIN_DETAILS = 20;
const MAX_DETAILS = 2000;
const MAX_PRICE = 100_000;
const MAX_NOTE = 300;
/** A real person suggests a few places; a script suggests hundreds. */
export const MAX_SUGGESTIONS_PER_DAY = 10;

type Suggestion = typeof schema.placeSuggestions.$inferSelect;

function out(s: Suggestion) {
  return {
    id: s.id,
    name: s.name,
    place: s.place,
    details: s.details,
    entry_price: s.entryPrice,
    photos: s.photos || [],
    status: s.status,
    review_note: s.reviewNote,
    listing_id: s.listingId,
    created_at: s.createdAt,
    reviewed_at: s.reviewedAt,
  };
}

type Parsed = { name: string; place: string; details: string; entryPrice: number | null; photos: string[] };

/** Checks a suggestion. `area` (optional) is folded into the place as "area, town". */
export function parseSuggestion(body: any): Parsed | { error: string } {
  body = body || {};
  const name = checkNameLike(body.name, 'Name of the place', MAX_NAME);
  if ('error' in name) return name;

  const town = checkNameLike(body.place, 'Place', MAX_PLACE);
  if ('error' in town) return town;
  let place = town.value;
  if (body.area !== undefined && body.area !== null && body.area !== '') {
    if (typeof body.area !== 'string') return { error: 'Area must be text' };
    const area = tidyText(body.area);
    if (area.length > MAX_AREA) return { error: `Area must be ${MAX_AREA} characters or fewer` };
    if (area) place = `${area}, ${place}`;
  }

  if (typeof body.details !== 'string') return { error: 'Add a few lines about the place' };
  const details = body.details.trim();
  if (details.length < MIN_DETAILS) return { error: `Add a few lines about the place (${MIN_DETAILS}+ characters)` };
  if (details.length > MAX_DETAILS) return { error: `Details must be ${MAX_DETAILS} characters or fewer` };
  const problem = checkPostText(details);
  if (problem) return { error: 'The details do not look like real words. Write them as travellers will read them.' };

  let entryPrice: number | null = null;
  const raw = body.entry_price;
  if (raw !== undefined && raw !== null && raw !== '') {
    const n = typeof raw === 'string' ? Number(raw) : raw;
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > MAX_PRICE) {
      return { error: `Entry price must be a whole number of rupees from 0 to ${MAX_PRICE} (0 or empty for free entry)` };
    }
    entryPrice = n;
  }

  const photos: string[] = [];
  if (body.photos !== undefined && body.photos !== null) {
    if (!Array.isArray(body.photos)) return { error: 'photos must be a list' };
    if (body.photos.length > MAX_SUGGESTION_PHOTOS) return { error: `Add at most ${MAX_SUGGESTION_PHOTOS} photos` };
    for (const url of body.photos) {
      if (typeof url !== 'string' || url.length > 2000 || !/^https?:\/\/\S+$/i.test(url.trim())) {
        return { error: 'Each photo must be uploaded first' };
      }
      photos.push(url.trim());
    }
  }
  return { name: name.value, place, details, entryPrice, photos };
}

/**
 * @openapi
 * /spots/suggestions:
 *   post:
 *     summary: Suggest a place aangan is missing (signed in; waits for the aangan team)
 *     tags: [Spots]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, place, details]
 *             properties:
 *               name: { type: string, maxLength: 120 }
 *               place: { type: string, maxLength: 80, description: "The town it is near, e.g. Darjeeling" }
 *               area: { type: string, maxLength: 80, description: "Optional area or landmark; stored as 'area, place'" }
 *               details: { type: string, minLength: 20, maxLength: 2000 }
 *               entry_price: { type: integer, minimum: 0, description: "Ticket per person in rupees; empty or 0 is free entry" }
 *               photos: { type: array, maxItems: 4, items: { type: string }, description: "URLs from POST /listings/upload" }
 *     responses:
 *       201: { description: The suggestion, status pending }
 *       400: { description: A field failed validation }
 *       429: { description: Too many suggestions today }
 */
router.post('/spots/suggestions', authenticateToken, rateLimiter(20, 60 * 60 * 1000, 'place_suggest'), async (req: Request, res: Response) => {
  const parsed = parseSuggestion(req.body);
  if ('error' in parsed) return res.status(400).json({ detail: parsed.error });

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.placeSuggestions)
    .where(and(eq(schema.placeSuggestions.userId, req.user!.id), gte(schema.placeSuggestions.createdAt, dayAgo)));
  if (Number(n) >= MAX_SUGGESTIONS_PER_DAY) {
    return res.status(429).json({ detail: `You can suggest up to ${MAX_SUGGESTIONS_PER_DAY} places a day` });
  }

  const [row] = await db.insert(schema.placeSuggestions).values({
    id: uuidv4(),
    userId: req.user!.id,
    name: parsed.name,
    place: parsed.place,
    details: parsed.details,
    entryPrice: parsed.entryPrice,
    photos: parsed.photos,
    status: 'pending',
    createdAt: new Date().toISOString(),
  }).returning();
  res.status(201).json({ suggestion: out(row) });
});

/**
 * @openapi
 * /spots/suggestions/mine:
 *   get:
 *     summary: The places the signed-in person suggested, newest first, with where each one stands
 *     tags: [Spots]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: "{ suggestions: [...] }; status is pending, approved or rejected" }
 */
router.get('/spots/suggestions/mine', authenticateToken, async (req: Request, res: Response) => {
  const rows = await db.select().from(schema.placeSuggestions)
    .where(eq(schema.placeSuggestions.userId, req.user!.id))
    .orderBy(desc(schema.placeSuggestions.createdAt))
    .limit(50);
  res.json({ suggestions: rows.map(out) });
});

/**
 * @openapi
 * /admin/spots/suggestions:
 *   get:
 *     summary: Place suggestions to review, newest first (admin)
 *     tags: [Admin, Spots]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: status, schema: { type: string, enum: [pending, approved, rejected, all] }, description: "Default pending" }
 *     responses:
 *       200: { description: "{ items: [...], counts: { pending, approved, rejected } } with who sent each one" }
 */
router.get('/admin/spots/suggestions', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const status = typeof req.query.status === 'string' ? req.query.status : 'pending';
  if (!['pending', 'approved', 'rejected', 'all'].includes(status)) {
    return res.status(400).json({ detail: 'status must be pending, approved, rejected or all' });
  }
  const rows = await db.select({ s: schema.placeSuggestions, name: schema.users.name, phone: schema.users.phone })
    .from(schema.placeSuggestions)
    .innerJoin(schema.users, eq(schema.users.id, schema.placeSuggestions.userId))
    .where(status === 'all' ? undefined : eq(schema.placeSuggestions.status, status))
    .orderBy(desc(schema.placeSuggestions.createdAt))
    .limit(200);
  const counts = await db.select({ status: schema.placeSuggestions.status, n: sql<number>`count(*)::int` })
    .from(schema.placeSuggestions).groupBy(schema.placeSuggestions.status);
  res.json({
    items: rows.map(({ s, name, phone }) => ({ ...out(s), user: { id: s.userId, name, phone }, reviewed_by: s.reviewedBy })),
    counts: Object.fromEntries(['pending', 'approved', 'rejected'].map((k) => [k, Number(counts.find((c) => c.status === k)?.n ?? 0)])),
  });
});

async function loadPending(req: Request, res: Response): Promise<Suggestion | null> {
  const [row] = await db.select().from(schema.placeSuggestions)
    .where(eq(schema.placeSuggestions.id, routeParam(req, 'id'))).limit(1);
  if (!row) {
    res.status(404).json({ detail: 'Suggestion not found' });
    return null;
  }
  if (row.status !== 'pending') {
    res.status(409).json({ detail: `This suggestion was already ${row.status}`, code: 'already_reviewed' });
    return null;
  }
  return row;
}

function noteFrom(v: unknown): string | null | { error: string } {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string') return { error: 'note must be text' };
  const note = v.trim();
  if (note.length > MAX_NOTE) return { error: `note must be ${MAX_NOTE} characters or fewer` };
  return note || null;
}

/** Tells the sender what the team decided: in the app (with a phone push) and by email when set up. */
async function tellSender(s: Suggestion, decision: 'approved' | 'rejected', note: string | null) {
  const title = decision === 'approved' ? 'Your place suggestion was accepted' : 'About your place suggestion';
  const body = decision === 'approved'
    ? `Thank you. The aangan team accepted ${s.name} and will publish it on Offbeat Places once it is ready.`
    : `The aangan team could not add ${s.name}.${note ? ` ${note}` : ''}`;
  await addInAppNotification(s.userId, {
    kind: decision === 'approved' ? 'place_suggestion_approved' : 'place_suggestion_rejected',
    title,
    body,
    refId: s.id,
    msg: decision === 'approved'
      ? { key: 'place_suggestion_approved', params: { place: s.name } }
      : { key: note ? 'place_suggestion_rejected_note' : 'place_suggestion_rejected', params: { place: s.name, note: note || '' } },
  });
  if (!emailEnabled()) return;
  try {
    const [u] = await db.select({ name: schema.users.name, email: schema.users.email })
      .from(schema.users).where(eq(schema.users.id, s.userId)).limit(1);
    if (!u?.email) return;
    const r = await sendEmail({
      to: u.email,
      subject: title,
      text: `Hi ${u.name}, ${body}`,
      html: renderEmail(title, [`Hi ${u.name},`, body], 'You are receiving this because you suggested a place on aangan.'),
    });
    if (!r.ok) log.warn(`[notify] place suggestion email failed: ${r.error}`);
  } catch (err) {
    log.warn(`[notify] place suggestion email failed: ${(err as Error).message}`);
  }
}

/**
 * @openapi
 * /admin/spots/suggestions/{id}/approve:
 *   post:
 *     summary: Accept a suggestion and create it as an unpublished tourist spot (admin)
 *     description: >
 *       Uses the admin spot rules (title, description, location, price, photos). The new spot stays
 *       unpublished until the team checks it and publishes it from Tourist spots. The body may
 *       correct the title, description or location first, and carry a note for the sender.
 *     tags: [Admin, Spots]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               location: { type: string }
 *               note: { type: string, maxLength: 300 }
 *     responses:
 *       200: { description: "{ suggestion, spot }" }
 *       404: { description: No such suggestion }
 *       409: { description: Already reviewed, or a spot with this title exists }
 */
router.post('/admin/spots/suggestions/:id/approve', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const s = await loadPending(req, res);
  if (!s) return;
  const note = noteFrom(req.body?.note);
  if (note && typeof note === 'object') return res.status(400).json({ detail: note.error });

  const pick = (k: string, fallback: string) => (typeof req.body?.[k] === 'string' && req.body[k].trim() ? req.body[k] : fallback);
  const created = await createSpot({
    title: pick('title', s.name),
    description: pick('description', s.details || s.name),
    location: pick('location', s.place),
    price: s.entryPrice ?? 0,
    image: s.photos?.[0] || '',
    extras: {
      images: s.photos || [],
      entry_fee: s.entryPrice ? `₹${s.entryPrice} per person` : 'Free entry',
      published: false,
    },
  });
  if ('detail' in created) return res.status(created.status).json({ detail: created.detail });

  const [updated] = await db.update(schema.placeSuggestions).set({
    status: 'approved',
    listingId: created.row.id,
    reviewNote: note as string | null,
    reviewedAt: new Date().toISOString(),
    reviewedBy: req.user!.id,
  }).where(and(eq(schema.placeSuggestions.id, s.id), eq(schema.placeSuggestions.status, 'pending'))).returning();
  if (!updated) {
    // A second admin decided first: undo the spot this request made.
    await db.delete(schema.listings).where(eq(schema.listings.id, created.row.id));
    return res.status(409).json({ detail: 'This suggestion was already reviewed', code: 'already_reviewed' });
  }
  await tellSender(updated, 'approved', note as string | null);
  res.json({ suggestion: out(updated), spot: toAdminSpot(created.row) });
});

/**
 * @openapi
 * /admin/spots/suggestions/{id}/reject:
 *   post:
 *     summary: Turn a suggestion down, with an optional note the sender sees (admin)
 *     tags: [Admin, Spots]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               note: { type: string, maxLength: 300 }
 *     responses:
 *       200: { description: "{ suggestion }" }
 *       404: { description: No such suggestion }
 *       409: { description: Already reviewed }
 */
router.post('/admin/spots/suggestions/:id/reject', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const s = await loadPending(req, res);
  if (!s) return;
  const note = noteFrom(req.body?.note);
  if (note && typeof note === 'object') return res.status(400).json({ detail: note.error });
  const [updated] = await db.update(schema.placeSuggestions).set({
    status: 'rejected',
    reviewNote: note as string | null,
    reviewedAt: new Date().toISOString(),
    reviewedBy: req.user!.id,
  }).where(and(eq(schema.placeSuggestions.id, s.id), eq(schema.placeSuggestions.status, 'pending'))).returning();
  if (!updated) return res.status(409).json({ detail: 'This suggestion was already reviewed', code: 'already_reviewed' });
  await tellSender(updated, 'rejected', note as string | null);
  res.json({ suggestion: out(updated) });
});

export default router;
