import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { and, desc, eq, gte, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import { db, schema } from '../db';
import { authenticateToken, optionalUser, requireAdmin, type AuthenticatedUser } from '../middleware/auth';
import { requireTravellerMode } from '../middleware/mode';
import { planPostRights } from '../lib/feedRights';
import { rateLimiter } from '../middleware/rateLimiter';
import { routeParam } from '../lib/routeParam';
import { checkNameLike, looksLikeGibberish, tidyText } from '../lib/contentRules';
import { isListingPlanLapsed } from '../lib/listingPlan';
import { addDays, isIsoDate, todayInIndia } from '../lib/bookingRules';
import { addInAppNotification } from '../lib/inApp';

const router = Router();

// ============ TRIP PLANS ============
// A traveller plans a route (stops over some nights), optionally picks a homestay and a driver from
// aangan, works out a cost per person and posts it to the Feed. Other travellers ask to join; the
// organiser accepts or declines each request, and anyone can save a plan for later.
//
// The prototype kept the organiser's phone on the plan for "call or WhatsApp". It is never stored
// or returned here: people reach each other through the app, and free text that carries a phone
// number is refused.

export const MAX_TITLE_LEN = 120;
export const MAX_STOPS = 12;
const MAX_PLACE_LEN = 80;
const MAX_STOP_NOTE_LEN = 200;
const MAX_DAY_TEXT_LEN = 500;
export const MAX_NOTES_LEN = 1000;
export const MAX_NIGHTS = 30;
export const MAX_SEATS = 20;
const MAX_COST = 1_000_000;
const MAX_URL_LEN = 2000;
const MAX_DAYS_AHEAD = 365;
/** Generous for a real traveller, a ceiling for a spammer. */
const MAX_PLANS_PER_DAY = 5;
const PAGE_DEFAULT = 20;
const PAGE_MAX = 50;
/** How many joined travellers a card shows as avatars. */
const MEMBER_PREVIEW = 5;

type Plan = typeof schema.tripPlans.$inferSelect;
type PlanInsert = typeof schema.tripPlans.$inferInsert;
type MemberStatus = 'pending' | 'accepted' | 'declined';

// ---------- validation ----------

type Check<T> = { value: T } | { error: string };

/** Ten or more digits in a row (spaces, dashes and a leading + allowed): a phone number. */
const PHONE_LIKE = /(?:\+?\d[\s-]?){10,}/;
const NO_PHONES = 'Keep phone numbers out of the plan. Travellers reach you through aangan.';

function freeText(value: unknown, label: string, max: number): Check<string> {
  if (value === undefined || value === null) return { value: '' };
  if (typeof value !== 'string') return { error: `${label} must be text` };
  const text = value.trim();
  if (text.length > max) return { error: `${label} must be ${max} characters or fewer` };
  if (PHONE_LIKE.test(text)) return { error: NO_PHONES };
  if (text && looksLikeGibberish(text)) return { error: `${label} does not look like real words` };
  return { value: text };
}

function checkTitle(value: unknown): Check<string> {
  const r = checkNameLike(value, 'Trip name', MAX_TITLE_LEN);
  if ('error' in r) return r;
  if (PHONE_LIKE.test(r.value)) return { error: NO_PHONES };
  return r;
}

function checkPlace(value: unknown): Check<string> {
  if (typeof value !== 'string') return { error: 'Each stop needs a place name' };
  const place = tidyText(value);
  const letters = (place.match(/\p{L}/gu) || []).length;
  if (!place || letters < 2) return { error: 'Each stop needs a place name' };
  if (place.length > MAX_PLACE_LEN) return { error: `A place name must be ${MAX_PLACE_LEN} characters or fewer` };
  if (looksLikeGibberish(place)) return { error: `"${place}" does not look like a real place` };
  return { value: place };
}

/** Stops in travel order: 1 to 12, each a place name (a string) or { place, note }. */
function checkStops(value: unknown): Check<{ place: string; note?: string }[]> {
  if (!Array.isArray(value) || value.length < 1) return { error: 'Add at least one place to the route' };
  if (value.length > MAX_STOPS) return { error: `A route can have at most ${MAX_STOPS} places` };
  const out: { place: string; note?: string }[] = [];
  for (const raw of value) {
    const obj = typeof raw === 'string' ? { place: raw } : raw && typeof raw === 'object' ? raw as Record<string, unknown> : null;
    if (!obj) return { error: 'Each stop needs a place name' };
    const place = checkPlace(obj.place);
    if ('error' in place) return place;
    const note = freeText(obj.note, 'A stop note', MAX_STOP_NOTE_LEN);
    if ('error' in note) return note;
    out.push(note.value ? { place: place.value, note: note.value } : { place: place.value });
  }
  return { value: out };
}

/** Day notes: { day, text } with day 1..nights+1, each day once. Empty notes are dropped. */
function checkDays(value: unknown, nights: number): Check<{ day: number; text: string }[]> {
  if (value === undefined || value === null) return { value: [] };
  if (!Array.isArray(value)) return { error: 'days must be a list' };
  const last = nights + 1;
  if (value.length > last) return { error: `A ${nights}-night trip has ${last} days` };
  const seen = new Set<number>();
  const out: { day: number; text: string }[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return { error: 'Each day needs a day number and a note' };
    const { day, text } = raw as Record<string, unknown>;
    if (!Number.isInteger(day) || (day as number) < 1 || (day as number) > last) {
      return { error: `Day numbers go from 1 to ${last}` };
    }
    if (seen.has(day as number)) return { error: `Day ${day} is in the plan twice` };
    seen.add(day as number);
    const note = freeText(text, `The note for day ${day}`, MAX_DAY_TEXT_LEN);
    if ('error' in note) return note;
    if (note.value) out.push({ day: day as number, text: note.value });
  }
  out.sort((a, b) => a.day - b.day);
  return { value: out };
}

function intIn(value: unknown, label: string, min: number, max: number): Check<number> {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    return { error: `${label} must be a whole number from ${min} to ${max}` };
  }
  return { value: n };
}

