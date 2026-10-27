import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';

/**
 * Listing types whose provider number is released by a booking rather than published.
 *
 * Homestays and drivers are the two things a guest books, and the introduction that comes with a
 * confirmed booking is what the product sells. Cafés, shops and events are never booked, only
 * contacted, so their number is public by design and is not listed here.
 */
export const PHONE_GATED_TYPES = new Set(['homestay', 'driver']);

type Viewer = { id: string; role: string } | null;

/**
 * Whether this caller may be shown the provider's number for a listing.
 *
 * Everyone, for a type that is not gated. For a gated type: the provider who owns the listing, an
 * admin, and a guest with a confirmed booking on that listing. A pending, accepted or cancelled
 * booking does not count — the number is the reward for a booking that is actually on.
 */
export async function canSeeProviderPhone(
  listing: { id: string; type: string; providerId: string },
  viewer: Viewer
): Promise<boolean> {
  if (!PHONE_GATED_TYPES.has(listing.type)) return true;
  if (!viewer) return false;
  if (viewer.role === 'admin') return true;

  // Listings an admin created on someone's behalf carry a bare user id instead of a provider id,
  // so ownership is checked against both, the same way bookings do it.
  if (viewer.id === listing.providerId) return true;
  const owned = await db
    .select({ id: schema.providers.id })
    .from(schema.providers)
    .where(eq(schema.providers.userId, viewer.id));
  if (owned.some((p) => p.id === listing.providerId)) return true;

  const [confirmed] = await db
    .select({ id: schema.bookings.id })
    .from(schema.bookings)
    .where(
      and(
        eq(schema.bookings.userId, viewer.id),
        eq(schema.bookings.listingId, listing.id),
        eq(schema.bookings.status, 'confirmed')
      )
    )
    .limit(1);
  return Boolean(confirmed);
}
