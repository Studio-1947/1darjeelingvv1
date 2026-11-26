import { and, count, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { FREE_HOST_TYPES, HOST_GRACE_BOOKINGS, log } from '../config';
import { db, schema } from '../db';
import { addHostNotification } from './inApp';
import { isCompleted, todayInIndia } from './travellerDashboard';
import { listingCover } from './listingCover';
import { listingGraceState, newListingPlan } from './listingPlan';

type Provider = typeof schema.providers.$inferSelect;
type Executor = Pick<typeof db, 'select' | 'update' | 'insert'>;

/**
 * Free start for new hosts (user decision 2026-11-07).
 *
 * A host can go live without paying ("Start free"). Their documents still have to be approved
 * first, as for everyone. Once HOST_GRACE_BOOKINGS bookings are completed (user decision
 * 2026-11-08: completed, not just confirmed - the stay, ride or tour has taken place; delivered
 * home-delivery orders count too, so cafes and shops can reach it), new bookings pause: the
 * listing stays visible, trips already booked go ahead, and requests already waiting can still be
 * accepted. Paying the first year (provider_registration) ends the grace and starts their year.
 *
 * "Completed" is the traveller dashboard's rule (lib/travellerDashboard.ts isCompleted): a
 * confirmed booking whose last day has gone by, or that never had a date.
 */

export interface GraceState {
  /** Completed bookings plus delivered orders so far. */
  used: number;
  limit: number;
  /** True once `used` has reached `limit`: new bookings are refused until the host pays. */
  paused: boolean;
}

/** On the free start: active, never paid. */
export const isOnGrace = (p: Pick<Provider, 'status' | 'grace'> | null | undefined): boolean =>
  !!p && p.status === 'active' && !!p.grace;

/** Completed bookings on the host's listings plus their delivered orders. */
export async function graceUsed(providerId: string, tx: Pick<typeof db, 'select'> = db): Promise<number> {
  const confirmed = await tx.select({ status: schema.bookings.status, checkIn: schema.bookings.checkIn, checkOut: schema.bookings.checkOut })
    .from(schema.bookings)
    .innerJoin(schema.listings, eq(schema.listings.id, schema.bookings.listingId))
    .where(and(eq(schema.listings.providerId, providerId), eq(schema.bookings.status, 'confirmed')));
  const today = todayInIndia();
  const done = confirmed.filter((b) => isCompleted(b, today)).length;
  const [d] = await tx.select({ n: count() })
    .from(schema.deliveryRequests)
    .where(and(eq(schema.deliveryRequests.providerId, providerId), eq(schema.deliveryRequests.status, 'delivered')));
  return done + Number(d?.n ?? 0);
}

/** The host's grace, or null for a host who has paid (or is not active). */
export async function graceStateFor(p: Provider | null | undefined): Promise<GraceState | null> {
  if (!p || !isOnGrace(p)) return null;
  // Local shops list free: their free start never runs out.
  if (p.businessType && FREE_HOST_TYPES.has(p.businessType)) return null;
  const used = await graceUsed(p.id);
  return { used, limit: HOST_GRACE_BOOKINGS, paused: used >= HOST_GRACE_BOOKINGS };
}

/**
 * Whether a listing's host has used up the free start and has not paid yet. Listings with no
 * provider row (spots, team-made listings) never are.
 */
export async function isGracePaused(listingProviderId: string | null | undefined): Promise<boolean> {
  if (!listingProviderId) return false;
  const [p] = await db.select().from(schema.providers).where(eq(schema.providers.id, listingProviderId)).limit(1);
  return !!(await graceStateFor(p))?.paused;
}

export const GRACE_PAUSED_DETAIL = 'This host is not taking new bookings right now. Please try another place.';
export const GRACE_PAUSED_CODE = 'host_plan_required';

/**
 * Tells the host once a listing's free start has run out (plans are per listing, lib/listingPlan.ts).
 * Bookings complete when their last day passes, not on a tap, so this runs from the sweep below as
 * well as after a delivery or a confirmation (a booking with no date is complete at once). Sent
 * once per listing: a note already there stops a second one. Never throws.
 */
export async function noteGraceProgress(listingProviderId: string | null | undefined): Promise<void> {
  if (!listingProviderId) return;
  try {
    const onGrace = await db.select({ id: schema.listings.id, type: schema.listings.type, title: schema.listings.title, planGrace: schema.listings.planGrace })
      .from(schema.listings)
      .where(and(eq(schema.listings.providerId, listingProviderId), eq(schema.listings.planGrace, true)));
    for (const l of onGrace) {
      const state = await listingGraceState(l);
      if (!state || !state.paused) continue;
      const [already] = await db.select({ id: schema.notifications.id }).from(schema.notifications)
        .where(and(eq(schema.notifications.kind, 'host_grace_ended'), eq(schema.notifications.refId, l.id)))
        .limit(1);
      if (already) continue;
      await addHostNotification(listingProviderId, {
        kind: 'host_grace_ended',
        title: `Free bookings used up: ${l.title}`,
        body: `${state.limit} guests have now completed their bookings at ${l.title} on aangan. Pay for its yearly membership to keep taking new bookings there. Guests already booked are not affected.`,
        msg: { key: 'grace_ended', params: { count: state.limit } },
        refId: l.id,
      });
    }
  } catch {
    /* a missed note must not fail the booking */
  }
}

/** Checks every business with a listing on its free start and tells those that have just run out. */
export async function sweepGraceEnded(): Promise<void> {
  const rows = await db.selectDistinct({ id: schema.listings.providerId }).from(schema.listings)
    .where(eq(schema.listings.planGrace, true));
  for (const r of rows) await noteGraceProgress(r.id);
}

/** Runs the sweep now and every 30 minutes, like the request expiry. Never throws. */
export function startGraceSweep(): NodeJS.Timeout {
  const run = () => sweepGraceEnded().catch((err) => log.warn(`[grace] sweep failed: ${(err as Error).message}`));
  void run();
  const timer = setInterval(run, 30 * 60 * 1000);
  timer.unref();
  return timer;
}

/** The business extras as the first listing's, with a pin confirmed at sign-up stamped on it. */
function verifiedFromSignUp(extras: unknown): Record<string, unknown> {
  const e = { ...((extras as Record<string, unknown>) || {}) };
  const v = e.location_verification as { verified_at?: string; source?: string; accuracy_m?: number; gps_gap_m?: number } | undefined;
  if (v?.verified_at && v.source) {
    e.location_verified = {
      verified_at: v.verified_at, source: v.source,
      ...(v.accuracy_m !== undefined ? { accuracy_m: v.accuracy_m } : {}),
      ...(v.gps_gap_m !== undefined ? { gps_gap_m: v.gps_gap_m } : {}),
    };
  }
  return e;
}

/**
 * Puts the host's first listing live, made from their profile. Used when the first year is paid
 * and when a host starts free; each runs once per host, so the listing is made once.
 */
export async function publishFirstListing(tx: Executor, p: Provider): Promise<void> {
  await tx.insert(schema.listings).values({
    id: uuidv4(),
    title: p.businessName,
    type: p.businessType,
    description: p.description,
    location: p.location,
    latitude: p.latitude,
    longitude: p.longitude,
    price: Number(p.priceFrom || 0),
    image: listingCover((p.images || [])[0], p.extras),
    tags: (p.extras as any)?.tags || [],
    providerId: p.id,
    // A place confirmed at sign-up (lib/locationCheck.ts) is this listing's verified pin.
    extras: verifiedFromSignUp(p.extras),
    createdAt: new Date().toISOString(),
    // On its own free start; paying the first year settles it at once (routes/payments.ts).
    ...newListingPlan(p.businessType),
  });
}
