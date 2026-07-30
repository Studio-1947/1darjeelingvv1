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

/** True when one route line runs through the given place. */
function routeCoversPlace(route: string, place: string): boolean {
  const line = route.toLowerCase();
  if (line.includes(place.trim().toLowerCase())) return true;
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

