/**
 * Quick host sign-up: tap-to-fill helpers for hosts who find typing hard.
 *
 * KEEP IDENTICAL with the app's src/lib/hostQuickFill.ts: the website and the app offer the same
 * chips, the same prices and the same links.
 */

export const HOST_TYPES = ['homestay', 'driver', 'guide', 'cafe', 'shop'] as const;
export type HostType = (typeof HOST_TYPES)[number];

export const isHostType = (v: unknown): v is HostType =>
  typeof v === 'string' && (HOST_TYPES as readonly string[]).includes(v);

/** Short phrases a host taps to describe their business. Each becomes one sentence. */
export const DESCRIPTION_CHIPS: Record<HostType, string[]> = {
  homestay: [
    'Family-run home',
    'Mountain view',
    'Home-cooked food',
    'Clean rooms',
    'Hot water',
    'Parking',
    'Wi-Fi',
    'Quiet and peaceful',
  ],
  driver: [
    'Experienced hill driver',
    'Clean, well-kept car',
    'Pickups from NJP and Bagdogra',
    'Sightseeing tours',
    'Safe and on time',
    'Knows every viewpoint',
  ],
  guide: [
    'Born and raised here',
    'Trekking routes',
    'Tea garden walks',
    'Monastery visits',
    'Local history and stories',
    'Photography spots',
  ],
  cafe: [
    'Fresh momos',
    'Hot thukpa',
    'Darjeeling tea',
    'Seating with a view',
    'Vegetarian options',
    'Family-friendly',
  ],
  shop: [
    'Local handicrafts',
    'Darjeeling tea',
    'Woollens',
    'Gifts and souvenirs',
    'Fair prices',
  ],
};

const LEAD: Record<HostType, string> = {
  homestay: 'A homestay',
  driver: 'A local taxi driver',
  guide: 'A local guide',
  cafe: 'A cafe',
  shop: 'A local shop',
};

/** The opening sentence a description starts with when the host has typed nothing yet. */
export function descriptionLead(type: HostType, place?: string): string {
  const where = (place || '').split(',')[0].trim();
  return where ? `${LEAD[type]} in ${where}.` : `${LEAD[type]} in Darjeeling.`;
}

const sentence = (chip: string) => `${chip}.`;

/** Whether this chip's sentence is in the description. */
export function chipOn(text: string, chip: string): boolean {
  return (text || '').includes(sentence(chip));
}

/**
 * Adds the chip's sentence to the description, or takes it out. Whatever the host typed stays as
 * it is. An empty description starts with the lead sentence ("A homestay in Ghoom.").
 */
export function toggleDescriptionChip(text: string, chip: string, type: HostType, place?: string): string {
  const current = (text || '').trim();
  const s = sentence(chip);
  if (current.includes(s)) {
    const without = current.replace(s, '').replace(/\s{2,}/g, ' ').trim();
    // Only the lead sentence left: nothing the host chose remains, so start empty again.
    return without === descriptionLead(type, place) ? '' : without;
  }
  const base = current || descriptionLead(type, place);
  return `${base} ${s}`.trim();
}

/** Common prices, in whole rupees, offered as one-tap choices. The host can still type their own. */
export const PRICE_SUGGESTIONS: Record<HostType, number[]> = {
  homestay: [1000, 1500, 2000, 2500],
  driver: [1500, 2500, 3500, 4500],
  guide: [800, 1200, 1500, 2000],
  cafe: [100, 200, 300, 500],
  shop: [100, 200, 500, 1000],
};