function checkStartDate(value: unknown): Check<string | null> {
  if (value === undefined || value === null || value === '') return { value: null };
  if (!isIsoDate(value)) return { error: 'start_date must be a date (YYYY-MM-DD)' };
  const today = todayInIndia();
  if (value < today) return { error: 'The start date has already passed' };
  if (value > addDays(today, MAX_DAYS_AHEAD)) return { error: 'Plan trips up to a year ahead' };
  return { value };
}

function checkCover(value: unknown): Check<string | null> {
  if (value === undefined || value === null || value === '') return { value: null };
  if (typeof value !== 'string' || value.length > MAX_URL_LEN || !/^https?:\/\//i.test(value.trim())) {
    return { error: 'cover must be an http(s) URL from the photo upload' };
  }
  return { value: value.trim() };
}

/** A homestay or driver on aangan that travellers can book right now. */
async function checkListing(value: unknown, type: 'homestay' | 'driver'): Promise<Check<string | null>> {
  if (value === undefined || value === null || value === '') return { value: null };
  const label = type === 'homestay' ? 'stay_listing_id' : 'driver_listing_id';
  if (typeof value !== 'string') return { error: `${label} must be a listing id` };
  const [l] = await db.select({ id: schema.listings.id, type: schema.listings.type, providerId: schema.listings.providerId, planExpiresAt: schema.listings.planExpiresAt, planGrace: schema.listings.planGrace })
    .from(schema.listings).where(eq(schema.listings.id, value)).limit(1);
  if (!l) return { error: `${label}: that listing does not exist` };
  if (l.type !== type) return { error: `${label} must be a ${type} listing` };
  if (isListingPlanLapsed(l)) return { error: `${label}: that ${type} is not taking guests right now` };
  return { value: l.id };
}

/**
 * Reads the fields a create (every required field) or a patch (only what was sent) carries.
 * `current` is the stored plan on a patch, so cross-field rules (days against nights, seats
 * against the people already in) are judged on the result.
 */
async function readPlanInput(body: any, current: Plan | null, acceptedCount: number): Promise<Check<Partial<PlanInsert>>> {
  const has = (k: string) => current === null || body?.[k] !== undefined;
  const set: Partial<PlanInsert> = {};
  if (!body || typeof body !== 'object') return { error: 'Send the plan as JSON' };

  if (has('title')) {
    const r = checkTitle(body.title);
    if ('error' in r) return r;
    set.title = r.value;
  }
  if (has('stops')) {
    const r = checkStops(body.stops);
    if ('error' in r) return r;
    set.stops = r.value;
  }
  if (has('nights')) {
    const r = intIn(body.nights, 'nights', 1, MAX_NIGHTS);
    if ('error' in r) return r;
    set.nights = r.value;
  }
  const nights = set.nights ?? current?.nights ?? 1;
  if (has('days') || set.nights !== undefined) {
    // A shorter trip drops the stored notes for days it no longer has, unless new ones were sent.
    const days = body.days !== undefined ? body.days : (current?.days || []).filter((d) => d.day <= nights + 1);
    const r = checkDays(days, nights);
    if ('error' in r) return r;
    set.days = r.value;
  }
  if (has('seats')) {
    const r = intIn(body.seats, 'seats', 1, MAX_SEATS);
    if ('error' in r) return r;
    if (r.value < acceptedCount + 1) {
      return { error: `${acceptedCount} ${acceptedCount === 1 ? 'person has' : 'people have'} joined, so the trip needs at least ${acceptedCount + 1} seats` };
    }
    set.seats = r.value;
  }
  if (has('start_date')) {
    const unchanged = current !== null && body.start_date === current.startDate;
    if (!unchanged) {
      const r = checkStartDate(body.start_date);
      if ('error' in r) return r;
      set.startDate = r.value;
    }
  }
  if (has('cost_per_person')) {
    if (body.cost_per_person === undefined || body.cost_per_person === null || body.cost_per_person === '') {
      set.costPerPerson = null;
    } else {
      const r = intIn(body.cost_per_person, 'cost_per_person', 0, MAX_COST);
      if ('error' in r) return r;
      set.costPerPerson = r.value;
    }
  }
  if (has('notes')) {
    const r = freeText(body.notes, 'Notes', MAX_NOTES_LEN);
    if ('error' in r) return r;
    set.notes = r.value;
  }
  if (has('visibility')) {
    const v = body.visibility ?? 'public';
    if (v !== 'public' && v !== 'private') return { error: 'visibility must be public or private' };
    set.visibility = v;
  }
  if (has('cover')) {
    const r = checkCover(body.cover);
    if ('error' in r) return r;
    set.cover = r.value;
  }
  if (has('stay_listing_id')) {
    const unchanged = current !== null && body.stay_listing_id === current.stayListingId;
    if (!unchanged) {
      const r = await checkListing(body.stay_listing_id, 'homestay');
      if ('error' in r) return r;
      set.stayListingId = r.value;
    }
  }
  if (has('driver_listing_id')) {
    const unchanged = current !== null && body.driver_listing_id === current.driverListingId;
    if (!unchanged) {
      const r = await checkListing(body.driver_listing_id, 'driver');
      if ('error' in r) return r;
      set.driverListingId = r.value;
    }
  }
  return { value: set };
}

