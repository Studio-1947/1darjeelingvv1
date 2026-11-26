/**
 * Per-route pricing for drivers.
 *
 * A driver charges differently per route - an airport transfer is a flat trip
 * fare, a sightseeing circuit is a day rate - so each route carries its own
 * price and unit rather than the listing having a single "starting rate".
 */

export type RouteUnit = 'trip' | 'day';

export type RouteFare = {
  route: string;
  price: number;
  unit: RouteUnit;
};

export const DEFAULT_ROUTE_UNIT: RouteUnit = 'trip';

/**
 * Routes were originally stored as bare strings in `extras.routes`, and the
 * static editorial map in listingContent.ts still uses that shape. Both must
 * keep rendering, so anything that isn't already a priced row is widened to
 * one with an unset (0) price - which callers treat as "not quoted" rather
 * than "free".
 */
export function normalizeRoutes(raw: unknown): RouteFare[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry): RouteFare[] => {
    if (typeof entry === 'string') {
      const route = entry.trim();
      return route ? [{ route, price: 0, unit: DEFAULT_ROUTE_UNIT }] : [];
    }
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      const route = typeof e.route === 'string' ? e.route.trim() : '';
      if (!route) return [];
      const price = Number(e.price);
      return [{
        route,
        price: Number.isFinite(price) && price > 0 ? price : 0,
        unit: e.unit === 'day' ? 'day' : DEFAULT_ROUTE_UNIT,
      }];
    }
    return [];
  });
}

/**
 * The listing's public "from" price: the cheapest quoted route. Routes left
 * unpriced are ignored so a half-filled form doesn't advertise ₹0, and 0 is
 * returned when nothing is priced yet (callers gate submission on that).
 */
export function startingPriceFrom(fares: RouteFare[]): number {
  const quoted = fares.map(f => f.price).filter(p => p > 0);
  return quoted.length ? Math.min(...quoted) : 0;
}

/** True once every route the driver listed carries a price. */
export function allRoutesPriced(fares: RouteFare[]): boolean {
  return fares.length > 0 && fares.every(f => f.price > 0);
}

/**
 * Words a typed place name and a driver's route line can disagree on without
 * meaning different places, so "NJP Station" still finds
 * "NJP Railway Station ↔ Darjeeling". One and two-letter fragments are dropped
 * as noise rather than listed.
 */
function placeTokens(place: string): string[] {
  return place.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2);
}

/**
 * Names people use for the same stop. Drivers type their routes freely ("New Jalpaiguri →
 * Darjeeling", "NJP Station - Darj", "IXB drop"), so a search for one name has to find the others.
 * NJP station is in Siliguri, so the two are one stop for a cab.
 */
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
/** Whole-word (or whole-phrase) match, so "dj" does not match inside another word. */
const hasWord = (line: string, word: string) => normalize(line).includes(normalize(word));

/** The names a typed place is also known by (itself first). */
export function placeAliases(place: string): string[] {
  const p = normalize(place);
  const group = PLACE_ALIASES.find((names) => names.some((n) => p.includes(normalize(n))));
  return group ? [place, ...group] : [place];
}

/** True when one route line runs through the given place, under any of its names. */
function routeCoversPlace(route: string, place: string): boolean {
  const line = route.toLowerCase();
  if (line.includes(place.trim().toLowerCase())) return true;
  if (placeAliases(place).slice(1).some((name) => hasWord(route, name))) return true;
  const tokens = placeTokens(place);
  return tokens.length > 0 && tokens.every((token) => line.includes(token));
}

/**
 * Does this driver run the trip being asked for?
 *
 * Both ends have to sit on the *same* route line: a driver who runs
 * Darjeeling ↔ Gangtok and Bagdogra ↔ Darjeeling does not thereby run
 * Gangtok ↔ Bagdogra. Direction is ignored - routes are written "A ↔ B" and
 * driven both ways - and one end on its own matches any route touching it, so
 * a half-filled search still narrows rather than emptying the page.
 */
export function routesCoverTrip(fares: RouteFare[], from: string, to: string): boolean {
  const start = from.trim();
  const end = to.trim();
  if (!start && !end) return true;
  return fares.some((f) =>
    (!start || routeCoversPlace(f.route, start)) && (!end || routeCoversPlace(f.route, end))
  );
}

/**
 * How a driver relates to a trip search: their routes cover it, they have listed no routes at
 * all, or their listed routes do not mention it.
 *
 * Only `covers` drivers lead the results. The others are still shown after them, under "may also
 * do this trip": routes are free text and rarely complete, and a search for the region's most
 * common trip (NJP → Darjeeling) used to end on an empty page while drivers were live
 * (persona test 2026-11-09). Same rule in the app (src/lib/routeFares.ts).
 */
/** The driver's route that covers this trip (both ends when both are given), priced ones first. */
export function routeForTrip(fares: RouteFare[], from: string, to: string): RouteFare | null {
  const start = from.trim();
  const end = to.trim();
  if (!start && !end) return null;
  const hits = fares.filter((f) => (!start || routeCoversPlace(f.route, start)) && (!end || routeCoversPlace(f.route, end)));
  return hits.find((f) => f.price > 0) || hits[0] || null;
}

export type TripMatch = 'covers' | 'unlisted' | 'no';
export function tripMatch(fares: RouteFare[], from: string, to: string): TripMatch {
  if (!from.trim() && !to.trim()) return 'covers';
  const real = fares.filter((f) => !isGenericRoute(f.route));
  if (real.length && routesCoverTrip(real, from, to)) return 'covers';
  return real.length === 0 ? 'unlisted' : 'no';
}

/**
 * The route the sign-up wizard writes for every new driver (ob.wz.day_route, "Full day hire", in
 * the language they signed up in). It names no place: a driver with only this route has listed no
 * routes, rather than routes that miss the trip. Same list on the server (lib/driverMatch.ts).
 */
const GENERIC_ROUTES = ['Full day hire', 'पूरे दिन की बुकिंग', 'সারাদিনের ভাড়া', 'पूरा दिनको भाडा'].map((r) => r.toLowerCase());
export const isGenericRoute = (route: string) => GENERIC_ROUTES.includes(route.trim().toLowerCase());

