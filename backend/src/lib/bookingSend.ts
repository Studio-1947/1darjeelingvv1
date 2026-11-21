import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { REQUEST_EXPIRY_HOURS, log } from '../config';
import { findBlockingBooking, isDateExclusive, lockBookingForChange } from './bookingAvailability';
import { hasStartDatePassed } from './bookingRules';
import { approvalRequired, realHostIds } from './bookingApproval';
import { addHostNotification, addInAppNotification } from './inApp';
import { notifyBookingRequest } from './notifications';
import { refundPaymentsFor } from './refunds';
import { releaseVoucherForBooking } from './vouchers';
import { isExemptFromSupport, isSupportActive, type SupportUser } from './support';

type BookingRow = typeof schema.bookings.$inferSelect;

/**
 * A request saved but not yet sent: the traveller has no aangan pass and has not paid the ₹1 fee.
 * The host does not see it, it holds no dates, and it never counts as an open request. Paying the
 * fee (payment flow `booking_commission`) or taking the pass sends it (status `pending_payment`).
 */
export const AWAITING_FEE = 'awaiting_fee';

/** With the pass (or as a paid host or admin) a request goes straight to the host, free. */
export function sendsFree(user: SupportUser): boolean {
  return isExemptFromSupport(user) || isSupportActive(user);
}

/**
 * Tells the host about a request that has just gone out (feed, and WhatsApp/email when they must
 * answer it), and puts "Request sent" in the guest's own feed.
 */
export async function announceRequest(
  booking: Pick<BookingRow, 'id' | 'userId' | 'checkIn' | 'checkOut' | 'guests' | 'listingTitle' | 'listingType'> & Partial<BookingRow>,
  listing: { providerId: string; title: string; type: string },
  guestName: string,
) {
  const awaitingHost = approvalRequired(listing.type, listing.providerId, await realHostIds([listing.providerId]));
  await addHostNotification(listing.providerId, {
    kind: 'booking_request',
    title: 'New booking request',
    body: awaitingHost
      ? `${guestName || 'A guest'} asked to book ${listing.title}. Accept or decline it on your dashboard.`
      : `${guestName || 'A guest'} asked about ${listing.title}.`,
    msg: { key: awaitingHost ? 'booking_request_host' : 'booking_enquiry_host', params: { guest: guestName || '', place: listing.title } },
    refId: booking.id,
  });
  // A request needs the host to act, so it also goes out by WhatsApp/email (not awaited: the
  // guest's answer must not wait on a gateway).
  if (awaitingHost && listing.providerId) {
    void notifyBookingRequest(booking as BookingRow, listing.providerId, guestName || 'A guest');
    void addInAppNotification(booking.userId, {
      kind: 'booking_requested',
      title: 'Request sent',
      body: `Your request for ${listing.title} has gone to the host. You will hear back within ${REQUEST_EXPIRY_HOURS} hours. If the host says no, any fee you paid comes back.`,
      msg: { key: 'request_sent', params: { place: listing.title, hours: REQUEST_EXPIRY_HOURS } },
      refId: booking.id,
    });
  }
  return awaitingHost;
}

export type SendOutcome =
  | { outcome: 'missing' }
  | { outcome: 'sent' | 'already' | 'cancelled' | 'taken' | 'past'; booking: BookingRow; awaitingHost?: boolean };

/**
 * Sends a request that was waiting on the fee: under the listing lock, the dates are checked
 * again (someone may have taken them while the traveller paid), then the request goes to the
 * host and its 48-hour clock starts now. `paid` says the ₹1 fee was paid for it; whenever the
 * request then does not go out, that fee is refunded.
 */
export async function sendAwaitingRequest(bookingId: string, { paid }: { paid: boolean }): Promise<SendOutcome> {
  const result = await db.transaction(async (tx) => {
    const now = await lockBookingForChange(tx, bookingId);
    if (!now) return { outcome: 'missing' as const };
    if (now.status !== AWAITING_FEE) {
      return { outcome: now.status === 'cancelled' ? 'cancelled' as const : 'already' as const, booking: now };
    }
    const close = async () => {
      const [cancelled] = await tx.update(schema.bookings)
        .set({ status: 'cancelled', cancelledAt: new Date().toISOString() })
        .where(eq(schema.bookings.id, now.id)).returning();
      await releaseVoucherForBooking(tx, now.id);
      return cancelled;
    };
    if (hasStartDatePassed(now.checkIn)) return { outcome: 'past' as const, booking: await close() };
    if (isDateExclusive(now.listingType) && now.checkIn && now.checkOut) {
      const clash = await findBlockingBooking(tx, now.listingId, now.checkIn, now.checkOut, now.id);
      if (clash) return { outcome: 'taken' as const, booking: await close() };
    }
    const [sent] = await tx.update(schema.bookings)
      .set({ status: 'pending_payment', createdAt: new Date().toISOString() })
      .where(and(eq(schema.bookings.id, now.id), eq(schema.bookings.status, AWAITING_FEE)))
      .returning();
    return { outcome: 'sent' as const, booking: sent };
  });

  if (result.outcome === 'missing') return result;
  if (paid && result.outcome !== 'sent') {
    // Paid, but the request never reached a host (dates gone, date passed, already sent with the
    // pass, or withdrawn while paying): the fee goes back.
    await refundPaymentsFor('booking_commission', bookingId, `request not sent (${result.outcome})`);
  }
  if (result.outcome !== 'sent') return result;

  const b = result.booking;
  const [listing] = await db.select({ providerId: schema.listings.providerId, title: schema.listings.title, type: schema.listings.type })
    .from(schema.listings).where(eq(schema.listings.id, b.listingId)).limit(1);
  const [guest] = await db.select({ name: schema.users.name }).from(schema.users).where(eq(schema.users.id, b.userId)).limit(1);
  let awaitingHost = false;
  if (listing) {
    try {
      awaitingHost = await announceRequest(b, listing, guest?.name || '');
    } catch (err) {
      // The request is sent either way; the host still sees it on the dashboard.
      log.warn(`[booking] ${b.id} sent, but telling the host failed: ${(err as Error).message}`);
    }
  }
  return { ...result, awaitingHost };
}
