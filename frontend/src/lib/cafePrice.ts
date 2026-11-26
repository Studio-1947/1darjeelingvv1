/**
 * "₹400 for two": what a meal for two costs at a cafe, worked out from its menu.
 *
 * The listing's own price is its cheapest dish (it sorts and filters by that), which reads as if
 * the whole place costs that much. Travellers compare eating places by a meal for two (as the
 * food apps show it), so a cafe's cards and page say that: two dishes at the menu's average
 * price, rounded to the nearest ₹10. A cafe with no priced dishes yet has none.
 */
export function costForTwo(menu: unknown): number {
  const rows: any[] = Array.isArray(menu) ? menu : [];
  const prices = rows
    .filter((m) => m && typeof m === 'object' && m.available !== false)
    .map((m) => Number(m.price))
    .filter((p) => Number.isFinite(p) && p > 0);
  if (!prices.length) return 0;
  const avg = prices.reduce((a, p) => a + p, 0) / prices.length;
  return Math.max(10, Math.round((avg * 2) / 10) * 10);
}

/** A cafe listing's meal-for-two price, from `extras.menu` (0 when it is not a cafe or has none). */
export function cafeForTwo(item: any): number {
  return item?.type === 'cafe' ? costForTwo(item?.extras?.menu) : 0;
}
