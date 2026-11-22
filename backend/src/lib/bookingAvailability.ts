import { and, eq, gt, gte, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { schema } from '../db';
import { ACCEPTED_HOLD_HOURS, BOOKING_HOLD_MINUTES } from '../config';

/**
 * Homestay availability  the single source of truth for "are these dates taken?".
 *
 * Two callers need the same answer and must not drift apart:
 *   - POST /bookings, deciding whether to let a checkout start at all;
 *   - the booking_commission settlement in payments.ts, deciding whether a paid booking may
 *     actually be confirmed.
 *
 * Only homestays are date-exclusive. A driver can be hired by two people on the same day, a
 * café does not run out of dates, and a spot is a public place  so every other listing type
 * is always available and this module is not consulted for them.
 */

/** Only this type reserves a date range exclusively. */
export function isDateExclusive(listingType: string): boolean {
  return listingType === 'homestay';
}

/**
 * The instant before which a `pending_payment` booking stops holding its dates.
 *
 * Without a hold, two guests could both open checkout for the same nights, both pay, and both
 * arrive. With a permanent hold, one abandoned checkout would freeze a room forever. The window
 * is therefore short: long enough to complete a Razorpay checkout, short enough that a guest who
 * closes the tab releases the dates on their own.
 */
export function holdCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - BOOKING_HOLD_MINUTES * 60 * 1000).toISOString();
}

/**
 * The instant before which an `accepted` booking the guest never confirmed stops holding its dates
 * (QA report BUG-02).
 *
 * Accepting used to block the nights forever: a guest who never pressed Confirm froze the room
 * until the stay date passed, and one person could do that to many homestays at once. The host's
 * promise still holds for a fair while (ACCEPTED_HOLD_HOURS, 48 by default), long enough for any
 * guest who means it to confirm, and then the dates go back on the market. lib/requestExpiry.ts
 * closes the lapsed booking and tells both sides; this cutoff makes the dates free even before
 * that sweep runs.
 */
export function acceptedCutoff(now: Date = new Date()): string {
  return new Date(now.getTime() - ACCEPTED_HOLD_HOURS * 3600 * 1000).toISOString();
}

/**
 * Rooms (QA report BUG-04). A homestay with several rooms can host one guest per room on the
 * same night, so a booking that names a room clashes only with bookings for that same room, or
 * with bookings that named no room (taken to mean the whole house). A request naming no room is
 * the whole house, so every overlapping booking blocks it. Listings without rooms store no room
 * name, and behave exactly as before.
 */
function roomClause(roomName?: string | null) {
  if (!roomName) return undefined;
  return or(isNull(schema.bookings.roomName), eq(schema.bookings.roomName, roomName));
}

/**
 * The SQL predicate for "this row blocks the requested range on this listing".
 *
 * Half-open interval comparison (`existing.checkIn < requested.checkOut AND existing.checkOut >
 * requested.checkIn`) so a checkout on the same day as the next guest's check-in is NOT a clash 
 * that is a normal back-to-back turnover, and the pre-existing test for it stays green.
 *
 * `excludeBookingId` exists for the settlement path, where the booking being confirmed is itself
 * already a row in this table and must not be found as its own blocker.
 */
function blockingPredicate(
  listingId: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string,
  roomName?: string | null
) {
  const clauses = [
    eq(schema.bookings.listingId, listingId),
    lt(schema.bookings.checkIn, checkOut),
    gt(schema.bookings.checkOut, checkIn),
    or(
      // Paid for and belonging to a guest  blocks unconditionally.
      eq(schema.bookings.status, 'confirmed'),
      // The host has agreed to take these nights. Not subject to the short checkout hold (a
      // promise that lapses in fifteen minutes is worse than none), but not forever either: a
      // guest who has not confirmed within ACCEPTED_HOLD_HOURS lets the dates go (BUG-02). Rows
      // from before accepted_at existed fall back to when the request was made.
      and(
        eq(schema.bookings.status, 'accepted'),
        gte(sql`coalesce(${schema.bookings.acceptedAt}, ${schema.bookings.createdAt})`, acceptedCutoff())
      ),
      // A checkout still in flight. `createdAt` is an ISO-8601 UTC string for every row this app
      // writes, so lexicographic ordering is chronological ordering and a text comparison is a
      // correct time comparison.
      and(
        eq(schema.bookings.status, 'pending_payment'),
        gte(schema.bookings.createdAt, holdCutoff())
      )
    ),
  ];
  if (excludeBookingId) {
    clauses.push(ne(schema.bookings.id, excludeBookingId));
  }
  const room = roomClause(roomName);
  if (room) clauses.push(room);
  return and(...clauses);
}

