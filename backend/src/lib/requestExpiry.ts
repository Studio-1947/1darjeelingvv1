import { and, eq, gte, inArray, lt } from 'drizzle-orm';
import { db, schema } from '../db';
import { REQUEST_EXPIRY_HOURS, log } from '../config';
import { HOST_APPROVAL_TYPES, realHostIds } from './bookingApproval';
import { addHostNotification, addInAppNotification } from './inApp';
import { releaseVoucherForBooking } from './vouchers';
import { refundPaymentsFor } from './refunds';
import { AWAITING_FEE } from './bookingSend';

/**
 * Closes booking requests the host never answered (and, below, reminds hosts halfway through).
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
  if (!stale.length) return dropUnsentDrafts(now);

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
    // The ₹1 paid to send it goes back: the host never answered. No-op when it went free.
    await refundPaymentsFor('booking_commission', b.id, 'request not answered in time');
    await addInAppNotification(b.userId, {
      kind: 'booking_expired',
      title: 'Your request was not answered',
      body: `The host of ${b.listingTitle} did not answer within ${REQUEST_EXPIRY_HOURS} hours, so your request was closed. Any fee you paid to send it comes back. You can ask another host.`,
      msg: { key: 'request_expired_guest', params: { place: b.listingTitle, hours: REQUEST_EXPIRY_HOURS } },
      refId: b.id,
    });
    await addHostNotification(b.providerId, {
      kind: 'booking_expired',
      title: 'A booking request lapsed',
      body: `A request for ${b.listingTitle} closed because it was not answered within ${REQUEST_EXPIRY_HOURS} hours. Accept requests soon so guests can book you.`,
      msg: { key: 'request_expired_host', params: { place: b.listingTitle, hours: REQUEST_EXPIRY_HOURS } },
      refId: b.id,
    });
  }
  closed += await dropUnsentDrafts(now);
  if (closed) log.info(`[requests] closed ${closed} request(s) not answered within ${REQUEST_EXPIRY_HOURS}h`);
  return closed;
}

/**
 * Halfway through the answer window, the host gets one reminder for each request still waiting,
 * so a request does not lapse just because the first notice was missed. One per request: a
 * reminder already on record for that booking (kind booking_reminder, ref_id) is not sent again.
 */
export async function remindSlowHosts(now: Date = new Date()): Promise<number> {
  const half = new Date(now.getTime() - (REQUEST_EXPIRY_HOURS / 2) * 3600_000).toISOString();
  const cutoff = new Date(now.getTime() - REQUEST_EXPIRY_HOURS * 3600_000).toISOString();
  const waiting = await db.select({
    id: schema.bookings.id,
    listingTitle: schema.bookings.listingTitle,
    providerId: schema.listings.providerId,
  })
    .from(schema.bookings)
    .innerJoin(schema.listings, eq(schema.listings.id, schema.bookings.listingId))
    .where(and(
      eq(schema.bookings.status, 'pending_payment'),
      lt(schema.bookings.createdAt, half),
      gte(schema.bookings.createdAt, cutoff),
      inArray(schema.bookings.listingType, [...HOST_APPROVAL_TYPES]),
    ));
  if (!waiting.length) return 0;

  const already = await db.select({ refId: schema.notifications.refId })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.kind, 'booking_reminder'), inArray(schema.notifications.refId, waiting.map((b) => b.id))));
  const done = new Set(already.map((r) => r.refId));
  const hosts = await realHostIds(waiting.map((b) => b.providerId));
  let sent = 0;
  for (const b of waiting) {
    if (done.has(b.id) || !hosts.has(b.providerId)) continue;
    const left = Math.ceil(REQUEST_EXPIRY_HOURS / 2);
    await addHostNotification(b.providerId, {
      kind: 'booking_reminder',
      title: 'A guest is waiting for your answer',
      body: `A request for ${b.listingTitle} is still waiting. Accept or decline within about ${left} hours, or it closes by itself.`,
      msg: { key: 'request_reminder_host', params: { place: b.listingTitle, hours: left } },
      refId: b.id,
    });
    sent++;
  }
  if (sent) log.info(`[requests] reminded hosts about ${sent} waiting request(s)`);
  return sent;
}

/**
 * Requests saved but never sent (the traveller left without paying the ₹1 fee) are closed after a
 * day, so they do not keep a voucher locked. Nobody was told about them, so nobody is told now.
 */
async function dropUnsentDrafts(now: Date): Promise<number> {
  const cutoff = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const rows = await db.update(schema.bookings)
    .set({ status: 'cancelled', cancelledAt: now.toISOString() })
    .where(and(eq(schema.bookings.status, AWAITING_FEE), lt(schema.bookings.createdAt, cutoff)))
    .returning({ id: schema.bookings.id });
  for (const r of rows) await releaseVoucherForBooking(db, r.id);
  return rows.length;
}

/** Runs the sweep now and every 30 minutes. Never throws: a failed sweep waits for the next one. */
export function startRequestExpiry(): NodeJS.Timeout {
  const run = () => expireStaleRequests()
    .then(() => remindSlowHosts())
    .catch((err) => log.warn(`[requests] expiry sweep failed: ${(err as Error).message}`));
  void run();
  const timer = setInterval(run, 30 * 60 * 1000);
  timer.unref();
  return timer;
}
