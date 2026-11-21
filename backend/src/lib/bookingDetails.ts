/**
 * The extra details a booking request can carry, checked against the stored listing:
 *
 * - a homestay request may name one of the host's rooms (prototype staybook.js). Its price a night
 *   (plus any extra mattress guests) decides the amount, and its `occ` plus its extra mattresses
 *   cap how many people the booking can be for;
 * - a driver request may say where to pick up and drop, at what time, and for how many days on a
 *   day-rate route (prototype drivebook.js). The fare is worked out here, never taken from the client;
 * - cancelling takes a reason from a fixed list per side, and an optional note (prototype cancel.js).
 */
import { addDays, daysBetween, type BookingRuleError } from './bookingRules';

type Extras = Record<string, any> | null | undefined;
type Fail = { ok: false } & BookingRuleError;
const fail = (code: string, detail: string): Fail => ({ ok: false, code, detail });
const given = (v: unknown) => v !== undefined && v !== null && v !== '';

// ---------------------------------------------------------------- homestay room

export type ChosenRoom = {
  name: string;
  /** The room's own price and unit as the host set them. */
  price: number;
  unit: string;
  occ: number | null;
  /** People on an extra mattress in this booking (beyond `occ`), 0 when none. */
  extraGuests: number;
  /**
   * What one night costs this booking: the room's price, plus the extra mattress charge for each
   * guest beyond what the room sleeps. Stored as `bookings.room_price`.
   */
  nightly: number;
};

/**
 * How many people a room sleeps and takes in all: `occ`, plus up to two on an extra mattress, and
 * what each extra person pays a night. `occ` null means the host never said (no cap).
 */
export function roomFit(r: any): { occ: number | null; extraBeds: number; extraBedPrice: number; max: number | null } {
  const occ = Number.isInteger(Number(r?.occ)) && Number(r?.occ) > 0 ? Number(r.occ) : null;
  const extraBeds = occ ? Math.min(2, Math.max(0, Math.floor(Number(r?.extra_beds)) || 0)) : 0;
  const extraBedPrice = extraBeds ? Math.max(0, Math.floor(Number(r?.extra_bed_price)) || 0) : 0;
  return { occ, extraBeds, extraBedPrice, max: occ ? occ + extraBeds : null };
}

/** The host's rooms: the listing's own copy of the profile, else the provider's profile. */
export function roomsOf(listingExtras: Extras, providerExtras?: Extras): any[] {
  const own = Array.isArray(listingExtras?.rooms) ? listingExtras!.rooms : [];
  if (own.length) return own;
  return Array.isArray(providerExtras?.rooms) ? providerExtras!.rooms : [];
}

const roomKey = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** A room the host switched off (let outside the app) is full: it takes no bookings. */
export const roomOpen = (r: any) => r?.available !== false;

/**
 * The room a homestay request names, judged against the host's rooms. No room asked for is fine
 * (the listing's own rate applies, as before rooms existed), unless every room is full. A room the
 * host marked full is refused. Returns the room, or a 400 problem.
 */
export function pickRoom(rooms: any[], input: unknown, guests: number):
  { ok: true; room: ChosenRoom | null } | Fail {
  if (!given(input)) {
    const named = rooms.filter((r) => r && typeof r === 'object' && roomKey(r.name));
    if (named.length && !named.some(roomOpen)) return fail('rooms_full', 'Every room at this homestay is full right now.');
    return { ok: true, room: null };
  }
  if (typeof input !== 'string' || input.trim().length > 120) return fail('bad_room', 'Pick one of the rooms this homestay lists.');
  const want = roomKey(input);
  const found = rooms.find((r) => r && typeof r === 'object' && roomKey(r.name) === want);
  if (!found) return fail('bad_room', 'This homestay has no room by that name. Pick one of its rooms.');
  if (!roomOpen(found)) return fail('room_full', `${String(found.name).trim()} is full right now. Pick another room.`);
  const price = Math.max(0, Math.floor(Number(found.price)) || 0);
  // A room is always one price a night for the whole room (user decision 2026-11-21); a room saved
  // per head before that is priced the same way now.
  const unit = 'night';
  const { occ, extraBeds, extraBedPrice, max } = roomFit(found);
  if (max && guests > max) {
    const name = String(found.name).trim();
    return fail('room_too_small', extraBeds
      ? `${name} sleeps ${occ}, and up to ${max} with an extra mattress. Pick a bigger room or fewer people.`
      : `${name} sleeps up to ${occ} ${occ === 1 ? 'person' : 'people'}. Pick a bigger room or fewer people.`);
  }
  const extraGuests = occ ? Math.max(0, guests - occ) : 0;
  const nightly = price + extraGuests * extraBedPrice;
  return { ok: true, room: { name: String(found.name).trim(), price, unit, occ, extraGuests, nightly } };
}