// ---------- reading ----------

type Organiser = { id: string; name: string; avatar: string | null };
type Row = { plan: Plan; organiser: Organiser };

function selectRows() {
  return db
    .select({
      plan: schema.tripPlans,
      organiser: { id: schema.users.id, name: schema.users.name, avatar: schema.users.avatar },
    })
    .from(schema.tripPlans)
    .innerJoin(schema.users, eq(schema.users.id, schema.tripPlans.userId));
}

/** In the public feed: public, not hidden by the team, and not already started. */
function feedCondition() {
  return and(
    eq(schema.tripPlans.visibility, 'public'),
    isNull(schema.tripPlans.hiddenAt),
    or(isNull(schema.tripPlans.startDate), gte(schema.tripPlans.startDate, todayInIndia())),
  );
}

async function blockedBy(viewerId: string): Promise<string[]> {
  const rows = await db.select({ id: schema.userBlocks.blockedId }).from(schema.userBlocks)
    .where(eq(schema.userBlocks.blockerId, viewerId));
  return rows.map((r) => r.id);
}

/** True when either person has blocked the other. */
async function eitherBlocked(a: string, b: string): Promise<boolean> {
  const [row] = await db.select({ id: schema.userBlocks.blockerId }).from(schema.userBlocks)
    .where(or(
      and(eq(schema.userBlocks.blockerId, a), eq(schema.userBlocks.blockedId, b)),
      and(eq(schema.userBlocks.blockerId, b), eq(schema.userBlocks.blockedId, a)),
    ))
    .limit(1);
  return !!row;
}

type ListingSummary = { id: string; title: string; type: string; location: string; price: number; image: string };

/**
 * The plan as clients see it. No phone number anywhere: the organiser and members are a name and
 * an avatar, the stay and driver are listing summaries (their contact stays behind the listing's
 * own gate).
 */
