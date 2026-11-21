/**
 * How many people a homestay room sleeps and takes, the same rule as the server
 * (backend/src/lib/bookingDetails.ts roomFit). A room has one price a night for the whole room
 * (user decision 2026-11-21: never per person). It sleeps `occ` people; only when the host allows
 * an extra mattress (`extra_beds`, +1 or +2) can more stay, each extra person adding
 * `extra_bed_price` to the night (0 = free). A room that never said what it sleeps has no cap (`max` null).
 */
export type RoomFit = { occ: number | null; extraBeds: number; extraBedPrice: number; max: number | null };

export function roomFit(r: any): RoomFit {
  const occ = Number.isInteger(Number(r?.occ)) && Number(r?.occ) > 0 ? Number(r.occ) : null;
  const extraBeds = occ ? Math.min(2, Math.max(0, Math.floor(Number(r?.extra_beds)) || 0)) : 0;
  const extraBedPrice = extraBeds ? Math.max(0, Math.floor(Number(r?.extra_bed_price)) || 0) : 0;
  return { occ, extraBeds, extraBedPrice, max: occ ? occ + extraBeds : null };
}

/**
 * The home's guest occupancy worked out from its rooms: every named room's people plus its extra
 * mattresses, at most 100 (the profile's limit). 0 unless every named room says what it sleeps:
 * a room that never said cannot be counted, so the host's own number stands then.
 */
export function roomsCapacity(rooms: any[] | undefined): number {
  const named = (Array.isArray(rooms) ? rooms : []).filter((r) => r && String(r.name || '').trim());
  if (!named.length || named.some((r) => !roomFit(r).max)) return 0;
  return Math.min(100, named.reduce((n, r) => n + (roomFit(r).max || 0), 0));
}

/** What one night of this room costs a party of `guests`: the room's price, plus each extra guest's mattress. */
export function roomNightly(r: any, guests: number): number {
  const price = Math.max(0, Math.floor(Number(r?.price)) || 0);
  const { occ, extraBedPrice } = roomFit(r);
  return price + (occ ? Math.max(0, guests - occ) : 0) * extraBedPrice;
}