/** Places across the Darjeeling hills, to name where a phone's position is. */
export const LANDMARKS: Array<{ name: string; lat: number; lon: number }> = [
  { name: 'Chowrasta / The Mall, Darjeeling', lat: 27.0425, lon: 88.2663 },
  { name: 'Darjeeling Railway Station', lat: 27.0387, lon: 88.26 },
  { name: 'Chowk Bazaar, Darjeeling', lat: 27.0445, lon: 88.2635 },
  { name: 'Observatory Hill (Mahakal Temple)', lat: 27.044, lon: 88.265 },
  { name: 'Darjeeling Gymkhana Club', lat: 27.0442, lon: 88.262 },
  { name: 'Nehru Road (Glenary’s)', lat: 27.0405, lon: 88.2645 },
  { name: 'Padmaja Naidu Zoo & HMI, Jawahar Parbat', lat: 27.048, lon: 88.257 },
  { name: 'Darjeeling Ropeway, Singamari', lat: 27.058, lon: 88.256 },
  { name: 'Happy Valley Tea Estate', lat: 27.055, lon: 88.256 },
  { name: 'Lebong', lat: 27.062, lon: 88.264 },
  { name: 'Tenzing & Gombu Rock, Lebong Cart Road', lat: 27.05, lon: 88.26 },
  { name: 'Lloyd’s Botanical Garden', lat: 27.037, lon: 88.258 },
  { name: 'Dhirdham Temple', lat: 27.037, lon: 88.261 },
  { name: 'Peace Pagoda & Japanese Temple, Jalapahar', lat: 27.0333, lon: 88.2606 },
  { name: 'Lal Kothi, Jalapahar Road', lat: 27.035, lon: 88.263 },
  { name: 'Batasia Loop & War Memorial', lat: 27.0163, lon: 88.2586 },
  { name: 'Ghum Railway Station', lat: 27.0087, lon: 88.253 },
  { name: 'Ghum Monastery (Yiga Choeling)', lat: 27.006, lon: 88.254 },
  { name: 'Jorebunglow', lat: 27.006, lon: 88.26 },
  { name: 'Tiger Hill', lat: 27.0028, lon: 88.267 },
  { name: 'Rock Garden (Barbotey)', lat: 27.0, lon: 88.238 },
  { name: 'Sonada', lat: 26.98, lon: 88.229 },
  { name: 'Sukhiapokhri', lat: 26.994, lon: 88.177 },
  { name: 'Lepchajagat', lat: 27.029, lon: 88.201 },
  { name: 'Takdah', lat: 27.033, lon: 88.36 },
  { name: 'Lamahatta', lat: 27.078, lon: 88.365 },
  { name: 'Kurseong Railway Station', lat: 26.88, lon: 88.279 },
  { name: 'Mirik Lake (Sumendu)', lat: 26.887, lon: 88.187 },
];

/** Distance between two points in km (haversine). */
export function kmBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * A name for where the host is standing: the nearest known place, as "Near Ghum Railway Station".
 * Null when nothing is within 15 km, so a far-off position is not given a wrong name.
 */
export function nearestAreaLabel(lat: number, lon: number): string | null {
  let best: { name: string; km: number } | null = null;
  for (const l of LANDMARKS) {
    const km = kmBetween({ lat, lon }, l);
    if (!best || km < best.km) best = { name: l.name, km };
  }
  if (!best || best.km > 15) return null;
  return best.km < 0.3 ? best.name : `Near ${best.name}`;
}

/** An invite code as the sign-in accepts it: letters, digits and dashes, at most 20 (admin codes like amitAangan26). */
export function cleanRef(raw: unknown): string {
  return typeof raw === 'string' ? raw.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 20) : '';
}

/**
 * The shortcut link for posters and field staff: opens host sign-up with the business type
 * already picked and the inviter's code filled in. Turn it into a QR code to print.
 */
export function hostJoinLink(origin: string, opts: { type?: HostType | null; ref?: string | null } = {}): string {
  const q = new URLSearchParams();
  if (opts.type && isHostType(opts.type)) q.set('type', opts.type);
  const ref = cleanRef(opts.ref);
  if (ref) q.set('ref', ref);
  const qs = q.toString();
  return `${origin.replace(/\/+$/, '')}/provider/onboard${qs ? `?${qs}` : ''}`;
}

/** Reads `?type=` and `?ref=` from a shortcut link, dropping anything that is not valid. */
export function readHostLink(params: { type?: unknown; ref?: unknown }): { type: HostType | null; ref: string } {
  return { type: isHostType(params.type) ? params.type : null, ref: cleanRef(params.ref) };
}

const TYPE_WORD: Record<HostType, string> = {
  homestay: 'homestay',
  driver: 'taxi',
  guide: 'guide service',
  cafe: 'cafe',
  shop: 'shop',
};

/**
 * wa.me link to the aangan team with the message already written, for the "Support" link.
 * Null when there is no usable help number.
 */
export function helpWhatsAppLink(supportPhone: string | null | undefined, opts: { type?: HostType | null; name?: string; phone?: string } = {}): string | null {
  let digits = (supportPhone || '').replace(/\D/g, '');
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length < 11 || digits.length > 15) return null;
  const what = opts.type ? TYPE_WORD[opts.type] : 'business';
  const lines = [
    `Hello aangan team, I want to list my ${what} on aangan. Please help me sign up.`,
    opts.name?.trim() ? `Name: ${opts.name.trim()}` : '',
    opts.phone?.trim() ? `Phone: ${opts.phone.trim()}` : '',
  ].filter(Boolean);
  return `https://wa.me/${digits}?text=${encodeURIComponent(lines.join('\n'))}`;
}

/** The free start as the host sees it (server: lib/hostGrace.ts). */
export type GraceState = { used: number; limit: number; paused: boolean };

/** Free bookings left, never below zero. */
export const graceLeft = (g: GraceState | null | undefined): number => (g ? Math.max(g.limit - g.used, 0) : 0);
