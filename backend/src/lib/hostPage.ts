import { inArray, or, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { canSeeProviderPhone, listExtras } from './listingContact';
import { isHostApprovalPending, isHostPlanLive } from './hostPlan';
import { pagePath } from './providerSlug';

type Provider = typeof schema.providers.$inferSelect;
type Viewer = { id: string; role: string } | null;

/**
 * The two marks on a host (user decision 2026-11-04):
 *   member   - the host's paid plan is live (board: "after payment, aangan verified badge");
 *   verified - aangan has checked their documents (KYC), shown as a blue tick.
 * A suspended host shows neither.
 */
export function hostBadges(p: Pick<Provider, 'status' | 'planExpiresAt' | 'kycStatus'>) {
  const active = p.status === 'active';
  return {
    member: active && isHostPlanLive(p as Provider),
    verified: active && p.kycStatus === 'verified',
  };
}

/** Whether travellers can see this host at all (the same rule as the public feed). */
export const hostIsPublic = (p: Provider) => p.status === 'active' && !isHostApprovalPending(p) && isHostPlanLive(p);

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
 * they are only sent to pass holders, hosts, admins and guests with a confirmed booking.
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
      homeDelivery: e.home_delivery === true,
      social: e.social && typeof e.social === 'object' ? e.social : {},
    },
    contact: phoneOk
      ? { phone: provider.contactPhone, whatsapp: e.whatsapp || provider.contactPhone, locked: false }
      : { phone: null, whatsapp: null, locked: true },
    listings: listings.map((l) => ({ id: l.id, title: l.title, type: l.type, location: l.location, price: l.price, image: l.image, extras: listExtras(l.type, l.extras) })),
    reviews: reviews
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 6)
      .map((r) => ({ id: r.id, rating: r.rating, comment: r.comment, author: r.authorName, created_at: r.createdAt })),
  };
}
