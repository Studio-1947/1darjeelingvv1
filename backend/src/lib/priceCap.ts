/**
 * The most a host or the team can set as one price, in whole rupees (user decision 2026-11-21).
 * Covers every price people type in: listing price, starting price, rooms, food, routes, services,
 * menu, goods, spot and suggested-place entry. Payments (donations, plans) have their own limits.
 * The website checks the same number (frontend/src/lib/hostFormChecks.ts, MAX_PRICE).
 */
export const MAX_PRICE = 50_000;
