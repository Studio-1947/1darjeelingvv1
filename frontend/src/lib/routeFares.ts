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
