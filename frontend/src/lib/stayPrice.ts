/**
 * The price a homestay leads with on cards and at the top of its page.
 *
 * A homestay has two rates that mean different things: the listing's own rate is per person per
 * night (used when no room is picked: rate x guests x nights), while each room is one price per
 * night for the whole room (backend lib/bookingAmount.ts). Showing "₹1,000 / person / night" on
 * the card and "₹1,000 per night, sleeps 2" on the room read as a contradiction, so a homestay
 * with priced rooms leads with its cheapest room, per room per night, and the per-person rate is
 * only shown for a homestay without rooms.
 */
export interface StayPrice {
  price: number;
  /** true: the price is one room for one night. false: one person for one night. */
  perRoom: boolean;
  /** More than one room price: say "From". */
  from: boolean;
}

export function stayPrice(item: any): StayPrice | null {
  const rooms: any[] = Array.isArray(item?.extras?.rooms) ? item.extras.rooms : [];
  const prices = rooms
    .filter((r) => r && String(r.name || '').trim() && r.available !== false)
    .map((r) => Number(r.price))
    .filter((p) => Number.isFinite(p) && p > 0);
  if (prices.length) {
    const lowest = Math.min(...prices);
    return { price: lowest, perRoom: true, from: new Set(prices).size > 1 };
  }
  const rate = Number(item?.price);
  return Number.isFinite(rate) && rate > 0 ? { price: rate, perRoom: false, from: false } : null;
}
