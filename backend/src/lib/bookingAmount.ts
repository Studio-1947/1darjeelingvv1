const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * What a booking is worth to the host, by the same rule both apps show the guest.
 *
 * A homestay is priced per person per night, so the total is the rate x guests x nights (the
 * website's ReserveSection and the app's homestayTotal). A driver, or anything else with a single
 * price, is the flat rate. Nights come from the stored dates and are never less than one; a
 * missing or reversed range counts as one, and guests are never less than one.
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
}): number {
  const price = Number(input.price);
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (input.listingType !== 'homestay') return price;

  const guests = Math.max(1, Math.floor(Number(input.guests)) || 1);
  const start = input.checkIn ? Date.parse(input.checkIn) : NaN;
  const end = input.checkOut ? Date.parse(input.checkOut) : NaN;
  const nights =
    Number.isNaN(start) || Number.isNaN(end) ? 1 : Math.max(1, Math.round((end - start) / DAY_MS));
  return price * guests * nights;
}
