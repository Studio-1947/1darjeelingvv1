/**
 * Which drivers suit a ride search, and in what order. Used by GET /listings?type=driver.
 *
 * A driver tells us three things about where they work:
 *   - their base: the map pin (and place name) they signed up with;
 *   - areas served (extras.areas): the places they pick travellers up from, each a name with its
 *     position, chosen in the sign-up wizard or on the listing;
 *   - routes (extras.routes): free text such as "NJP Station ↔ Darjeeling", with a fare.
 *
 * A search can ask for a trip (from / to), a place (the place filter), or nearness to a point
 * (My location, within N km). Every driver is weighed here, on the server, so a search covers all
 * of them rather than the first page the browser happened to load.
 *
 * Route matching follows the web's lib/routeFares.ts (same aliases, same rule that both ends sit on
 * one route line); keep the two in step.
 */
import { kmBetween, latLng, placeFor, placeNamed, type LatLng } from './places';

/** How far from a place a driver's base or area may be and still count as serving it. */
export const SERVE_KM = 15;
/** At most this many areas on a listing. */
export const MAX_AREAS = 12;
const MAX_AREA_NAME = 80;

/**
 * The route the sign-up wizard writes for every new driver ("Full day hire", in the language the
 * driver signed up in). It names no place, so it says nothing about where they drive: a driver
 * with only this route has *no routes listed*, not routes that miss the trip.
 */
const GENERIC_ROUTES = ['Full day hire', 'पूरे दिन की बुकिंग', 'সারাদিনের ভাড়া', 'पूरा दिनको भाडा']
  .map((s) => s.trim().toLowerCase());

/**
 * Routes of the three seeded drivers, from the web's editorial map (frontend lib/listingContent.ts),
 * which shows them on the listing page when the row itself has none.
 */
const EDITORIAL_ROUTES: Record<string, string[]> = {
  'Tenzing - Local Taxi Driver': [
    'Full-day Darjeeling sightseeing: Tiger Hill → Batasia Loop → Ghum Monastery',
    'Darjeeling town ↔ Peace Pagoda & Japanese Temple',
    'Zoo, HMI & Ropeway circuit',
  ],
  'Karma - Sumo/SUV Driver': [
    'Darjeeling ↔ Gangtok (Sikkim)',
    'Darjeeling ↔ Kalimpong',
    'Darjeeling ↔ Pelling / Ravangla',
    'Multi-day Sikkim & hills tours',
  ],
  'Prakash - Airport/NJP Transfer': [
    'Bagdogra Airport (IXB) ↔ Darjeeling',
    'NJP Railway Station ↔ Darjeeling',
    'Siliguri ↔ Darjeeling',
  ],
};

type DriverRow = {
  title: string;
  location: string | null;
  latitude: unknown;
  longitude: unknown;
  extras: unknown;
};

const extrasOf = (l: DriverRow): Record<string, unknown> =>
  l.extras && typeof l.extras === 'object' && !Array.isArray(l.extras) ? (l.extras as Record<string, unknown>) : {};

export const isGenericRoute = (route: string) => GENERIC_ROUTES.includes(route.trim().toLowerCase());

/** The route lines a driver lists, the wizard's placeholder left out. */
export function driverRoutes(l: DriverRow): string[] {
  const raw = extrasOf(l).routes;
  const listed = (Array.isArray(raw) ? raw : [])
    .map((r) => (typeof r === 'string' ? r : r && typeof r === 'object' ? String((r as any).route ?? '') : ''))
    .map((r) => r.trim())
    .filter(Boolean);
  if (listed.length) return listed.filter((r) => !isGenericRoute(r));
  return EDITORIAL_ROUTES[l.title] ?? [];
}

export type Area = { name: string; lat: number; lng: number };

/** The areas a driver serves, as saved (bad rows dropped). */
export function driverAreas(l: DriverRow): Area[] {
  return cleanAreas(extrasOf(l).areas) ?? [];
}

/**
 * Areas as a host sends them, made safe to store: a name and a position each, no repeats, at most
 * MAX_AREAS. Null when the value is not a list at all (the caller rejects it).
 */