type BookingRow = typeof schema.bookings.$inferSelect;

/** Anything with `.select()`  the live db, or a transaction handle from db.transaction(). */
type Queryable = {
  select: (typeof import('../db'))['db']['select'];
};

/**
 * Returns the booking that blocks this range, or null when the dates are free.
 *
 * Pass a transaction handle as `runner` to have the read participate in that transaction  which
 * is what makes the settlement check meaningful (see lockListingForBooking).
 */
export async function findBlockingBooking(
  runner: Queryable,
  listingId: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string,
  /** The room asked for, when the homestay has rooms; null or absent means the whole house. */
  roomName?: string | null
): Promise<BookingRow | null> {
  const rows = await runner
    .select()
    .from(schema.bookings)
    .where(blockingPredicate(listingId, checkIn, checkOut, excludeBookingId, roomName))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * The date ranges on a listing that are not free, for a calendar to draw.
 *
 * Uses the same blocking rule as `findBlockingBooking` (confirmed, accepted, and checkouts still
 * inside their hold window) so a calendar can never show a night as free that a booking would
 * then refuse. Returns dates and a coarse state only: no guest, no booking id.
 */
export async function blockedRanges(
  runner: Queryable,
  listingId: string,
  from: string,
  to: string,
  /** The signed-in viewer, if any: their own bookings come back marked `mine`, nobody else's do. */
  viewerId?: string | null,
  /** Only what blocks this room (plus whole-house bookings). Absent: every blocking booking. */
  roomName?: string | null
): Promise<{ check_in: string; check_out: string; state: 'booked' | 'hold'; room_name: string | null; mine?: true }[]> {
  const rows = await runner
    .select({
      checkIn: schema.bookings.checkIn,
      checkOut: schema.bookings.checkOut,
      status: schema.bookings.status,
      userId: schema.bookings.userId,
      roomName: schema.bookings.roomName,
    })
    .from(schema.bookings)
    .where(blockingPredicate(listingId, from, to, undefined, roomName))
    .orderBy(schema.bookings.checkIn);
  return rows
    .filter((r) => r.checkIn && r.checkOut)
    .map((r) => ({
      check_in: r.checkIn as string,
      check_out: r.checkOut as string,
      state: r.status === 'pending_payment' ? ('hold' as const) : ('booked' as const),
      // Which room is taken; null when the whole house is. Lets a calendar show other rooms free.
      room_name: r.roomName ?? null,
      // So a traveller who already asked for these nights is told that, not "someone else booked".
      ...(viewerId && r.userId === viewerId ? { mine: true as const } : {}),
    }));
}

/**
 * Serialises every concurrent confirmation for one listing.
 *
 * The overlap check alone cannot prevent a double booking: two transactions confirming DIFFERENT
 * bookings for overlapping dates each read a snapshot in which the other has not committed yet,
 * so both see "no clash" and both confirm. Taking a row lock on the shared listing first forces
 * them into a queue, so the second one reads the first one's committed result and correctly finds
 * the clash.
 *
 * The listing row is used purely as the mutex  nothing about it is modified.
 */
export async function lockListingForBooking(
  tx: { execute: (query: any) => Promise<unknown> },
  listingId: string
): Promise<void> {
  await tx.execute(sql`SELECT id FROM listings WHERE id = ${listingId} FOR UPDATE`);
}

/**
 * Locks a booking for a status change and returns it as it is now, or null if it does not exist.
 *
 * Every change of a booking's status (host accept, guest confirm, cancel) goes through this, so
 * two of them on the same booking run one after the other and the second decides on what the
 * first left behind. Without it, a guest could cancel while the host accepted (or while their own
 * confirm went through) and the slower write silently undid the cancel.
 *
 * The listing is locked before the booking, in every caller, so two changes can never wait on
 * each other in opposite orders.
 */
export async function lockBookingForChange(tx: any, bookingId: string): Promise<BookingRow | null> {
  const [peek] = await tx.select({ listingId: schema.bookings.listingId })
    .from(schema.bookings).where(eq(schema.bookings.id, bookingId)).limit(1);
  if (!peek) return null;
  await lockListingForBooking(tx, peek.listingId);
  const [row] = await tx.select().from(schema.bookings)
    .where(eq(schema.bookings.id, bookingId)).limit(1).for('update');
  return row ?? null;
}