async function plansOut(rows: Row[], viewer: AuthenticatedUser | null, opts: { requests?: boolean } = {}) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.plan.id);
  const listingIds = [...new Set(rows.flatMap((r) => [r.plan.stayListingId, r.plan.driverListingId]).filter((x): x is string => !!x))];

  const [listings, accepted, pending, mine, saved] = await Promise.all([
    listingIds.length
      ? db.select({
        id: schema.listings.id, title: schema.listings.title, type: schema.listings.type,
        location: schema.listings.location, price: schema.listings.price, image: schema.listings.image,
      }).from(schema.listings).where(inArray(schema.listings.id, listingIds))
      : Promise.resolve([] as ListingSummary[]),
    db.select({
      planId: schema.tripPlanMembers.planId, id: schema.users.id, name: schema.users.name, avatar: schema.users.avatar,
    })
      .from(schema.tripPlanMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.tripPlanMembers.userId))
      .where(and(inArray(schema.tripPlanMembers.planId, ids), eq(schema.tripPlanMembers.status, 'accepted')))
      .orderBy(schema.tripPlanMembers.createdAt),
    db.select({ planId: schema.tripPlanMembers.planId, n: sql<number>`count(*)::int` })
      .from(schema.tripPlanMembers)
      .where(and(inArray(schema.tripPlanMembers.planId, ids), eq(schema.tripPlanMembers.status, 'pending')))
      .groupBy(schema.tripPlanMembers.planId),
    viewer
      ? db.select({ planId: schema.tripPlanMembers.planId, status: schema.tripPlanMembers.status })
        .from(schema.tripPlanMembers)
        .where(and(inArray(schema.tripPlanMembers.planId, ids), eq(schema.tripPlanMembers.userId, viewer.id)))
      : Promise.resolve([] as { planId: string; status: string }[]),
    viewer
      ? db.select({ planId: schema.tripPlanSaves.planId }).from(schema.tripPlanSaves)
        .where(and(inArray(schema.tripPlanSaves.planId, ids), eq(schema.tripPlanSaves.userId, viewer.id)))
      : Promise.resolve([] as { planId: string }[]),
  ]);

  const listingById = new Map(listings.map((l) => [l.id, l]));
  const membersByPlan = new Map<string, Organiser[]>();
  for (const m of accepted) {
    const list = membersByPlan.get(m.planId) ?? [];
    list.push({ id: m.id, name: m.name, avatar: m.avatar });
    membersByPlan.set(m.planId, list);
  }
  const pendingByPlan = new Map(pending.map((p) => [p.planId, Number(p.n)]));
  const myStatus = new Map(mine.map((m) => [m.planId, m.status as MemberStatus]));
  const mySaves = new Set(saved.map((s) => s.planId));

  const requestsByPlan = new Map<string, unknown[]>();
  const organiserPlanIds = rows.filter((r) => viewer && r.plan.userId === viewer.id).map((r) => r.plan.id);
  if (opts.requests && organiserPlanIds.length) {
    const reqs = await db.select({
      planId: schema.tripPlanMembers.planId, status: schema.tripPlanMembers.status, createdAt: schema.tripPlanMembers.createdAt,
      id: schema.users.id, name: schema.users.name, avatar: schema.users.avatar,
    })
      .from(schema.tripPlanMembers)
      .innerJoin(schema.users, eq(schema.users.id, schema.tripPlanMembers.userId))
      .where(inArray(schema.tripPlanMembers.planId, organiserPlanIds))
      .orderBy(schema.tripPlanMembers.createdAt);
    for (const r of reqs) {
      const list = requestsByPlan.get(r.planId) ?? [];
      list.push({ user: { id: r.id, name: r.name, avatar: r.avatar }, status: r.status, created_at: r.createdAt });
      requestsByPlan.set(r.planId, list);
    }
  }

  return rows.map(({ plan: p, organiser }) => {
    const members = membersByPlan.get(p.id) ?? [];
    const joined = members.length + 1; // the organiser holds a seat
    const isOrganiser = !!viewer && viewer.id === p.userId;
    const stay = p.stayListingId ? listingById.get(p.stayListingId) ?? null : null;
    const driver = p.driverListingId ? listingById.get(p.driverListingId) ?? null : null;
    return {
      id: p.id,
      title: p.title,
      cover: p.cover,
      stops: p.stops || [],
      days: p.days || [],
      start_date: p.startDate,
      nights: p.nights,
      seats: p.seats,
      cost_per_person: p.costPerPerson,
      notes: p.notes,
      visibility: p.visibility,
      created_at: p.createdAt,
      updated_at: p.updatedAt,
      organiser,
      stay,
      driver,
      joined_count: joined,
      seats_left: Math.max(0, p.seats - joined),
      full: joined >= p.seats,
      // The organiser first, then the people who were accepted.
      members: [organiser, ...members].slice(0, MEMBER_PREVIEW),
      viewer: viewer
        ? { is_organiser: isOrganiser, saved: mySaves.has(p.id), join_status: myStatus.get(p.id) ?? null }
        : null,
      ...(isOrganiser || viewer?.role === 'admin'
        ? { hidden: !!p.hiddenAt, pending_count: pendingByPlan.get(p.id) ?? 0 }
        : {}),
      ...(isOrganiser && opts.requests ? { requests: requestsByPlan.get(p.id) ?? [] } : {}),
    };
  });
}

async function loadPlan(id: string): Promise<Row | null> {
  const [row] = (await selectRows().where(eq(schema.tripPlans.id, id)).limit(1)) as Row[];
  return row ?? null;
}

async function memberStatus(planId: string, userId: string): Promise<MemberStatus | null> {
  const [m] = await db.select({ status: schema.tripPlanMembers.status }).from(schema.tripPlanMembers)
    .where(and(eq(schema.tripPlanMembers.planId, planId), eq(schema.tripPlanMembers.userId, userId))).limit(1);
  return (m?.status as MemberStatus) ?? null;
}

/**
 * Whether this viewer may open the plan: anyone for a public, visible plan; the organiser and the
 * team always; a member (asked or accepted) even after the plan went private.
 */