// ---------------------------------------------------------------- driver trip

export const MAX_TRIP_DAYS = 30;
const MAX_PLACE = 120;

export type DriverTrip = {
  pickupPlace: string | null;
  dropPlace: string | null;
  pickupTime: string | null;
  /** Days on a day-rate route (1..30); null on a per-trip route or with no route. */
  days: number | null;
  /** The fare the traveller was shown: route price per trip, or day rate x days; else the listing price. */
  quotedFare: number | null;
  /** The chosen route as the driver lists it, when the request named one of them. */
  route: { name: string; price: number; unit: 'trip' | 'day' } | null;
  /** The last day of the trip: a day-rate trip of n days ends n - 1 days after it starts. */
  checkOut: string | null;
};

const routeKey = (s: unknown) => String(s ?? '').trim().toLowerCase();

/** The driver's routes in one shape ({name, price, unit}); a bare string is a per-trip route. */
export function routesOf(extras: Extras): { name: string; price: number; unit: 'trip' | 'day' }[] {
  const raw = Array.isArray(extras?.routes) ? extras!.routes : [];
  return raw.map((r: any) => typeof r === 'string'
    ? { name: r.trim(), price: 0, unit: 'trip' as const }
    : { name: String(r?.route ?? r?.name ?? '').trim(), price: Math.max(0, Math.floor(Number(r?.price)) || 0), unit: r?.unit === 'day' ? 'day' as const : 'trip' as const })
    .filter((r: { name: string }) => r.name);
}

function place(v: unknown, label: string): string | null | Fail {
  if (!given(v)) return null;
  if (typeof v !== 'string') return fail('bad_place', `${label} must be text`);
  const s = v.trim().replace(/\s+/g, ' ');
  if (s.length > MAX_PLACE) return fail('bad_place', `${label} can be up to ${MAX_PLACE} characters`);
  return s || null;
}

/**
 * Where, when and for how long a driver booking is, and its fare. `routeName` is the route the
 * request names (free text, as before); the fare uses it only when it is one of the driver's routes.
 */
export function checkDriverTrip(
  listing: { price: number; extras?: Extras },
  routeName: string | null,
  body: { pickup_place?: unknown; drop_place?: unknown; pickup_time?: unknown; days?: unknown },
  dates: { checkIn: string | null; checkOut: string | null } = { checkIn: null, checkOut: null },
): { ok: true; value: DriverTrip } | Fail {
  const pickupPlace = place(body.pickup_place, 'Pickup place');
  if (pickupPlace && typeof pickupPlace === 'object') return pickupPlace;
  const dropPlace = place(body.drop_place, 'Drop place');
  if (dropPlace && typeof dropPlace === 'object') return dropPlace;

  let pickupTime: string | null = null;
  if (given(body.pickup_time)) {
    const m = typeof body.pickup_time === 'string' ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(body.pickup_time.trim()) : null;
    if (!m) return fail('bad_time', 'Pickup time must be a time like 09:30');
    pickupTime = `${m[1]}:${m[2]}`;
  }

  let days: number | null = null;
  if (given(body.days)) {
    const raw = body.days;
    const n = typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw.trim()) ? Number(raw) : NaN;
    if (!Number.isInteger(n) || n < 1 || n > MAX_TRIP_DAYS) return fail('bad_days', `A trip can be 1 to ${MAX_TRIP_DAYS} days.`);
    days = n;
  }

  const route = routeName ? routesOf(listing.extras).find((r) => routeKey(r.name) === routeKey(routeName)) ?? null : null;
  const listingPrice = Math.max(0, Math.floor(Number(listing.price)) || 0);
  let quotedFare: number | null;
  let checkOut = dates.checkOut;
  if (route && route.unit === 'day') {
    // A day-rate route is charged per day. Without a count, the dates say how many (one day when
    // there is no end date), and the end date always follows the count so the two never disagree.
    if (days === null) {
      days = dates.checkIn && dates.checkOut ? daysBetween(dates.checkIn, dates.checkOut) + 1 : 1;
      if (days < 1 || days > MAX_TRIP_DAYS) return fail('bad_days', `A trip can be 1 to ${MAX_TRIP_DAYS} days.`);
    }
    if (dates.checkIn) checkOut = days > 1 || dates.checkOut ? addDays(dates.checkIn, days - 1) : null;
    quotedFare = (route.price || listingPrice) * days;
  } else {
    // Days mean nothing on a one-way route or without a route.
    days = null;
    quotedFare = route?.price || listingPrice;
  }
  return { ok: true, value: { pickupPlace, dropPlace, pickupTime, days, quotedFare: quotedFare > 0 ? quotedFare : null, route, checkOut } };
}

