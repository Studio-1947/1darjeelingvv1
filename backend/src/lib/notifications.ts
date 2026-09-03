import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { NOTIFY_BOOKINGS, log } from '../config';
import { sendNotification } from '../messaging';
import type { NotificationTemplate } from '../messaging';

/**
 * Telling people what happened to their booking.
 *
 * This closes INVESTIGATION.md §6.A, whose failure mode was not "the message looked wrong" but
 * "there was no message and nothing said so": the confirmation site was a `log.info` behind
 * `if (!IS_PROD)`, so in production a paid, confirmed booking notified neither party and reported
 * no error. The discovery path was a guest arriving at a homestay that had never been told.
 *
 * Two rules follow from that, and everything here exists to serve them:
 *
 *  1. **Never throw.** These run after the money has moved and the booking has been written.
 *     Failing the HTTP request because an SMS gateway timed out would turn a delivered service
 *     into a 500 and, worse, invite a retry that pays twice.
 *  2. **Never fail silently.** Every attempt is stamped onto the booking row, so a missing
 *     notification is a queryable fact rather than an absence nobody can see.
 */

const SIGNATURE = '— aangan · By studio 1947';

/**
 * A date range rendered for a human, tolerant of the non-homestay bookings that have no dates.
 *
 * Returns a bare noun phrase with no leading preposition, because the caller supplies that. The
 * two single-date branches used to carry their own "on", which read correctly nowhere it was
 * actually used: every call site says "confirmed for {stay}", so a taxi booking announced itself
 * as "confirmed for on a date to be arranged". Worth fixing now rather than later — this string
 * goes into WhatsApp templates, and changing an approved template means another review.
 */
function formatStay(checkIn: string | null, checkOut: string | null): string {
  if (checkIn && checkOut) return `${checkIn} to ${checkOut}`;
  if (checkIn) return checkIn;
  return 'a date to be arranged';
}

type BookingRow = typeof schema.bookings.$inferSelect;

export interface BookingParties {
  booking: BookingRow;
  guestName: string;
  guestPhone: string;
  /** Null when the listing has no reachable owner — an admin-authored listing, typically. */
  hostName: string | null;
  hostPhone: string | null;
}

/**
 * Sends one message and reports whether it was delivered. Swallows nothing quietly: a failure
 * returns its reason so the caller can persist it.
 */
async function deliver(
  phone: string,
  template: NotificationTemplate,
  vars: Record<string, string>,
  text: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await sendNotification({ phone, template, vars, text });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: (err as Error)?.message || 'unknown delivery error' };
  }
}

/**
 * Tells the guest and the host that a booking is confirmed, and records what happened.
 *
 * Each recipient is attempted independently — a host with no phone number on file, or a gateway
 * that rejects one number, must not cost the other party their message.
 */
export async function notifyBookingConfirmed(parties: BookingParties): Promise<void> {
  const { booking, guestName, guestPhone, hostName, hostPhone } = parties;

  if (!NOTIFY_BOOKINGS) {
    // An explicit operator choice (see config.ts), which startup already logged loudly. Recorded
    // on the row too, so a booking with no notification has a stated reason rather than a blank.
    await db.update(schema.bookings)
      .set({ notifyError: 'NOTIFY_BOOKINGS=false — notifications are switched off' })
      .where(eq(schema.bookings.id, booking.id));
    return;
  }

  const stay = formatStay(booking.checkIn, booking.checkOut);
  const errors: string[] = [];
  const stamps: Partial<typeof schema.bookings.$inferInsert> = {};

  if (guestPhone) {
    const contact = hostName && hostPhone ? `Host: ${hostName}, ${hostPhone}.` : 'The host will contact you.';
    const result = await deliver(
      guestPhone,
      'booking_confirmed_guest',
      { name: guestName, listing: booking.listingTitle, stay, host: contact },
      `Your booking at ${booking.listingTitle} is confirmed for ${stay}. ${contact} ${SIGNATURE}`
    );
    if (result.ok) stamps.touristNotifiedAt = new Date().toISOString();
    else errors.push(`guest: ${result.error}`);
  } else {
    errors.push('guest: no phone number on the account');
  }

  if (hostPhone) {
    const result = await deliver(
      hostPhone,
      'booking_confirmed_host',
      {
        listing: booking.listingTitle,
        guest: guestName,
        guest_phone: guestPhone,
        stay,
        guests: String(booking.guests),
      },
      `New confirmed booking at ${booking.listingTitle}: ${guestName} (${guestPhone}), ` +
      `${stay}, ${booking.guests} guest(s). ${SIGNATURE}`
    );
    if (result.ok) stamps.providerNotifiedAt = new Date().toISOString();
    else errors.push(`host: ${result.error}`);
  } else {
    errors.push('host: no contact number for this listing');
  }

  // One write for both outcomes. `notifyError` is cleared on a fully successful run so a
  // re-notification after a fixed gateway does not leave a stale complaint behind.
  await db.update(schema.bookings)
    .set({ ...stamps, notifyError: errors.length > 0 ? errors.join('; ').slice(0, 500) : null })
    .where(eq(schema.bookings.id, booking.id));

  if (errors.length > 0) {
    log.error(`[notify] booking ${booking.id} confirmed but not fully announced — ${errors.join('; ')}`);
  }
}

/**
 * Tells the guest their booking was cancelled, and whether their money is coming back.
 *
 * Used by the cancel route and by the double-booking guard in payments.ts, which cancels a
 * booking the guest has already paid for — the one case where silence would be indefensible.
 */
export async function notifyBookingCancelled(
  booking: BookingRow,
  guestPhone: string,
  guestName: string,
  refunded: boolean
): Promise<void> {
  if (!NOTIFY_BOOKINGS || !guestPhone) return;

  const stay = formatStay(booking.checkIn, booking.checkOut);
  const refundLine = refunded
    ? 'Your payment has been refunded and will reach your account in 5-7 working days.'
    : 'If you were charged, our team will contact you about the refund.';

  const result = await deliver(
    guestPhone,
    'booking_cancelled_guest',
    { name: guestName, listing: booking.listingTitle, stay, refund: refundLine },
    `Your booking at ${booking.listingTitle} for ${stay} has been cancelled. ${refundLine} ${SIGNATURE}`
  );

  if (!result.ok) {
    log.error(`[notify] could not tell the guest that booking ${booking.id} was cancelled — ${result.error}`);
    await db.update(schema.bookings)
      .set({ notifyError: `cancellation: ${result.error}`.slice(0, 500) })
      .where(eq(schema.bookings.id, booking.id));
  }
}