async function canView(row: Row, viewer: AuthenticatedUser | null): Promise<boolean> {
  if (viewer && (viewer.id === row.plan.userId || viewer.role === 'admin')) return true;
  if (row.plan.hiddenAt) return false;
  if (viewer && await eitherBlocked(viewer.id, row.plan.userId)) return false;
  if (row.plan.visibility === 'public') return true;
  if (!viewer) return false;
  const s = await memberStatus(row.plan.id, viewer.id);
  return s === 'pending' || s === 'accepted';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function acceptedCount(planId: string, tx: { select: any } = db): Promise<number> {
  const [{ n }] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.tripPlanMembers)
    .where(and(eq(schema.tripPlanMembers.planId, planId), eq(schema.tripPlanMembers.status, 'accepted')));
  return Number(n);
}

// ---------- routes ----------

/**
 * @openapi
 * /plans:
 *   get:
 *     summary: Trip plans in the Feed, newest first
 *     description: >
 *       Public. Public plans that the team has not hidden and that have not started yet. Each carries
 *       the organiser's name and avatar, the stay and driver listing summaries, joined_count (the
 *       organiser included) and seats_left. A signed-in reader also gets `viewer` (saved, join_status)
 *       and does not see plans by people they blocked. No phone numbers.
 *     tags: [Plans]
 *     parameters:
 *       - { in: query, name: before, schema: { type: string }, description: "next_before from the previous page" }
 *       - { in: query, name: limit, schema: { type: integer, maximum: 50 } }
 *   post:
 *     summary: Post a trip plan (traveller mode)
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, stops, nights, seats]
 *             properties:
 *               title: { type: string, maxLength: 120 }
 *               stops: { type: array, minItems: 1, maxItems: 12, items: { oneOf: [{ type: string }, { type: object, properties: { place: { type: string }, note: { type: string } } }] } }
 *               days: { type: array, items: { type: object, properties: { day: { type: integer }, text: { type: string } } } }
 *               start_date: { type: string, format: date }
 *               nights: { type: integer, minimum: 1, maximum: 30 }
 *               seats: { type: integer, minimum: 1, maximum: 20, description: "People the trip is for, the organiser included" }
 *               cost_per_person: { type: integer, minimum: 0 }
 *               stay_listing_id: { type: string, description: "A homestay listing" }
 *               driver_listing_id: { type: string, description: "A driver listing" }
 *               notes: { type: string, maxLength: 1000 }
 *               cover: { type: string, description: "URL from POST /listings/upload" }
 *               visibility: { type: string, enum: [public, private], description: "public (the Feed) needs a verified person: the aangan pass, or a business with the Verified tick" }
 *     responses:
 *       201: { description: The plan }
 *       400: { description: Invalid input }
 *       403: { description: "code not_verified: a public plan from someone who is not verified" }
 */
router.get('/', async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? PAGE_DEFAULT), 10) || PAGE_DEFAULT, 1), PAGE_MAX);
  const before = typeof req.query.before === 'string' && req.query.before ? req.query.before : null;
  const conditions = [feedCondition()];
  if (before) conditions.push(lt(schema.tripPlans.createdAt, before));

  const viewer = await optionalUser(req);
  if (viewer) {
    const blocked = await blockedBy(viewer.id);
    if (blocked.length) {
      conditions.push(sql`${schema.tripPlans.userId} NOT IN (${sql.join(blocked.map((b) => sql`${b}`), sql`, `)})`);
    }
  }

  const rows = (await selectRows()
    .where(and(...conditions))
    .orderBy(desc(schema.tripPlans.createdAt))
    .limit(limit + 1)) as Row[];
  const page = rows.slice(0, limit);
  res.json({
    plans: await plansOut(page, viewer),
    next_before: rows.length > limit ? page[page.length - 1].plan.createdAt : null,
  });
});

