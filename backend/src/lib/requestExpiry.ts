import { and, eq, inArray, lt } from 'drizzle-orm';
import { db, schema } from '../db';
import { REQUEST_EXPIRY_HOURS, log } from '../config';
import { HOST_APPROVAL_TYPES, realHostIds } from './bookingApproval';
import { addHostNotification, addInAppNotification } from './inApp';
import { releaseVoucherForBooking } from './vouchers';

/**
 * Closes booking requests the host never answered.
 *
 * With host approval a request stays `pending_payment` until the host presses Accept. A host who
 * never opens the dashboard would leave the guest waiting forever, unable to plan. After
 * REQUEST_EXPIRY_HOURS the request is cancelled, any voucher goes back, and both sides are told.
 * Abandoned checkouts on instant-confirm listings are not touched: they never waited on anyone,
 * and their date hold already lapses on its own (lib/bookingAvailability.ts).
 */
export async function expireStaleRequests(now: Date = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - REQUEST_EXPIRY_HOURS * 3600_000).toISOString();
  const stale = await db.select({
    id: schema.bookings.id,
    userId: schema.bookings.userId,
    listingTitle: schema.bookings.listingTitle,
    listingType: schema.bookings.listingType,
    providerId: schema.listings.providerId,
  })
    .from(schema.bookings)
    .innerJoin(schema.listings, eq(schema.listings.id, schema.bookings.listingId))
    .where(and(
      eq(schema.bookings.status, 'pending_payment'),
      lt(schema.bookings.createdAt, cutoff),
      inArray(schema.bookings.listingType, [...HOST_APPROVAL_TYPES]),
    ));
  if (!stale.length) return 0;

  const hosts = await realHostIds(stale.map((b) => b.providerId));
  let closed = 0;
  for (const b of stale) {
    if (!hosts.has(b.providerId)) continue;
    // Guarded on the status, so a host who accepts at this very moment wins and nothing is undone.
    const [row] = await db.update(schema.bookings)
      .set({ status: 'cancelled' })
      .where(and(eq(schema.bookings.id, b.id), eq(schema.bookings.status, 'pending_payment')))
      .returning({ id: schema.bookings.id });
    if (!row) continue;
    closed++;
    await releaseVoucherForBooking(db, b.id);
    await addInAppNotification(b.userId, {
      kind: 'booking_expired',
      title: 'Your request was not answered',
      body: `The host of ${b.listingTitle} did not answer within ${REQUEST_EXPIRY_HOURS} hours, so your request was closed. Nothing was charged. You can ask another host.`,
      refId: b.id,
    });
    await addHostNotification(b.providerId, {
      kind: 'booking_expired',
      title: 'A booking request lapsed',
      body: `A request for ${b.listingTitle} closed because it was not answered within ${REQUEST_EXPIRY_HOURS} hours. Accept requests soon so guests can book you.`,
      refId: b.id,
    });
  }
  if (closed) log.info(`[requests] closed ${closed} request(s) not answered within ${REQUEST_EXPIRY_HOURS}h`);
  return closed;
}

/** Runs the sweep now and every 30 minutes. Never throws: a failed sweep waits for the next one. */
export function startRequestExpiry(): NodeJS.Timeout {
  const run = () => expireStaleRequests().catch((err) => log.warn(`[requests] expiry sweep failed: ${(err as Error).message}`));
  void run();
  const timer = setInterval(run, 30 * 60 * 1000);
  timer.unref();
  return timer;
}
