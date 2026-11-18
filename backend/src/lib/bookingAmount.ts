const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What a booking is worth to the host, by the same rule both apps show the guest.
 *
 * A homestay is priced per person per night, so the total is the rate x guests x nights (the
 * website's ReserveSection and the app's homestayTotal). When the guest picked one of the host's
 * rooms, the room's nightly price for the booking (`roomPrice`, stored on the booking) replaces
 * rate x guests: the total is roomPrice x nights.
 *
 * A driver booking that carries a quoted fare (the chosen route's price, or day rate x days, worked
 * out by the server when the request was made) is worth that fare. A driver without one, or
 * anything else with a single price, is the flat rate. Nights come from the stored dates and are
 * never less than one; a missing or reversed range counts as one, and guests are never less than one.
 *
 * This is the host's gross figure. It does not subtract a referral voucher: the discount is settled
 * between guest and host directly and who funds it is not decided, so the dashboard shows the
 * undiscounted amount.
 */
export function bookingGrossAmount(input: {
  listingType: string;
  price: number;
  guests?: number | null;
  checkIn?: string | null;
  checkOut?: string | null;
  /** Homestay: the chosen room's price for one night of this booking. */
  roomPrice?: number | null;
  /** Driver: the fare quoted when the request was made. */
  quotedFare?: number | null;
}): number {
  if (input.listingType === 'driver') {
    const fare = Number(input.quotedFare);
    if (Number.isFinite(fare) && fare > 0) return fare;
  }
  const room = Number(input.roomPrice);
  const hasRoom = input.listingType === 'homestay' && input.roomPrice != null && Number.isFinite(room) && room > 0;
  const price = Number(input.price);
  if (!hasRoom && (!Number.isFinite(price) || price <= 0)) return 0;
  if (input.listingType !== 'homestay') return price;

  const guests = Math.max(1, Math.floor(Number(input.guests)) || 1);
  const start = input.checkIn ? Date.parse(input.checkIn) : NaN;
  const end = input.checkOut ? Date.parse(input.checkOut) : NaN;
  const nights =
    Number.isNaN(start) || Number.isNaN(end) ? 1 : Math.max(1, Math.round((end - start) / DAY_MS));
  return hasRoom ? room * nights : price * guests * nights;
}

/** The amount of a stored booking row, given its listing's price. */
export function amountOfBooking(
  b: { listingType: string; guests: number; checkIn: string | null; checkOut: string | null; roomPrice?: number | null; quotedFare?: number | null },
  listingPrice: number,
): number {
  return bookingGrossAmount({
    listingType: b.listingType, price: listingPrice, guests: b.guests, checkIn: b.checkIn, checkOut: b.checkOut,
    roomPrice: b.roomPrice, quotedFare: b.quotedFare,
  });
}
