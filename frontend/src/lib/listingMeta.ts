import i18n from '@/i18n';
import { WifiHigh as Wifi, ForkKnife as Utensils, Fire as Flame, Mountains as Mountain, Tree as TreePine, House as Home, Park as ParkingCircle, Coffee, Bread as Croissant, Car, Translate as Languages, Clock, ShieldCheck, Suitcase as Luggage, GasPump as Fuel, Storefront as Store, Gift, CreditCard, Package, Leaf, Bank as Landmark, Users, PawPrint, Camera, Sun as Sunrise, MusicNote as Music, Ticket, Tag, Check, Binoculars, Path as Route } from '@phosphor-icons/react';

/**
 * `label` is the canonical English value (also the de-duplication key); OffersSection shows it
 * through `options.*`. Built-in labels with no `options.*` entry carry `labelKey` instead.
 */
export type Amenity = { Icon: any; label: string; labelKey?: string };

/**
 * Listings only carry `tags` - there is no amenities column. We map known tags to
 * icons and top up with type-level defaults so every listing has a filled-out
 * "what it offers" grid. Anything a listing explicitly sets in
 * `extras.amenities` (string[]) wins over both.
 */
const TAG_AMENITIES: { match: RegExp; Icon: any; label: string }[] = [
  { match: /wifi|internet/i, Icon: Wifi, label: 'Wi-Fi' },
  { match: /meals?-?included|breakfast|kitchen/i, Icon: Utensils, label: 'Home-cooked meals' },
  { match: /bakery|pastr/i, Icon: Croissant, label: 'Fresh bakery' },
  { match: /tea|first-flush/i, Icon: Leaf, label: 'Darjeeling tea' },
  { match: /mountain-view|views?|viewpoint|sunrise/i, Icon: Sunrise, label: 'Mountain views' },
  { match: /forest|garden|tea-estate/i, Icon: TreePine, label: 'Garden & forest setting' },
  { match: /family|group/i, Icon: Users, label: 'Good for families & groups' },
  { match: /heritage|monastery|spiritual/i, Icon: Landmark, label: 'Heritage site' },
  { match: /wildlife|endangered|birdlife|state-animal|vulnerable|endemic/i, Icon: PawPrint, label: 'Wildlife spotting' },
  { match: /cultural|gorkha|tibetan|festival|lights/i, Icon: Music, label: 'Cultural experience' },
  { match: /sightseeing|tour|full-day/i, Icon: Route, label: 'Guided sightseeing' },
  { match: /multi-lingual/i, Icon: Languages, label: 'Multi-lingual host' },
  { match: /transfer|airport|long-distance/i, Icon: Luggage, label: 'Airport & long-distance transfers' },
  { match: /crafts|handwoven|artisan|souvenirs|cooperative/i, Icon: Gift, label: 'Local handmade goods' },
  { match: /cozy|peaceful|quiet/i, Icon: Flame, label: 'Quiet & cosy' },
  { match: /photo|iconic/i, Icon: Camera, label: 'Photo spot' },
  { match: /conservation|flora|spring|amphibian/i, Icon: Binoculars, label: 'Nature & conservation' },
];

const TYPE_AMENITIES: Record<string, Amenity[]> = {
  homestay: [
    { Icon: Home, label: 'Family-run home' },
    { Icon: Utensils, label: 'Home-cooked meals' },
    { Icon: Flame, label: 'Hot water & heating' },
    { Icon: Wifi, label: 'Wi-Fi' },
    { Icon: Mountain, label: 'Hill views' },
    { Icon: ParkingCircle, label: 'Parking on site' },
  ],
  driver: [
    { Icon: Car, label: 'Well-kept vehicle' },
    { Icon: ShieldCheck, label: 'Verified local driver' },
    { Icon: Languages, label: 'Speaks Nepali, Hindi & English' },
    { Icon: Clock, label: 'Flexible full-day hire' },
    { Icon: Fuel, label: 'Fuel & tolls included' },
    { Icon: Luggage, label: 'Luggage space' },
  ],
  guide: [
    { Icon: ShieldCheck, label: 'Local guide', labelKey: 'ui.listingMeta.local_guide' },
    { Icon: Route, label: 'Routes planned for you', labelKey: 'ui.listingMeta.routes_planned_for_you' },
    { Icon: Languages, label: 'Speaks the local languages', labelKey: 'ui.listingMeta.speaks_the_local_languages' },
    { Icon: Camera, label: 'Knows the photo spots', labelKey: 'ui.listingMeta.knows_the_photo_spots' },
  ],
  shop: [
    { Icon: Store, label: 'Locally owned' },
    { Icon: Package, label: 'Made in Darjeeling' },
    { Icon: CreditCard, label: 'UPI & cards accepted' },
    { Icon: Gift, label: 'Gift wrapping' },
  ],
  cafe: [
    { Icon: Coffee, label: 'Coffee & Darjeeling tea' },
    { Icon: Utensils, label: 'Full menu' },
    { Icon: Wifi, label: 'Wi-Fi' },
    { Icon: Users, label: 'Walk-ins welcome' },
  ],
  event: [
    { Icon: Ticket, label: 'Open to visitors' },
    { Icon: Music, label: 'Live music & dance' },
    { Icon: Utensils, label: 'Food stalls' },
    { Icon: Camera, label: 'Photo-friendly' },
  ],
  biodiversity: [
    { Icon: Binoculars, label: 'Best seen with a guide' },
    { Icon: TreePine, label: 'Protected habitat' },
    { Icon: PawPrint, label: 'Observe from a distance' },
  ],
  spot: [
    { Icon: Camera, label: 'Photo spot' },
    { Icon: Mountain, label: 'Panoramic views' },
    { Icon: Route, label: 'Easy to reach by taxi' },
  ],
};