export function cleanAreas(raw: unknown): Area[] | null {
  if (!Array.isArray(raw)) return null;
  const out: Area[] = [];
  const seen = new Set<string>();
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    const name = String((a as any).name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_AREA_NAME);
    const at = latLng((a as any).lat, (a as any).lng);
    if (!name || !at) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, lat: Number(at.lat.toFixed(5)), lng: Number(at.lng.toFixed(5)) });
    if (out.length >= MAX_AREAS) break;
  }
  return out;
}

/** Every point a driver works from: their base, then each area served. */
export function driverPoints(l: DriverRow): LatLng[] {
  const pts: LatLng[] = [];
  const base = latLng(l.latitude, l.longitude) ?? placeFor(l.location);
  if (base) pts.push(base);
  for (const a of driverAreas(l)) pts.push({ lat: a.lat, lng: a.lng });
  return pts;
}

/** Km from a point to the nearest place the driver works from; null when we know none. */
export function driverKm(l: DriverRow, from: LatLng): number | null {
  const pts = driverPoints(l);
  if (!pts.length) return null;
  return Math.min(...pts.map((p) => kmBetween(from, p)));
}

// ---------------------------------------------------------------- route lines (as lib/routeFares.ts)

const PLACE_ALIASES: string[][] = [
  ['njp', 'new jalpaiguri', 'siliguri', 'jalpaiguri station'],
  ['bagdogra', 'ixb', 'airport'],
  ['darjeeling', 'darj', 'djl', 'dj'],
  ['ghum', 'ghoom'],
  ['kalimpong', 'kpg'],
  ['gangtok', 'gtk'],
  ['kurseong', 'kurseong town'],
  ['mirik'],
  ['sittong'],
  ['lamahatta'],
];
const normalize = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
const hasWord = (line: string, word: string) => normalize(line).includes(normalize(word));
const placeTokens = (place: string) => place.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);

function placeAliases(place: string): string[] {
  const p = normalize(place);
  const group = PLACE_ALIASES.find((names) => names.some((n) => p.includes(normalize(n))));
  return group ? [place, ...group] : [place];
}

/** True when one route line runs through the given place, under any of its names. */
export function routeCoversPlace(route: string, place: string): boolean {
  const line = route.toLowerCase();
  if (line.includes(place.trim().toLowerCase())) return true;
  if (placeAliases(place).slice(1).some((name) => hasWord(route, name))) return true;
  const tokens = placeTokens(place);
  return tokens.length > 0 && tokens.every((token) => line.includes(token));
}

/** Both ends (each one that is given) on the same route line. */
export function routesCoverTrip(routes: string[], from: string, to: string): boolean {
  const start = from.trim();
  const end = to.trim();
  if (!start && !end) return true;
  return routes.some((r) => (!start || routeCoversPlace(r, start)) && (!end || routeCoversPlace(r, end)));
}

// ---------------------------------------------------------------- serving a place

/**
 * Does this driver work at the place named? Yes when one of their areas or their base names it, a
 * route passes through it, or (when we know where the place is) their base or an area lies within
 * SERVE_KM of it.
 */
export function servesPlace(l: DriverRow, place: string): boolean {
  const name = place.trim();
  if (!name) return true;
  const known = placeNamed(name);
  const sameName = (text: string) => {
    if (hasWord(text, name) || placeAliases(name).slice(1).some((n) => hasWord(text, n))) return true;
    const other = placeNamed(text);
    return !!known && !!other && other.name === known.name;
  };
  if (l.location && sameName(l.location)) return true;
  if (driverAreas(l).some((a) => sameName(a.name))) return true;
  if (driverRoutes(l).some((r) => routeCoversPlace(r, name))) return true;
  const at = known ? { lat: known.lat, lng: known.lng } : null;
  if (!at) return false;
  const km = driverKm(l, at);
  return km !== null && km <= SERVE_KM;
}

// ---------------------------------------------------------------- the ride search

export type TripMatch = 'covers' | 'serves' | 'unlisted' | 'other';

/**
 * How a driver relates to a trip:
 *   covers    a route of theirs runs both ends;
 *   serves    they work at the pickup (or the one end given): base, area or route;
 *   unlisted  no routes or areas listed at all, so we cannot tell: ask them;
 *   other     what they list does not mention this trip.
 * Only `covers` drivers lead; the rest still show, under "may also do this trip".
 */
