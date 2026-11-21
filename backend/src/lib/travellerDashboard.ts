import { eq, inArray } from 'drizzle-orm';
import { db, schema } from '../db';
import { isSupportActive } from './support';
import { countReferrals } from './referrals';
import { missingProfileFields } from './travellerProfile';

/**
 * The traveller dashboard from the board: aangan pass, Aangan Points, Aangan Awards, total travel
 * (trips, homestays, cafes, shops), feedback and referrals. Everything is worked out from what
 * already happened (bookings, reviews, referrals, the profile), so there is no separate points
 * ledger to drift out of step. Points are for show for now; nothing spends them yet.
 */

/** How many points each thing is worth. */
export const POINTS = {
  completedTrip: 50,
  review: 20,
  referral: 100,
  profileComplete: 50,
  pass: 25,
} as const;

export type Award = { id: string; earned: boolean; progress: number; goal: number };

export type Dashboard = {
  pass: { active: boolean; expires_at: string | null };
  points: number;
  points_breakdown: { trips: number; reviews: number; referrals: number; profile: number; pass: number };
  points_rules: typeof POINTS;
  awards: Award[];
  totals: { trips: number; homestays: number; cafes: number; shops: number; rides: number; reviews: number };
  referrals: { joined: number };
  profile: { complete: boolean; missing: string[] };
};

/**
 * Today's date in Darjeeling as YYYY-MM-DD. Booking dates are calendar days there, so they are
 * compared as dates in India time, not as UTC instants (a trip "today" must be today at 1am IST too).
 */
export const todayInIndia = (now = new Date()) => now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const day = (v: string) => v.slice(0, 10);

/** A confirmed booking whose last day has gone by (or that never had a date, like a cafe visit). */
export function isCompleted(b: { status: string; checkIn: string | null; checkOut: string | null }, today = todayInIndia()): boolean {
  if (b.status !== 'confirmed') return false;
  const end = b.checkOut ?? b.checkIn;
  if (!end) return true;
  return day(end) < today;
}

/** How many days after a trip's last day the host can still say the guest never came. */
export const NO_SHOW_WINDOW_DAYS = 2;

const plusDays = (iso: string, n: number) => {
  const d = new Date(`${day(iso)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Can the host report "the guest did not come" on this booking today? Only a confirmed booking
 * with a date, from the day AFTER its first day (a guest may arrive late on the first evening,
 * and must keep the host's number while travelling) until NO_SHOW_WINDOW_DAYS after its last
 * day. Kept short so a host cannot use it to wipe a real stay (and the guest's review) later;
 * the route also refuses once the guest has reviewed.
 */
export function noShowOpen(b: { status: string; checkIn: string | null; checkOut: string | null }, today = todayInIndia()): boolean {
  if (b.status !== 'confirmed' || !b.checkIn) return false;
  if (today <= day(b.checkIn)) return false;
  return today <= plusDays(b.checkOut ?? b.checkIn, NO_SHOW_WINDOW_DAYS);
}

/** Why a no-show cannot be reported today (for the error code), when noShowOpen says no. */
export function noShowRefusal(b: { status: string; checkIn: string | null; checkOut: string | null }, today = todayInIndia()) {
  if (b.status !== 'confirmed') return 'not_confirmed' as const;
  if (!b.checkIn) return 'no_dates' as const;
  if (today <= day(b.checkIn)) return 'not_started' as const;
  return 'too_late' as const;
}

/**
 * A booking that is over and may no longer be cancelled by the guest or the host. A booking with
 * no date has no end to be over, so it can always still be cancelled (isCompleted treats it as
 * completed only for counting).
 */
export function isTripOver(b: { status: string; checkIn: string | null; checkOut: string | null }, today = todayInIndia()): boolean {
  return !!(b.checkOut ?? b.checkIn) && isCompleted(b, today);
}

const award = (id: string, progress: number, goal: number): Award => ({
  id,
  earned: progress >= goal,
  progress: Math.min(progress, goal),
  goal,
});

export async function travellerDashboard(user: typeof schema.users.$inferSelect): Promise<Dashboard> {
  const [bookings, reviews, joined] = await Promise.all([
    db.select({
      listingId: schema.bookings.listingId,
      listingType: schema.bookings.listingType,
      status: schema.bookings.status,
      checkIn: schema.bookings.checkIn,
      checkOut: schema.bookings.checkOut,
    }).from(schema.bookings).where(eq(schema.bookings.userId, user.id)),
    db.select({ listingId: schema.reviews.listingId }).from(schema.reviews).where(eq(schema.reviews.userId, user.id)),
    countReferrals(user.id),
  ]);

  const done = bookings.filter((b) => isCompleted(b));
  // A place counts once, whether it was booked, visited or reviewed.
  const reviewedTypes = reviews.length
    ? await db.select({ id: schema.listings.id, type: schema.listings.type }).from(schema.listings)
      .where(inArray(schema.listings.id, reviews.map((r) => r.listingId)))
    : [];
  const placesOf = (types: string[]) => new Set([
    ...done.filter((b) => types.includes(b.listingType)).map((b) => b.listingId),
    ...reviewedTypes.filter((l) => types.includes(l.type)).map((l) => l.id),
  ]).size;

  const totals = {
    trips: done.length,
    homestays: placesOf(['homestay']),
    cafes: placesOf(['cafe']),
    shops: placesOf(['shop']),
    rides: done.filter((b) => b.listingType === 'driver' || b.listingType === 'guide').length,
    reviews: reviews.length,
  };

  const missing = missingProfileFields(user);
  const passActive = isSupportActive(user);
  const everHadPass = !!user.supportExpiresAt;

  const breakdown = {
    trips: totals.trips * POINTS.completedTrip,
    reviews: totals.reviews * POINTS.review,
    referrals: joined * POINTS.referral,
    profile: missing.length === 0 ? POINTS.profileComplete : 0,
    pass: everHadPass ? POINTS.pass : 0,
  };

  return {
    pass: { active: passActive, expires_at: user.supportExpiresAt ?? null },
    points: Object.values(breakdown).reduce((a, b) => a + b, 0),
    points_breakdown: breakdown,
    // What each thing is worth, so the dashboards explain points without copying the numbers.
    points_rules: POINTS,
    awards: [
      award('first_trip', totals.trips, 1),
      award('homestay_explorer', totals.homestays, 3),
      award('cafe_hopper', totals.cafes, 3),
      award('local_supporter', totals.shops, 3),
      award('road_tripper', totals.rides, 3),
      award('storyteller', totals.reviews, 3),
      award('connector', joined, 1),
      award('pass_holder', everHadPass ? 1 : 0, 1),
      award('profile_complete', missing.length === 0 ? 1 : 0, 1),
    ],
    totals,
    referrals: { joined },
    profile: { complete: missing.length === 0, missing },
  };
}

