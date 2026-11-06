/**
 * The rules every booking request must pass, in one place, judged on the listing as stored.
 *
 * The listing's own type decides which rules apply. A type sent by the client is never trusted:
 * before this, a homestay booked as "driver" skipped the date checks and the clash check, so one
 * person could ask for nights a host had already promised to someone else.
 *
 * Dates are calendar days (YYYY-MM-DD) in India time, where every listing is.
 */
import { isDateExclusive } from './bookingAvailability';
import { todayInIndia } from './travellerDashboard';

/** Longest homestay stay one request can cover. */
export const MAX_NIGHTS = 30;
/** How far ahead a trip can be asked for. */
export const MAX_DAYS_AHEAD = 365;
/** Guest limit when a host has not set one: a driver's car, anything else. */
export const DEFAULT_SEATS = 6;
export const DEFAULT_CAPACITY = 10;
export const MAX_NOTES = 1000;
/** Requests one traveller can have waiting on hosts at once (accepted ones do not count). */
export const MAX_OPEN_REQUESTS = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

export { todayInIndia };

/** A real calendar date written as YYYY-MM-DD (so "2026-02-30" and "abc" are not). */
export function isIsoDate(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

export const PAST_DATE_DETAIL = 'The date on this booking has already passed. Ask again for new dates.';

/** True once a booking's start date is before today in India (a dateless booking never is). */
export function hasStartDatePassed(checkIn: string | null | undefined, now: Date = new Date()): boolean {
  return !!checkIn && checkIn < todayInIndia(now);
}

export function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

function positiveInt(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** How many people one booking of this listing can be for. Both apps clamp their pickers to it. */
export function maxGuestsFor(listing: { type: string; extras?: Record<string, any> | null }): number {
  const extras = listing.extras || {};
  if (listing.type === 'driver') return positiveInt(extras.seats) ?? DEFAULT_SEATS;
  return positiveInt(extras.capacity) ?? DEFAULT_CAPACITY;
}

export type BookingRequestValues = {
  checkIn: string | null;
  checkOut: string | null;
  guests: number;
  notes: string;
};

export type BookingRuleError = { detail: string; code: string };

const NOUN: Record<string, string> = { homestay: 'homestay', driver: 'car', guide: 'guide' };

/** Missing or blank counts as not given. */
const given = (v: unknown) => v !== undefined && v !== null && v !== '';

/**
 * Checks the guest-supplied part of a booking against the stored listing. Returns the cleaned
 * values to save, or the first problem as a 400 detail with a stable code.
 */
export function checkBookingRequest(
  listing: { type: string; extras?: Record<string, any> | null },
  body: { check_in?: unknown; check_out?: unknown; guests?: unknown; notes?: unknown },
  now: Date = new Date(),
): { ok: true; value: BookingRequestValues } | ({ ok: false } & BookingRuleError) {
  const fail = (code: string, detail: string) => ({ ok: false as const, code, detail });
  const today = todayInIndia(now);
  const lastDay = addDays(today, MAX_DAYS_AHEAD);
  const exclusive = isDateExclusive(listing.type);

  // Dates.
  const hasIn = given(body.check_in);
  const hasOut = given(body.check_out);
  if (exclusive && (!hasIn || !hasOut)) {
    return fail('dates_required', 'Check-in and check-out dates are required for homestays');
  }
  if (hasIn && !isIsoDate(body.check_in)) return fail('bad_date', 'Check-in must be a date like 2026-12-31');
  if (hasOut && !isIsoDate(body.check_out)) return fail('bad_date', 'Check-out must be a date like 2026-12-31');
  const checkIn = hasIn ? (body.check_in as string) : null;
  const checkOut = hasOut ? (body.check_out as string) : null;
  if (checkOut && !checkIn) return fail('dates_required', 'A check-out date needs a check-in date');
  if (checkIn) {
    if (checkIn < today) return fail('date_in_past', 'That date has already passed. Pick today or a later date.');
    if (checkIn > lastDay) return fail('too_far_ahead', `Bookings open up to ${MAX_DAYS_AHEAD} days ahead. Pick an earlier date.`);
  }
  if (checkIn && checkOut) {
    const nights = daysBetween(checkIn, checkOut);
    // A homestay needs at least one night; a day trip may start and end on the same day.
    if (exclusive ? nights < 1 : nights < 0) return fail('dates_order', 'Check-out date must be after check-in date');
    if (nights > MAX_NIGHTS) return fail('stay_too_long', `One booking can cover up to ${MAX_NIGHTS} nights. Split a longer stay into two.`);
  }

  // Guests.
  const max = maxGuestsFor(listing);
  let guests = 1;
  if (given(body.guests)) {
    const raw = body.guests;
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > max) {
      return fail('bad_guests', `This ${NOUN[listing.type] || 'booking'} takes 1 to ${max} ${max === 1 ? 'guest' : 'guests'}.`);
    }
    guests = n;
  }

  // Notes.
  let notes = '';
  if (given(body.notes)) {
    if (typeof body.notes !== 'string') return fail('bad_notes', 'Notes must be text');
    notes = body.notes.trim();
    if (notes.length > MAX_NOTES) return fail('bad_notes', `Notes can be up to ${MAX_NOTES} characters`);
  }

  return { ok: true, value: { checkIn, checkOut, guests, notes } };
}