export function tripMatch(l: DriverRow, from: string, to: string): TripMatch {
  const routes = driverRoutes(l);
  if (routes.length && routesCoverTrip(routes, from, to)) return 'covers';
  const pickup = from.trim() || to.trim();
  if (pickup && servesPlace(l, pickup)) return 'serves';
  return routes.length || driverAreas(l).length ? 'other' : 'unlisted';
}

const MATCH_RANK: Record<TripMatch, number> = { covers: 0, serves: 1, unlisted: 2, other: 3 };

export type DriverQuery = {
  from: string;
  to: string;
  /** The place filter (a hub such as "Mirik"). */
  place: string;
  /** The traveller's position, for "near me". */
  near: LatLng | null;
  /** With `near`: only drivers within this many km. */
  within: number | null;
};

export type DriverHit<T> = { item: T; match: TripMatch | null; km: number | null; quality: number };

/** Distance bands: within one band, the better driver goes first. */
const BANDS = [10, 25, 60, 150];
const band = (km: number | null) => {
  if (km === null) return BANDS.length + 1;
  const i = BANDS.findIndex((b) => km <= b);
  return i === -1 ? BANDS.length : i;
};

/**
 * Filter and order drivers for a ride search.
 *
 * `rows` arrive in their base order (best text match first for a typed search, otherwise the
 * caller's own order) and `quality` adds rating and verification. The order:
 *   1. trip match (covers, serves, unlisted, other) when a trip is asked for;
 *   2. distance band from the reference point (the traveller, else the pickup, else the place);
 *   3. quality (rating, verified, routes or areas filled in), then the base order.
 */
export function rankDrivers<T extends DriverRow>(
  rows: T[],
  query: DriverQuery,
  quality: (item: T) => number,
  keepOrder = false,
): DriverHit<T>[] {
  const trip = !!(query.from.trim() || query.to.trim());
  const ref = query.near ?? placeFor(query.from) ?? placeFor(query.to) ?? placeFor(query.place);
  const hits = rows
    .filter((l) => !query.place.trim() || servesPlace(l, query.place))
    .map((item, i) => ({
      item,
      i,
      match: trip ? tripMatch(item, query.from, query.to) : null,
      km: ref ? driverKm(item, ref) : null,
      quality: quality(item),
    }))
    .filter((h) => !query.near || query.within === null || (h.km !== null && h.km <= query.within));
  hits.sort((a, b) => {
    if (trip) {
      const m = MATCH_RANK[a.match!] - MATCH_RANK[b.match!];
      if (m) return m;
    }
    if (keepOrder) return a.i - b.i;
    if (ref) {
      const d = band(a.km) - band(b.km);
      if (d) return d;
    }
    return b.quality - a.quality || a.i - b.i;
  });
  return hits.map(({ item, match, km, quality: q }) => ({ item, match, km: km === null ? null : Math.round(km * 10) / 10, quality: q }));
}

/**
 * A driver's standing, for the order within a distance band: rating (counted fully from five
 * reviews), verified and active, and routes or areas actually filled in.
 */
export function driverQuality(
  l: DriverRow,
  rating: { average: number; count: number } | undefined,
  verified: boolean,
): number {
  const stars = rating && rating.count > 0 ? (rating.average / 5) * Math.min(rating.count, 5) / 5 : 0;
  const listed = driverRoutes(l).length > 0 || driverAreas(l).length > 0 ? 0.3 : 0;
  return stars * 2 + (verified ? 1 : 0) + listed;
}

/** Read the ride-search query parameters (all optional). Errors name the bad parameter. */
export function readDriverQuery(q: Record<string, unknown>): DriverQuery | { error: string } {
  const text = (v: unknown) => (typeof v === 'string' ? v.trim().slice(0, 120) : '');
  const from = text(q.from);
  const to = text(q.to);
  const place = text(q.place);
  let near: LatLng | null = null;
  if (q.near_lat !== undefined || q.near_lng !== undefined) {
    near = latLng(q.near_lat, q.near_lng);
    if (!near) return { error: 'near_lat and near_lng must be a position' };
  }
  let within: number | null = null;
  if (q.within !== undefined && q.within !== '') {
    const n = Number(q.within);
    if (!Number.isFinite(n) || n <= 0 || n > 2000) return { error: 'within must be a number of km' };
    within = n;
  }
  return { from, to, place, near, within };
}

/** Whether the query asks for anything beyond the plain list. */
export const isDriverSearch = (q: DriverQuery) => !!(q.from || q.to || q.place || q.near);
