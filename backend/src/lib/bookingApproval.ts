import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';

/**
 * Board: "Book > Waiting for approval > Call/WhatsApp" for drivers and homestays, and for guides
 * "based on availability, confirm". A booking for one of these types, on a listing run by a real
 * host, starts as a request: the host accepts it (PATCH /bookings/:id/confirm) and only then can
 * the guest confirm it with the pass or the ₹1 fee.
 *
 * Listings with no host account behind them (curated or sample listings the team created) have
 * nobody to accept, so they keep confirming straight away.
 */
export const HOST_APPROVAL_TYPES = new Set(['homestay', 'driver', 'guide']);

export const AWAITING_HOST_DETAIL =
  "The host hasn't accepted this request yet. You can confirm it as soon as they do.";

/** Of these provider ids, the ones that are real hosts (a providers row exists). */
export async function realHostIds(providerIds: string[]): Promise<Set<string>> {
  const ids = [...new Set(providerIds.filter(Boolean))];
  if (!ids.length) return new Set();
  const rows = await db.select({ id: schema.providers.id }).from(schema.providers)
    .where(inArray(schema.providers.id, ids));
  return new Set(rows.map((r) => r.id));
}

/** Does a booking of this type, on a listing with this provider id, need the host to accept it? */
export function approvalRequired(listingType: string, providerId: string | null | undefined, hosts: Set<string>): boolean {
  return HOST_APPROVAL_TYPES.has(listingType) && !!providerId && hosts.has(providerId);
}

/**
 * Is this booking still waiting for the host? True only for a request (pending_payment) that
 * needs approval. Accepted, confirmed and cancelled bookings are never "awaiting host".
 */
export async function isAwaitingHost(booking: { status: string; listingId: string; listingType: string }): Promise<boolean> {
  if (booking.status !== 'pending_payment' || !HOST_APPROVAL_TYPES.has(booking.listingType)) return false;
  const [listing] = await db.select({ providerId: schema.listings.providerId, type: schema.listings.type })
    .from(schema.listings).where(eq(schema.listings.id, booking.listingId)).limit(1);
  if (!listing) return false;
  // Judge on the listing's own type too: the booking's type is what the client claimed.
  const type = HOST_APPROVAL_TYPES.has(listing.type) ? listing.type : booking.listingType;
  return approvalRequired(type, listing.providerId, await realHostIds([listing.providerId]));
}
