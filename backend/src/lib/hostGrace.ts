import { and, count, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { HOST_GRACE_BOOKINGS } from '../config';
import { db, schema } from '../db';
import { addHostNotification } from './inApp';

type Provider = typeof schema.providers.$inferSelect;
type Executor = Pick<typeof db, 'select' | 'update' | 'insert'>;

/**
 * Free start for new hosts (user decision 2026-11-07).
 *
 * A host can go live without paying ("Start free"). Their documents still have to be approved
 * first, as for everyone. Once they have HOST_GRACE_BOOKINGS confirmed bookings (delivered
 * home-delivery orders count too, so cafes and shops can reach it), new bookings pause: the
 * listing stays visible, trips already booked go ahead, and requests already waiting can still be
 * accepted. Paying the first year (provider_registration) ends the grace and starts their year.
 */

export interface GraceState {
  /** Confirmed bookings plus delivered orders so far. */
  used: number;
  limit: number;
  /** True once `used` has reached `limit`: new bookings are refused until the host pays. */
  paused: boolean;
}

/** On the free start: active, never paid. */
export const isOnGrace = (p: Pick<Provider, 'status' | 'grace'> | null | undefined): boolean =>
  !!p && p.status === 'active' && !!p.grace;

/** Confirmed bookings on the host's listings plus their delivered orders. */
export async function graceUsed(providerId: string, tx: Pick<typeof db, 'select'> = db): Promise<number> {
  const [b] = await tx.select({ n: count() })
    .from(schema.bookings)
    .innerJoin(schema.listings, eq(schema.listings.id, schema.bookings.listingId))
    .where(and(eq(schema.listings.providerId, providerId), eq(schema.bookings.status, 'confirmed')));
  const [d] = await tx.select({ n: count() })
    .from(schema.deliveryRequests)
    .where(and(eq(schema.deliveryRequests.providerId, providerId), eq(schema.deliveryRequests.status, 'delivered')));
  return Number(b?.n ?? 0) + Number(d?.n ?? 0);
}

/** The host's grace, or null for a host who has paid (or is not active). */
export async function graceStateFor(p: Provider | null | undefined): Promise<GraceState | null> {
  if (!p || !isOnGrace(p)) return null;
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
 * Tells the host the moment the free start runs out. Called after a booking is confirmed or an
 * order delivered; says nothing before or after the exact count, so it is sent once. Never throws.
 */
export async function noteGraceProgress(listingProviderId: string | null | undefined): Promise<void> {
  if (!listingProviderId) return;
  try {
    const [p] = await db.select().from(schema.providers).where(eq(schema.providers.id, listingProviderId)).limit(1);
    const state = await graceStateFor(p);
    if (!state || state.used !== state.limit) return;
    await addHostNotification(listingProviderId, {
      kind: 'host_grace_ended',
      title: 'Your free bookings are used up',
      body: `You have had ${state.limit} bookings on aangan. Pay for your host plan to keep taking new bookings. Your guests already booked are not affected.`,
      refId: listingProviderId,
    });
  } catch {
    /* a missed note must not fail the booking */
  }
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
    image: (p.images || [''])[0] || '',
    tags: (p.extras as any)?.tags || [],
    providerId: p.id,
    extras: p.extras || {},
    createdAt: new Date().toISOString(),
  });
}