/**
 * @openapi
 * /plans/me:
 *   get:
 *     summary: My trip plans, the ones I asked to join (with my status) and the ones I saved
 *     description: My own plans carry `requests` (everyone who asked, with status) and `pending_count`.
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/me', authenticateToken, async (req: Request, res: Response) => {
  const me = req.user!;
  const [mine, joinedIds, savedIds] = await Promise.all([
    selectRows().where(eq(schema.tripPlans.userId, me.id)).orderBy(desc(schema.tripPlans.createdAt)).limit(100) as Promise<Row[]>,
    db.select({ planId: schema.tripPlanMembers.planId }).from(schema.tripPlanMembers)
      .where(eq(schema.tripPlanMembers.userId, me.id)).orderBy(desc(schema.tripPlanMembers.createdAt)).limit(100),
    db.select({ planId: schema.tripPlanSaves.planId }).from(schema.tripPlanSaves)
      .where(eq(schema.tripPlanSaves.userId, me.id)).orderBy(desc(schema.tripPlanSaves.createdAt)).limit(100),
  ]);

  const fetchByIds = async (ids: string[]) => {
    if (!ids.length) return [] as Row[];
    const rows = (await selectRows().where(inArray(schema.tripPlans.id, ids))) as Row[];
    const byId = new Map(rows.map((r) => [r.plan.id, r]));
    // Keep the order the person joined or saved them in; drop plans the team hid.
    return ids.map((id) => byId.get(id)).filter((r): r is Row => !!r && !r.plan.hiddenAt);
  };
  const joinedRows = await fetchByIds(joinedIds.map((j) => j.planId));
  const savedRows = (await fetchByIds(savedIds.map((s) => s.planId)))
    .filter((r) => r.plan.userId === me.id || r.plan.visibility === 'public' || joinedRows.some((j) => j.plan.id === r.plan.id));

  res.json({
    mine: await plansOut(mine, me, { requests: true }),
    joined: await plansOut(joinedRows, me),
    saved: await plansOut(savedRows, me),
  });
});

/**
 * @openapi
 * /plans/rights:
 *   get:
 *     summary: Whether you may post a trip plan in the Feed
 *     description: Anyone can plan a trip and keep it to themselves. Posting it in the Feed needs the aangan pass (Verified traveller) or a business with the Verified tick.
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/rights', authenticateToken, async (req: Request, res: Response) => {
  const r = await planPostRights(req.user!.id);
  res.json({ can_post: r.can, pass_active: r.passActive, verified_business: r.verifiedBusiness });
});

const NOT_VERIFIED = {
  detail: 'Only verified people can post a trip plan in the Feed. Get the aangan pass (Verified traveller), or the Verified tick for your business',
  code: 'not_verified',
};

router.post('/', authenticateToken, rateLimiter(20, 60 * 60 * 1000, 'plan_create'), async (req: Request, res: Response) => {
  const me = req.user!;
  if (me.role === 'admin') return res.status(403).json({ detail: 'Sign in as a traveller to post a trip plan' });
  const input = await readPlanInput(req.body, null, 0);
  if ('error' in input) return res.status(400).json({ detail: input.error });
  // Anyone, traveller or business, may plan a trip and keep it; putting it in the Feed needs a verified person.
  if ((input.value.visibility ?? 'public') === 'public' && !(await planPostRights(me.id)).can) return res.status(403).json(NOT_VERIFIED);

  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.tripPlans)
    .where(and(eq(schema.tripPlans.userId, me.id), gte(schema.tripPlans.createdAt, dayAgo)));
  if (Number(count) >= MAX_PLANS_PER_DAY) {
    return res.status(429).json({ detail: `You can post up to ${MAX_PLANS_PER_DAY} trip plans a day` });
  }

  const id = uuidv4();
  await db.insert(schema.tripPlans).values({
    ...input.value,
    id,
    userId: me.id,
    title: input.value.title!,
    createdAt: new Date().toISOString(),
  });
  const row = await loadPlan(id);
  const [plan] = await plansOut([row!], me, { requests: true });
  res.status(201).json({ plan });
});

/**
 * @openapi
 * /plans/{id}:
 *   get:
 *     summary: One trip plan
 *     description: >
 *       Anyone can open a public plan; the organiser and the team always can, and a member can open
 *       it after it went private. The organiser also gets `requests` (who asked to join, with status).
 *     tags: [Plans]
 *     responses:
 *       200: { description: The plan }
 *       404: { description: Not found, hidden or private }
 *   patch:
 *     summary: Change your plan (organiser). Same fields as POST /plans; send only what changes.
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 *   delete:
 *     summary: Delete your plan (organiser, or the team). Members are told.
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 */
router.get('/:id', async (req: Request, res: Response) => {
  const row = await loadPlan(routeParam(req, 'id'));
  const viewer = await optionalUser(req);
  if (!row || !(await canView(row, viewer))) return res.status(404).json({ detail: 'Plan not found' });
  const [plan] = await plansOut([row], viewer, { requests: true });
  res.json({ plan });
});

router.patch('/:id', authenticateToken, async (req: Request, res: Response) => {
  const row = await loadPlan(routeParam(req, 'id'));
  if (!row || row.plan.userId !== req.user!.id) return res.status(404).json({ detail: 'Plan not found' });
  const input = await readPlanInput(req.body, row.plan, await acceptedCount(row.plan.id));
  if ('error' in input) return res.status(400).json({ detail: input.error });
  // Putting a private plan in the Feed is posting it.
  if (input.value.visibility === 'public' && row.plan.visibility !== 'public' && !(await planPostRights(req.user!.id)).can) {
    return res.status(403).json(NOT_VERIFIED);
  }
  await db.update(schema.tripPlans)
    .set({ ...input.value, updatedAt: new Date().toISOString() })
    .where(eq(schema.tripPlans.id, row.plan.id));
  const [plan] = await plansOut([(await loadPlan(row.plan.id))!], req.user!, { requests: true });
  res.json({ plan });
});

