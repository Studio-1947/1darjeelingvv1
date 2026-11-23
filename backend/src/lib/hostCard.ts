/**
 * Who hosts a listing, as the listing cards show it ("Hosted by Pema"): the name and photo the
 * host gave on their business profile, falling back to any copy on the listing itself (older
 * driver listings carry host_avatar there). Never a phone number or anything else private:
 * contact details open only after a booking is confirmed.
 */
export type HostCard = { name: string; avatar: string | null } | null;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

export function hostCard(providerExtras: unknown, listingExtras: unknown): HostCard {
  const p = (providerExtras && typeof providerExtras === 'object' ? providerExtras : {}) as Record<string, unknown>;
  const l = (listingExtras && typeof listingExtras === 'object' ? listingExtras : {}) as Record<string, unknown>;
  const name = (str(p.host_name) || str(l.host_name)).slice(0, 80);
  if (!name) return null;
  const avatar = str(p.host_avatar) || str(l.host_avatar);
  return { name, avatar: /^https?:\/\//i.test(avatar) ? avatar : null };
}
