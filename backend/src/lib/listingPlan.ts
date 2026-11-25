import { and, count, eq, sql } from 'drizzle-orm';
import { FREE_HOST_TYPES, HOST_GRACE_BOOKINGS } from '../config';
import { db, schema } from '../db';
import { computeHostPlanExpiry } from './hostPlan';
import { hostPlanBreakup } from './pricing';
import { isCompleted, todayInIndia } from './travellerDashboard';

/**
 * One yearly membership per listing (user decision 2026-11-25). A host with a homestay and a car
 * pays for each: the price follows the listing's own type (lib/pricing.ts hostPlanBase: ₹99 for a
 * cafe, ₹499 for the rest), local shops list free, and spots, events and nature entries have no
 * plan at all.
 *
 * Each listing:
 * - starts on its own free start (`plan_grace`): live, taking bookings until HOST_GRACE_BOOKINGS
 *   of its own bookings are completed (delivered orders count too), then new bookings pause until
 *   its first year is paid;
 * - once paid, has a year (`plan_expires_at`) and a membership card number (`member_no`);
 * - leaves the public feed once that year has passed, until it is renewed.
 *
 * The business keeps a summary for the checks that are about the whole business (posting in the
 * Feed, the Member badge on the business, the admin view): `providers.plan_expires_at` follows the
 * latest year among its listings and `providers.grace` stays true until any listing is paid
 * (syncProviderPlan). Approval (the document check) stays with the business.
 */

type Executor = Pick<typeof db, 'select' | 'update' | 'insert' | 'execute'>;
type Listing = typeof schema.listings.$inferSelect;

/** The listing types that take a paid yearly plan. */
export const PLAN_TYPES: ReadonlySet<string> = new Set(['homestay', 'driver', 'guide', 'cafe']);

/** Whether a listing of this type pays for a plan (a shop lists free; a spot has none). */
export const needsPlan = (type: string | null | undefined): boolean =>
  !!type && PLAN_TYPES.has(type) && !FREE_HOST_TYPES.has(type);

export type ListingPlanRow = Pick<Listing, 'type' | 'planExpiresAt' | 'planGrace'>;

/** A paid year that has run out (never true for a free start, a free type, or no year at all). */
export function isListingPlanLapsed(row: ListingPlanRow, now: Date = new Date()): boolean {
  if (!needsPlan(row.type) || row.planGrace || !row.planExpiresAt) return false;
  const expiry = Date.parse(row.planExpiresAt);
  return !Number.isNaN(expiry) && expiry <= now.getTime();
}

/** Inside a paid year: the listing is a member (its card and the Member badge). */
export function isListingMember(row: ListingPlanRow, now: Date = new Date()): boolean {
  if (!needsPlan(row.type) || row.planGrace || !row.planExpiresAt) return false;
  const expiry = Date.parse(row.planExpiresAt);
  return !Number.isNaN(expiry) && expiry > now.getTime();
}

/**
 * The public-feed predicate: a listing is hidden while its own paid year has passed. A free
 * start, a free type, or no year at all (spots, team-made listings) stays visible. Stored expiries
 * are ISO-8601 UTC strings in one fixed format, so comparing them as text orders them correctly.
 */
export function listingPlanVisibility(now: Date = new Date()) {
  return sql`NOT (
    ${schema.listings.planExpiresAt} IS NOT NULL
      AND ${schema.listings.planExpiresAt} <= ${now.toISOString()}
      AND NOT ${schema.listings.planGrace}
  )`;
}

/** The next membership card number: AGN-00001, AGN-00002, ... */
export async function nextMemberNo(tx: Executor = db): Promise<string> {
  const result = await tx.execute(sql`SELECT nextval('listing_member_no_seq') AS n`);
  const n = Number((result as unknown as { rows: { n: string | number }[] }).rows[0].n);
  return `AGN-${String(n).padStart(5, '0')}`;
}

/** What one year of this listing's plan costs (first year or renewal: the same price). */
export function listingPlanBreakup(type: string | null | undefined, flow: 'listing_plan' | 'listing_renewal' = 'listing_plan') {
  return hostPlanBreakup(type, flow === 'listing_plan' ? 'provider_registration' : 'provider_renewal');
}

/** A new listing's plan fields: its own free start when its type pays, nothing otherwise. */
export const newListingPlan = (type: string | null | undefined) => ({ planGrace: needsPlan(type) });

