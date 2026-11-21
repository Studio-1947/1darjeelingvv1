import { and, count, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { FREE_HOST_TYPES, HOST_GRACE_BOOKINGS, log } from '../config';
import { db, schema } from '../db';
import { addHostNotification } from './inApp';
import { isCompleted, todayInIndia } from './travellerDashboard';
import { listingCover } from './listingCover';

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
 * Tells the host once the free start has run out. Bookings complete when their last day passes,
 * not on a tap, so this runs from the sweep below as well as after a delivery or a confirmation
 * (a booking with no date is complete at once). Sent once per host: a note already there stops a
 * second one. Never throws.
 */
export async function noteGraceProgress(listingProviderId: string | null | undefined): Promise<void> {
  if (!listingProviderId) return;
  try {
    const [p] = await db.select().from(schema.providers).where(eq(schema.providers.id, listingProviderId)).limit(1);
    const state = await graceStateFor(p);
    if (!state || !state.paused) return;
    const [already] = await db.select({ id: schema.notifications.id }).from(schema.notifications)
      .where(and(eq(schema.notifications.kind, 'host_grace_ended'), eq(schema.notifications.refId, listingProviderId)))
      .limit(1);
    if (already) return;
    await addHostNotification(listingProviderId, {
      kind: 'host_grace_ended',
      title: 'Your free bookings are used up',
      body: `${state.limit} guests have now completed their bookings with you on aangan. Pay for your host plan to keep taking new bookings. Guests already booked are not affected.`,
      msg: { key: 'grace_ended', params: { count: state.limit } },
      refId: listingProviderId,
    });
  } catch {
    /* a missed note must not fail the booking */
  }
}

/** Checks every host on the free start and tells those who have just run out. */
export async function sweepGraceEnded(): Promise<void> {
  const onGrace = await db.select({ id: schema.providers.id }).from(schema.providers)
    .where(and(eq(schema.providers.status, 'active'), eq(schema.providers.grace, true)));
  for (const p of onGrace) await noteGraceProgress(p.id);
}

/** Runs the sweep now and every 30 minutes, like the request expiry. Never throws. */
export function startGraceSweep(): NodeJS.Timeout {
  const run = () => sweepGraceEnded().catch((err) => log.warn(`[grace] sweep failed: ${(err as Error).message}`));
  void run();
  const timer = setInterval(run, 30 * 60 * 1000);
  timer.unref();
  return timer;
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
    extras: p.extras || {},
    createdAt: new Date().toISOString(),
  });
}