router.delete('/:id', authenticateToken, async (req: Request, res: Response) => {
  const row = await loadPlan(routeParam(req, 'id'));
  const me = req.user!;
  if (!row || (row.plan.userId !== me.id && me.role !== 'admin')) return res.status(404).json({ detail: 'Plan not found' });
  const members = await db.select({ userId: schema.tripPlanMembers.userId }).from(schema.tripPlanMembers)
    .where(and(eq(schema.tripPlanMembers.planId, row.plan.id), inArray(schema.tripPlanMembers.status, ['pending', 'accepted'])));
  await db.delete(schema.tripPlans).where(eq(schema.tripPlans.id, row.plan.id));
  for (const m of members) {
    await addInAppNotification(m.userId, {
      kind: 'plan_cancelled',
      title: 'A trip plan was cancelled',
      body: `${row.organiser.name} cancelled the trip "${row.plan.title}".`,
      msg: { key: 'plan_cancelled', params: { guest: row.organiser.name, plan: row.plan.title } },
      refId: row.plan.id,
    });
  }
  res.json({ ok: true });
});

/**
 * @openapi
 * /plans/{id}/join:
 *   post:
 *     summary: Ask to join a trip plan (traveller mode)
 *     description: >
 *       Not your own plan, not a full one, not one that has started, and not again after the
 *       organiser declined. The organiser is told and accepts or declines.
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       201: { description: Request sent }
 *       200: { description: Already asked or already in }
 *       400: { description: Your own plan }
 *       404: { description: Not found }
 *       409: { description: "Full (code full), already started (code started) or declined (code declined)" }
 *   delete:
 *     summary: Take back a request, or leave a trip you are in
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/join', authenticateToken, requireTravellerMode, rateLimiter(60, 60 * 60 * 1000, 'plan_join'), async (req: Request, res: Response) => {
  const me = req.user!;
  const row = await loadPlan(routeParam(req, 'id'));
  if (!row || row.plan.hiddenAt || row.plan.visibility !== 'public' || await eitherBlocked(me.id, row.plan.userId)) {
    return res.status(404).json({ detail: 'Plan not found' });
  }
  const p = row.plan;
  if (me.role === 'admin') return res.status(403).json({ detail: 'Sign in as a traveller to join a trip' });
  if (p.userId === me.id) return res.status(400).json({ detail: 'This is your own plan', code: 'own_plan' });

  const current = await memberStatus(p.id, me.id);
  if (current === 'pending' || current === 'accepted') {
    const [plan] = await plansOut([row], me);
    return res.status(200).json({ plan });
  }
  if (current === 'declined') {
    return res.status(409).json({ detail: 'The organiser did not confirm you for this trip', code: 'declined' });
  }
  if (p.startDate && p.startDate < todayInIndia()) {
    return res.status(409).json({ detail: 'This trip has already started', code: 'started' });
  }
  if ((await acceptedCount(p.id)) + 1 >= p.seats) {
    return res.status(409).json({ detail: 'This trip is full', code: 'full' });
  }

  await db.insert(schema.tripPlanMembers)
    .values({ planId: p.id, userId: me.id, status: 'pending', createdAt: new Date().toISOString() })
    .onConflictDoNothing();
  await addInAppNotification(p.userId, {
    kind: 'plan_join_request',
    title: 'Someone wants to join your trip',
    body: `${me.name || 'A traveller'} asked to join "${p.title}". Confirm or decline it on the plan.`,
    msg: { key: 'plan_join_request', params: { guest: me.name || '', plan: p.title } },
    refId: p.id,
  });
  const [plan] = await plansOut([row], me);
  res.status(201).json({ plan });
});

router.delete('/:id/join', authenticateToken, async (req: Request, res: Response) => {
  const me = req.user!;
  const row = await loadPlan(routeParam(req, 'id'));
  if (!row) return res.status(404).json({ detail: 'Plan not found' });
  // A declined row stays, so the same person cannot ask again and again.
  const removed = await db.delete(schema.tripPlanMembers)
    .where(and(
      eq(schema.tripPlanMembers.planId, row.plan.id),
      eq(schema.tripPlanMembers.userId, me.id),
      inArray(schema.tripPlanMembers.status, ['pending', 'accepted']),
    ))
    .returning({ status: schema.tripPlanMembers.status });
  if (removed[0]?.status === 'accepted') {
    await addInAppNotification(row.plan.userId, {
      kind: 'plan_member_left',
      title: 'Someone left your trip',
      body: `${me.name || 'A traveller'} left "${row.plan.title}". Their seat is free again.`,
      msg: { key: 'plan_member_left', params: { guest: me.name || '', plan: row.plan.title } },
      refId: row.plan.id,
    });
  }
  const [plan] = (await canView(row, me)) ? await plansOut([row], me) : [null];
  res.json({ ok: true, plan });
});

/**
 * @openapi
 * /plans/{id}/members/{userId}/accept:
 *   post:
 *     summary: Confirm someone who asked to join (organiser). Refused when the trip is full.
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Confirmed; the person is told }
 *       404: { description: No such plan or request }
 *       409: { description: The trip is full (code full) }
 * /plans/{id}/members/{userId}/decline:
 *   post:
 *     summary: Decline a request, or take someone off the trip (organiser). The person is told.
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/members/:userId/:action', authenticateToken, async (req: Request, res: Response) => {
  const action = routeParam(req, 'action');
  if (action !== 'accept' && action !== 'decline') return res.status(404).json({ detail: 'Not found' });
  const row = await loadPlan(routeParam(req, 'id'));
  if (!row || row.plan.userId !== req.user!.id) return res.status(404).json({ detail: 'Plan not found' });
  const p = row.plan;
  const userId = routeParam(req, 'userId');
  const target: MemberStatus = action === 'accept' ? 'accepted' : 'declined';

  const outcome = await db.transaction(async (tx) => {
    // One organiser tapping Confirm twice, or on two phones, must not overfill the trip.
    await tx.execute(sql`SELECT id FROM trip_plans WHERE id = ${p.id} FOR UPDATE`);
    const [m] = await tx.select({ status: schema.tripPlanMembers.status }).from(schema.tripPlanMembers)
      .where(and(eq(schema.tripPlanMembers.planId, p.id), eq(schema.tripPlanMembers.userId, userId))).limit(1);
    if (!m) return 'missing' as const;
    if (m.status === target) return 'same' as const;
    if (target === 'accepted' && (await acceptedCount(p.id, tx)) + 1 >= p.seats) return 'full' as const;
    await tx.update(schema.tripPlanMembers).set({ status: target })
      .where(and(eq(schema.tripPlanMembers.planId, p.id), eq(schema.tripPlanMembers.userId, userId)));
    return 'changed' as const;
  });
  if (outcome === 'missing') return res.status(404).json({ detail: 'No request from this person' });
  if (outcome === 'full') return res.status(409).json({ detail: 'The trip is full. Add seats to confirm more people.', code: 'full' });

  if (outcome === 'changed') {
    await addInAppNotification(userId, target === 'accepted'
      ? {
        kind: 'plan_join_accepted',
        title: 'You are in',
        body: `${row.organiser.name} confirmed you for "${p.title}".`,
        msg: { key: 'plan_join_accepted', params: { guest: row.organiser.name, plan: p.title } },
        refId: p.id,
      }
      : {
        kind: 'plan_join_declined',
        title: 'Not confirmed for a trip',
        body: `${row.organiser.name} could not confirm you for "${p.title}".`,
        msg: { key: 'plan_join_declined', params: { guest: row.organiser.name, plan: p.title } },
        refId: p.id,
      });
  }
  const [plan] = await plansOut([row], req.user!, { requests: true });
  res.json({ plan });
});

/**
 * @openapi
 * /plans/{id}/save:
 *   post:
 *     summary: Save a trip plan for later (traveller mode)
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 *   delete:
 *     summary: Remove a trip plan from your saved ones
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/save', authenticateToken, requireTravellerMode, async (req: Request, res: Response) => {
  if (req.user!.role === 'admin') return res.status(403).json({ detail: 'Sign in as a traveller to save a trip' });
  const row = await loadPlan(routeParam(req, 'id'));
  if (!row || !(await canView(row, req.user!))) return res.status(404).json({ detail: 'Plan not found' });
  await db.insert(schema.tripPlanSaves)
    .values({ planId: row.plan.id, userId: req.user!.id, createdAt: new Date().toISOString() })
    .onConflictDoNothing();
  res.json({ ok: true, saved: true });
});

router.delete('/:id/save', authenticateToken, async (req: Request, res: Response) => {
  await db.delete(schema.tripPlanSaves)
    .where(and(eq(schema.tripPlanSaves.planId, routeParam(req, 'id')), eq(schema.tripPlanSaves.userId, req.user!.id)));
  res.json({ ok: true, saved: false });
});

/**
 * @openapi
 * /plans/{id}/hide:
 *   post:
 *     summary: Hide a trip plan from the Feed (admin), e.g. after a report. The organiser still sees it, marked hidden.
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 * /plans/{id}/unhide:
 *   post:
 *     summary: Put a hidden trip plan back (admin)
 *     tags: [Plans]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/:id/hide', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const [row] = await db.update(schema.tripPlans)
    .set({ hiddenAt: new Date().toISOString() })
    .where(eq(schema.tripPlans.id, routeParam(req, 'id')))
    .returning({ id: schema.tripPlans.id });
  if (!row) return res.status(404).json({ detail: 'Plan not found' });
  res.json({ ok: true });
});

router.post('/:id/unhide', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const [row] = await db.update(schema.tripPlans)
    .set({ hiddenAt: null })
    .where(eq(schema.tripPlans.id, routeParam(req, 'id')))
    .returning({ id: schema.tripPlans.id });
  if (!row) return res.status(404).json({ detail: 'Plan not found' });
  res.json({ ok: true });
});

export default router;
