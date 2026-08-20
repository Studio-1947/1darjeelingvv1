import { and, eq, gt, gte, lt, ne, or, sql } from 'drizzle-orm';
import { schema } from '../db';
import { BOOKING_HOLD_MINUTES } from '../config';

/**
 * Homestay availability — the single source of truth for "are these dates taken?".
 *
 * Two callers need the same answer and must not drift apart:
 *   - POST /bookings, deciding whether to let a checkout start at all;
 *   - the booking_commission settlement in payments.ts, deciding whether a paid booking may
 *     actually be confirmed.
 *
 * Only homestays are date-exclusive. A driver can be hired by two people on the same day, a
 * café does not run out of dates, and a spot is a public place — so every other listing type
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
 * The SQL predicate for "this row blocks the requested range on this listing".
 *
 * Half-open interval comparison (`existing.checkIn < requested.checkOut AND existing.checkOut >
 * requested.checkIn`) so a checkout on the same day as the next guest's check-in is NOT a clash —
 * that is a normal back-to-back turnover, and the pre-existing test for it stays green.
 *
 * `excludeBookingId` exists for the settlement path, where the booking being confirmed is itself
 * already a row in this table and must not be found as its own blocker.
 */
function blockingPredicate(
  listingId: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string
) {
  const clauses = [
    eq(schema.bookings.listingId, listingId),
    lt(schema.bookings.checkIn, checkOut),
    gt(schema.bookings.checkOut, checkIn),
    or(
      // Paid for and belonging to a guest — blocks unconditionally.
      eq(schema.bookings.status, 'confirmed'),
      // The host has agreed to take these nights. Blocks unconditionally too, and deliberately
      // NOT subject to the hold window: a host who accepts has promised the room, and a promise
      // that silently expires fifteen minutes later is worse than no acceptance at all. If the
      // guest never pays, the host cancels — which is a decision someone makes, not a timeout.
      eq(schema.bookings.status, 'accepted'),
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
  return and(...clauses);
}

type BookingRow = typeof schema.bookings.$inferSelect;

/** Anything with `.select()` — the live db, or a transaction handle from db.transaction(). */
type Queryable = {
  select: (typeof import('../db'))['db']['select'];
};

/**
 * Returns the booking that blocks this range, or null when the dates are free.
 *
 * Pass a transaction handle as `runner` to have the read participate in that transaction — which
 * is what makes the settlement check meaningful (see lockListingForBooking).
 */
export async function findBlockingBooking(
  runner: Queryable,
  listingId: string,
  checkIn: string,
  checkOut: string,
  excludeBookingId?: string
): Promise<BookingRow | null> {
  const rows = await runner
    .select()
    .from(schema.bookings)
    .where(blockingPredicate(listingId, checkIn, checkOut, excludeBookingId))
    .limit(1);
  return rows[0] ?? null;
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
 * The listing row is used purely as the mutex — nothing about it is modified.
 */
export async function lockListingForBooking(
  tx: { execute: (query: any) => Promise<unknown> },
  listingId: string
): Promise<void> {
  await tx.execute(sql`SELECT id FROM listings WHERE id = ${listingId} FOR UPDATE`);
}
