/**
 * The dates and party size a visitor typed into the hero search.
 *
 * These used to stop at the search bar. The widget collected check-in, check-out
 * and a guest count, summarised them back ("Tiger Hill · 20 - 22 Aug · 2 Guests")
 * and then submitted a URL carrying only `type` and `q` - so the traveller had to
 * type all of it again on the listing page, and a shared search link lost the
 * half of the query that mattered most (QA 2.2).
 *
 * Carrying them in the URL rather than in React state is deliberate: the search
 * results and the listing page are separate routes, the login wall replaces the
 * whole location, and a pasted link should reproduce what the sender saw.
 *
 * Names match the booking API's fields (`check_in`, `check_out`, `guests`) so the
 * hop from URL to form to POST /bookings needs no translation layer.
 */

export interface Trip {
  checkIn: string;   // YYYY-MM-DD, or '' when unset
  checkOut: string;  // YYYY-MM-DD, or '' when unset
  guests: number;    // always >= 1
}

export const EMPTY_TRIP: Trip = { checkIn: '', checkOut: '', guests: 1 };

// Two digits, matching the widget's own ceiling - see MAX_GUESTS in BookingWidget.
const MAX_GUESTS = 99;

// A URL is user-editable, so anything read out of one is treated as untrusted.
// A malformed date is dropped rather than passed through to a <input type="date">,
// which would silently render blank and lose the rest of the query with it.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function cleanDate(raw: string | null): string {
  if (!raw || !ISO_DATE.test(raw)) return '';
  return Number.isNaN(Date.parse(raw)) ? '' : raw;
}

export function readTrip(sp: URLSearchParams): Trip {
  const checkIn = cleanDate(sp.get('check_in'));
  let checkOut = cleanDate(sp.get('check_out'));
  // A check-out on or before check-in is not a stay. Keeping the arrival and
  // dropping the impossible half leaves the visitor one field to fix instead of
  // silently searching dates they didn't ask for.
  if (checkIn && checkOut && checkOut <= checkIn) checkOut = '';

  const guests = Math.min(MAX_GUESTS, Math.max(1, parseInt(sp.get('guests') || '', 10) || 1));
  return { checkIn, checkOut, guests };
}

/** Adds whatever is actually set to `params`; a guest count of 1 is the default and stays implicit. */
export function writeTrip(params: URLSearchParams, trip: Partial<Trip>): URLSearchParams {
  if (trip.checkIn) params.set('check_in', trip.checkIn);
  if (trip.checkOut) params.set('check_out', trip.checkOut);
  if (trip.guests && trip.guests > 1) params.set('guests', String(trip.guests));
  return params;
}

export function hasTrip(trip: Trip): boolean {
  return !!(trip.checkIn || trip.checkOut || trip.guests > 1);
}

/** `?check_in=…&guests=2`, or '' when there is nothing to carry - safe to append to any path. */
export function tripSuffix(trip: Trip): string {
  const params = writeTrip(new URLSearchParams(), trip);
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/** Nights between check-in and check-out; 0 when the range is incomplete. */
export function nightsIn(trip: Trip): number {
  if (!trip.checkIn || !trip.checkOut) return 0;
  const ms = Date.parse(trip.checkOut) - Date.parse(trip.checkIn);
  return ms > 0 ? Math.round(ms / 86_400_000) : 0;
}
