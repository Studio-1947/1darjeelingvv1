import { inArray, or, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { canSeeProviderPhone, listExtras, publicSocial } from './listingContact';
import { isHostPlanLive } from './hostPlan';
import { isListingPlanLapsed } from './listingPlan';
import { pagePath } from './providerSlug';
import { homeDeliveryEnabled } from '../config';
import { themeOf } from './hostProfile';

type Provider = typeof schema.providers.$inferSelect;
type Viewer = { id: string; role: string } | null;

/**
 * The two marks on a host (user decision 2026-11-04):
 *   member   - the host's paid plan is live (board: "after payment, aangan verified badge");
 *   verified - aangan has checked their documents (KYC), shown as a blue tick.
 * A suspended host shows neither.
 */
export function hostBadges(p: Pick<Provider, 'status' | 'planExpiresAt' | 'kycStatus'> & { grace?: boolean | null }) {
  const active = p.status === 'active';
  return {
    // A host on the free start has not paid, so is not a member yet.
    member: active && !p.grace && isHostPlanLive(p as Provider),
    verified: active && p.kycStatus === 'verified',
  };
}

/** Whether travellers can see this host at all (the same rule as the public feed). */
export const hostIsPublic = (p: Provider) => p.status === 'active' && isHostPlanLive(p);

const priced = (list: unknown, nameKey = 'name') =>
  (Array.isArray(list) ? list : [])
    .map((r: any) => ({ name: String(r?.[nameKey] ?? r?.name ?? '').trim(), price: Number(r?.price) || 0, unit: r?.unit || undefined, photo: r?.photo || undefined }))
    .filter((r) => r.name);

/** What the host offers, as photo + rate tiles, by host type. */
function itemsFor(type: string, e: Record<string, any>) {
  if (type === 'driver') return priced(e.routes, 'route');
  if (type === 'homestay') return [...priced(e.rooms), ...priced(e.meals)];
  if (type === 'guide') return priced(e.services);
  if (type === 'cafe') return priced(e.menu);
  if (type === 'shop') return priced(e.goods);
  return [];
}

/**
 * The public page of one host: the mini-site data the website and the app render (their
 * HostMiniSite components), the host's listings to book, the latest reviews and the contact line.
 * Phone numbers follow the listing rule (lib/listingContact.ts): for drivers, homestays and guides
 * they (and the social links other than the website) are only sent to the host, admins and guests
 * with a confirmed booking.
 */
export async function buildHostPage(provider: Provider, viewer: Viewer) {
  const listings = await db.select().from(schema.listings)
    .where(or(eq(schema.listings.providerId, provider.id), eq(schema.listings.providerId, provider.userId)));
  const ids = listings.map((l) => l.id);
  const reviews = ids.length ? await db.select().from(schema.reviews).where(inArray(schema.reviews.listingId, ids)) : [];
  const rating = reviews.length ? Math.round((reviews.reduce((a, r) => a + r.rating, 0) / reviews.length) * 10) / 10 : 0;

  // The profile lives on the provider row's extras, and is copied onto each listing.
  const e: Record<string, any> = { ...(listings[0]?.extras || {}), ...(provider.extras || {}) };
  const first = listings[0];
  const phoneOk = first
    ? await canSeeProviderPhone({ id: first.id, type: first.type, providerId: first.providerId }, viewer)
    : provider.businessType === 'cafe' || provider.businessType === 'shop';

  const badges = hostBadges(provider);
  return {
    page: {
      type: provider.businessType,
      slug: provider.slug,
      path: pagePath(provider.businessType, provider.slug),
      name: provider.businessName,
      hostName: e.host_name || undefined,
      avatar: e.host_avatar || undefined,
      cover: provider.images?.[0] || first?.image || undefined,
      member: badges.member,
      verified: badges.verified,
      experienceYears: Number(e.experience_years) || 0,
      joinedAt: provider.createdAt,
      rating,
      reviewCount: reviews.length,
      location: provider.location,
      latitude: provider.latitude,
      longitude: provider.longitude,
      about: e.host_bio || provider.description,
      video: e.intro_video || undefined,
      languages: Array.isArray(e.languages) ? e.languages : [],
      items: itemsFor(provider.businessType, e),
      gallery: (Array.isArray(e.images) ? e.images : provider.images || []).filter(Boolean),
      available: e.available !== false,
      // Cafes and shops only; a homestay that switched it on before 2026-11-21 does not show it.
      // TEMPORARY(legal-pause): homeDeliveryEnabled() gate.
      homeDelivery: homeDeliveryEnabled() && (provider.businessType === 'cafe' || provider.businessType === 'shop') && e.home_delivery === true,
      // Instagram, Facebook and YouTube reach the host as surely as the phone, so they sit behind
      // the same gate; the website is the host's showcase and stays public.
      social: publicSocial(e.social, phoneOk),
      // The business theme colour (a palette key or "#RRGGBB"); absent means aangan's own.
      theme: themeOf(e.theme),
    },
    contact: phoneOk
      ? { phone: provider.contactPhone, whatsapp: e.whatsapp || provider.contactPhone, locked: false }
      : { phone: null, whatsapp: null, locked: true },
    // Each service with what a traveller needs to choose it: what it is, where, the price, its own
    // rating, whether it is taking bookings, and whether its yearly plan is live (per listing,
    // lib/listingPlan.ts: the route hides lapsed ones from everyone but the host).
    listings: listings.map((l) => {
      const own = reviews.filter((r) => r.listingId === l.id);
      return {
        id: l.id, title: l.title, type: l.type, location: l.location, price: l.price, image: l.image,
        description: l.description,
        extras: listExtras(l.type, l.extras),
        available: (l.extras as Record<string, unknown> | null)?.available !== false,
        live: !isListingPlanLapsed(l),
        rating: own.length ? Math.round((own.reduce((a, r) => a + r.rating, 0) / own.length) * 10) / 10 : 0,
        review_count: own.length,
      };
    }),
    reviews: reviews
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 6)
      .map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, author: r.authorName, created_at: r.createdAt })),
  };
}