const prettify = (tag: string) =>
  tag.replace(/[-_]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Kinds a host lists and runs themselves: their page shows only the facilities they picked. */
const HOST_LISTED = new Set(['homestay', 'driver', 'guide', 'cafe', 'shop']);

export function amenitiesFor(item: any, max = 8): Amenity[] {
  const out: Amenity[] = [];
  const seen = new Set<string>();
  // One entry per facility whatever its case or spacing ("Tea" and "tea" are the same thing).
  const push = (a: Amenity) => {
    const key = a?.label?.trim().toLowerCase();
    if (key && !seen.has(key)) { seen.add(key); out.push(a); }
  };

  const custom: string[] = item?.extras?.amenities || [];
  custom.forEach((label) => {
    const rule = TAG_AMENITIES.find((r) => r.match.test(label));
    push({ Icon: rule?.Icon || Check, label });
  });

  (item?.tags || []).forEach((tag: string) => {
    const rule = TAG_AMENITIES.find((r) => r.match.test(tag));
    push(rule ? { Icon: rule.Icon, label: rule.label } : { Icon: Tag, label: prettify(tag) });
  });

  if ((item?.type === 'cafe' || item?.type === 'shop') && item?.extras?.home_delivery === true) push({ Icon: Package, label: 'Home delivery', labelKey: 'ui.listingMeta.home_delivery' });
  // The type's stock list fills out the team's own listings only. A host's page lists what the host
  // picked and nothing else: a shop that chose "Tea" must not also claim "Gift wrapping".
  const hostOwned = HOST_LISTED.has(item?.type) && !!item?.provider_id && item.provider_id !== 'admin-seed-provider';
  if (!hostOwned) (TYPE_AMENITIES[item?.type] || []).forEach(push);

  return out.slice(0, max);
}

/**
 * Host details for the "Meet your host" section. Seeded listings share a
 * placeholder provider id and carry no host record, so anything we cannot read
 * off `extras` falls back to honest, non-specific copy.
 */
export function hostFor(item: any) {
  const e = item?.extras || {};
  const isRealProvider = !!item?.provider_id && item.provider_id !== 'admin-seed-provider';
  const name: string = e.host_name || (isRealProvider ? item.title : '');
  return {
    // False for a team-added listing with no host on record: the page then leaves "Meet your
    // host" out rather than showing a made-up name, initial and bio.
    known: !!name,
    name,
    initial: name.trim().charAt(0).toUpperCase(),
    // The "Verified" chip must reflect the real KYC signal, not merely "has a provider row" -
    // isRealProvider stays in use above for the name fallback, which is a separate concern.
    verified: !!item?.provider_verified,
    phone: e.host_phone || e.contact_phone || '',
    bio: e.host_bio || i18n.t('ui.listingMeta.default_host_bio'),
    languages: e.languages || ['Nepali', 'Hindi', 'English'],
    avatar: e.host_avatar || '',
  };
}

/** Per-type copy for the "Where you'll be" section. */
export function areaNoteFor(type: string): string {
  switch (type) {
    case 'homestay':
      return i18n.t('ui.listingMeta.area_note.homestay');
    case 'driver':
      return i18n.t('ui.listingMeta.area_note.driver');
    case 'event':
      return i18n.t('ui.listingMeta.area_note.event');
    case 'biodiversity':
      return i18n.t('ui.listingMeta.area_note.biodiversity');
    default:
      return i18n.t('ui.listingMeta.area_note.default');
  }
}