/** Completed bookings on this listing plus its delivered orders. */
export async function listingGraceUsed(listingId: string, tx: Pick<typeof db, 'select'> = db): Promise<number> {
  const confirmed = await tx.select({ status: schema.bookings.status, checkIn: schema.bookings.checkIn, checkOut: schema.bookings.checkOut })
    .from(schema.bookings)
    .where(and(eq(schema.bookings.listingId, listingId), eq(schema.bookings.status, 'confirmed')));
  const today = todayInIndia();
  const done = confirmed.filter((b) => isCompleted(b, today)).length;
  const [d] = await tx.select({ n: count() })
    .from(schema.deliveryRequests)
    .where(and(eq(schema.deliveryRequests.listingId, listingId), eq(schema.deliveryRequests.status, 'delivered')));
  return done + Number(d?.n ?? 0);
}

export interface ListingGraceState { used: number; limit: number; paused: boolean }

/** The listing's free start, or null when it is paid, free, or has no plan. */
export async function listingGraceState(l: Pick<Listing, 'id' | 'type' | 'planGrace'> | null | undefined): Promise<ListingGraceState | null> {
  if (!l || !l.planGrace || !needsPlan(l.type)) return null;
  const used = await listingGraceUsed(l.id);
  return { used, limit: HOST_GRACE_BOOKINGS, paused: used >= HOST_GRACE_BOOKINGS };
}

/** Whether this listing has used up its free start and is not paid yet: new bookings wait. */
export async function isListingGracePaused(listingId: string | null | undefined): Promise<boolean> {
  if (!listingId) return false;
  const [l] = await db.select({ id: schema.listings.id, type: schema.listings.type, planGrace: schema.listings.planGrace })
    .from(schema.listings).where(eq(schema.listings.id, listingId)).limit(1);
  return !!(await listingGraceState(l))?.paused;
}

/**
 * Keeps the business's summary in step with its listings: the latest paid year among them, and the
 * free start over once any listing has been paid. Never moves the business's year backwards.
 */
export async function syncProviderPlan(tx: Executor, providerId: string): Promise<void> {
  const rows = await tx.select({ planExpiresAt: schema.listings.planExpiresAt, planGrace: schema.listings.planGrace, type: schema.listings.type })
    .from(schema.listings).where(eq(schema.listings.providerId, providerId));
  const paid = rows.filter((r) => needsPlan(r.type) && !r.planGrace && r.planExpiresAt).map((r) => r.planExpiresAt as string);
  if (!paid.length) return;
  const latest = paid.sort().at(-1) as string;
  const [p] = await tx.select({ planExpiresAt: schema.providers.planExpiresAt, activatedAt: schema.providers.activatedAt })
    .from(schema.providers).where(eq(schema.providers.id, providerId)).limit(1);
  if (!p) return;
  await tx.update(schema.providers)
    .set({
      status: 'active',
      grace: false,
      activatedAt: p.activatedAt || new Date().toISOString(),
      planExpiresAt: p.planExpiresAt && p.planExpiresAt > latest ? p.planExpiresAt : latest,
    })
    .where(eq(schema.providers.id, providerId));
}

/**
 * A listing's year is paid (first year or renewal): its free start ends, its year runs from its
 * current end (renewing early adds to it) or from today, and it gets its card number the first
 * time. Then the business's summary follows. Returns the updated listing.
 */
export async function settleListingPlan(tx: Executor, listingId: string): Promise<Listing | null> {
  const [l] = await tx.select().from(schema.listings).where(eq(schema.listings.id, listingId)).limit(1);
  if (!l) return null;
  const [updated] = await tx.update(schema.listings)
    .set({
      planGrace: false,
      planExpiresAt: computeHostPlanExpiry(l.planGrace ? null : l.planExpiresAt),
      memberNo: l.memberNo || await nextMemberNo(tx),
    })
    .where(eq(schema.listings.id, listingId))
    .returning();
  await syncProviderPlan(tx, l.providerId);
  return updated ?? null;
}

/** What the dashboard and the apps show for a listing's membership. */
export async function listingPlanShape(l: Listing, now: Date = new Date()) {
  if (!needsPlan(l.type)) return { needed: false as const, free: FREE_HOST_TYPES.has(l.type) };
  const grace = await listingGraceState(l);
  const breakup = listingPlanBreakup(l.type);
  return {
    needed: true as const,
    member: isListingMember(l, now),
    lapsed: isListingPlanLapsed(l, now),
    on_free_start: !!l.planGrace,
    grace,
    expires_at: l.planGrace ? null : l.planExpiresAt,
    member_no: l.memberNo,
    price: breakup,
  };
}