// ---------------------------------------------------------------- cancelling

/** Why a traveller cancels (prototype cancel.js CXG). */
export const GUEST_CANCEL_REASONS = ['plans_changed', 'found_other', 'price_details', 'host_not_responding', 'weather_road', 'other'] as const;
/** Why a host cancels or declines (prototype cancel.js CXH). */
export const HOST_CANCEL_REASONS = ['fully_booked', 'not_available', 'family_health', 'weather_road', 'other'] as const;
export const MAX_CANCEL_NOTE = 200;

/** English words for each reason, for the feed and messages. */
export const CANCEL_REASON_TEXT: Record<string, string> = {
  plans_changed: 'My plans changed',
  found_other: 'Found another place or ride',
  price_details: 'Price or details not right',
  host_not_responding: 'Host is not responding',
  weather_road: 'Weather or road problem',
  other: 'Something else',
  fully_booked: 'Fully booked for these dates',
  not_available: 'Car or home not available',
  family_health: 'Family or health reason',
  // Set only by POST /bookings/{id}/no-show, never picked in the cancel sheet.
  no_show: 'The guest did not come',
  // Set only by POST /bookings/{id}/advance/unpaid (lib/advance.ts).
  advance_unpaid: 'The advance was not paid',
};

export type CancelSide = 'guest' | 'host' | 'admin';

/**
 * The reason and note sent with a cancel. `required` is false only on the plain cancel route,
 * which older apps call without a reason. An admin may use any reason.
 */
export function checkCancelReason(side: CancelSide, body: { reason?: unknown; note?: unknown }, required: boolean):
  { ok: true; reason: string | null; note: string | null } | Fail {
  const allowed: readonly string[] = side === 'guest' ? GUEST_CANCEL_REASONS
    : side === 'host' ? HOST_CANCEL_REASONS
    : [...new Set([...GUEST_CANCEL_REASONS, ...HOST_CANCEL_REASONS])];
  let reason: string | null = null;
  if (given(body.reason)) {
    if (typeof body.reason !== 'string' || !allowed.includes(body.reason)) {
      return fail('bad_reason', `Pick one of the reasons: ${allowed.join(', ')}`);
    }
    reason = body.reason;
  } else if (required) {
    return fail('reason_required', 'Please choose a reason.');
  }
  let note: string | null = null;
  if (given(body.note)) {
    if (typeof body.note !== 'string') return fail('bad_note', 'The note must be text');
    const s = body.note.trim();
    if (s.length > MAX_CANCEL_NOTE) return fail('bad_note', `The note can be up to ${MAX_CANCEL_NOTE} characters`);
    note = s || null;
  }
  return { ok: true, reason, note };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Whether cancelling at `at` is late: under 24 hours before the trip starts (prototype isLate).
 * The start is the check-in day in India time, at the pickup time when a driver booking has one,
 * else at midnight. A dateless booking is never late.
 */
export function isLateCancel(b: { checkIn: string | null; pickupTime?: string | null }, at: Date = new Date()): boolean {
  if (!b.checkIn) return false;
  const time = b.pickupTime && /^\d{2}:\d{2}$/.test(b.pickupTime) ? b.pickupTime : '00:00';
  const start = Date.parse(`${b.checkIn.slice(0, 10)}T${time}:00+05:30`);
  if (Number.isNaN(start)) return false;
  return start - at.getTime() < DAY_MS;
}
