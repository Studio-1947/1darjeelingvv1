import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { ownListingIds } from './hostAccess';

/**
 * Listing types whose provider number is released by a booking rather than published.
 *
 * Homestays and drivers are the two things a guest books, and the introduction that comes with a
 * confirmed booking is what the product sells. Cafés, shops and events are never booked, only
 * contacted, so their number is public by design and is not listed here.
 */
export const PHONE_GATED_TYPES = new Set(['homestay', 'driver', 'guide']);

type Viewer = { id: string; role: string } | null;

/**
 * Contact details a host's listing can carry in `extras`: onboarding has always copied the contact
 * phone there, and the profile adds a WhatsApp number. They are the same number `provider_phone`
 * gates, so they must never travel past that gate in the free-form extras.
 */
const CONTACT_EXTRAS = ['contact_phone', 'host_phone', 'whatsapp', 'phone', 'mobile', 'email'];

/**
 * Social links a traveller could message the host through (Instagram, Facebook, YouTube) follow
 * the same gate. The business website does not: it is the host's own showcase, so it stays public.
 */
const PUBLIC_SOCIAL = ['website'];

/** The host's social links as a caller may see them: only the website unless the gate is open. */
export function publicSocial(social: unknown, contactVisible: boolean): Record<string, string> {
  if (!social || typeof social !== 'object' || Array.isArray(social)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(social as Record<string, unknown>)) {
    if (typeof v === 'string' && v && (contactVisible || PUBLIC_SOCIAL.includes(k))) out[k] = v;
  }
  return out;
}

/**
 * A listing's extras as a caller may see them: the contact numbers and messaging links are dropped
 * unless the caller may see the provider's phone. For a list (no per-viewer check) pass whether
 * the type is gated.
 */
export function publicExtras(extras: unknown, phoneVisible: boolean): Record<string, unknown> {
  const e = extras && typeof extras === 'object' && !Array.isArray(extras) ? { ...(extras as Record<string, unknown>) } : {};
  if (!phoneVisible) {
    for (const key of CONTACT_EXTRAS) delete e[key];
    if ('social' in e) {
      const kept = publicSocial(e.social, false);
      if (Object.keys(kept).length) e.social = kept;
      else delete e.social;
    }
  }
  return e;
}

/** For lists, which carry no phone at all: numbers stay only on types whose phone is public anyway. */
export function listExtras(type: string, extras: unknown): Record<string, unknown> {
  return publicExtras(extras, !PHONE_GATED_TYPES.has(type));
}

/**
 * Whether this caller may be shown the provider's number for a listing.
 *
 * Everyone, for a type that is not gated. For a gated type: the provider who owns the listing, an
 * admin, and a guest with a confirmed booking on that listing. A pending, accepted or cancelled
 * booking does not count — the number is the reward for a booking that is actually on. The aangan
 * pass does not open it either: a member still books, the pass just makes confirming free.
 */
export async function canSeeProviderPhone(
  listing: { id: string; type: string; providerId: string },
  viewer: Viewer
): Promise<boolean> {
  if (!PHONE_GATED_TYPES.has(listing.type)) return true;
  if (!viewer) return false;
  if (viewer.role === 'admin') return true;

  // Neither the aangan pass nor a host account opens another host's number: the pass only makes
  // confirming a booking free, and being a host is not a booking. The number stays the reward of a
  // confirmed booking, checked here at the server so no copied URL or altered client can skip it.

  // Listings an admin created on someone's behalf carry a bare user id instead of a provider id,
  // so ownership is checked against both, the same way bookings do it.
  if (viewer.id === listing.providerId) return true;
  if ((await ownListingIds(viewer.id)).includes(listing.providerId)) return true;

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
