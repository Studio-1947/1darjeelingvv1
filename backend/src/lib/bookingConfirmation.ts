import { eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { log } from '../config';
import { findBlockingBooking, isDateExclusive, lockListingForBooking } from './bookingAvailability';
import { notifyBookingCancelled, notifyBookingConfirmed } from './notifications';
import { addInAppNotification, resolveHostUserId } from './inApp';
import { refundPaymentsFor } from './refunds';
import { serializeProvider } from './providerShape';

type BookingRow = typeof schema.bookings.$inferSelect;

/**
 * Confirms a booking under the listing-row lock, exactly once.
 *
 * Confirming is not a plain UPDATE, because two guests can reach this point at the same instant
 * for the same homestay and the same nights. The hold window in POST /bookings makes that rare;
 * this makes it impossible. See lib/bookingAvailability.ts for why the listing row lock is what
 * actually serialises them: an overlap check on its own cannot, since each transaction reads a
 * snapshot taken before the other committed.
 */
async function confirmUnderLock(bookingId: string) {
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(schema.bookings)
      .where(eq(schema.bookings.id, bookingId)).limit(1);
    if (!target) return { outcome: 'missing' as const };

    // Already confirmed by an earlier call  nothing to redo.
    if (target.status === 'confirmed') return { outcome: 'confirmed' as const, booking: target };

    if (isDateExclusive(target.listingType) && target.checkIn && target.checkOut) {
      await lockListingForBooking(tx, target.listingId);

      const clash = await findBlockingBooking(
        tx, target.listingId, target.checkIn, target.checkOut, target.id
      );
      // `accepted` counts as taken here for the same reason it blocks in the predicate: the host
      // has already promised those nights to someone else, so confirming this one would send two
      // parties to one room just as surely as a confirmed clash would.
      if (clash && (clash.status === 'confirmed' || clash.status === 'accepted')) {
        const [cancelled] = await tx.update(schema.bookings)
          .set({ status: 'cancelled' })
          .where(eq(schema.bookings.id, target.id))
          .returning();
        return { outcome: 'conflict' as const, booking: cancelled };
      }
    }

    const [confirmed] = await tx.update(schema.bookings)
      .set({ status: 'confirmed', confirmedAt: new Date().toISOString() })
      .where(eq(schema.bookings.id, target.id))
      .returning();
    return { outcome: 'confirmed' as const, booking: confirmed };
  });
}

/**
 * Confirms a booking and tells both parties, returning the confirmation record the clients show.
 *
 * `paid` says whether money moved for it. Only the legacy ₹1 commission path passes true: if its
 * dates went to someone else first, the guest was charged for nothing, so the payment is refunded
 * and the guest is told on WhatsApp. A free checkout has nothing to refund, and the guest is in
 * the app waiting on this answer, so a conflict just cancels the booking and is reported back.
 *
 * Returns null when the booking does not exist.
 */
export async function settleBookingConfirmation(
  bookingId: string,
  userId: string,
  { paid }: { paid: boolean }
) {
  const settlement = await confirmUnderLock(bookingId);
  if (settlement.outcome === 'missing') return null;

  const booking: BookingRow = settlement.booking;
  const conflicted = settlement.outcome === 'conflict';

  const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.id, booking.listingId)).limit(1);
  let providerInfo: any = null;
  if (listing) {
    const [prov] = await db.select().from(schema.providers).where(eq(schema.providers.id, listing.providerId)).limit(1);
    if (prov) {
      providerInfo = serializeProvider(prov);
    } else {
      const [userProv] = await db.select().from(schema.users).where(eq(schema.users.id, listing.providerId)).limit(1);
      if (userProv) providerInfo = { name: userProv.name, phone: userProv.phone };
    }
  }

  const [bookingUser] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);

  // The host's reachable number: a full provider row carries one, an admin-authored listing falls
  // back to the owning user's phone, and some listings have neither.
  const hostPhone = providerInfo?.contact_phone || providerInfo?.phone || null;
  const hostName = providerInfo?.business_name || providerInfo?.name || null;

  if (conflicted) {
    await addInAppNotification(booking.userId, {
      kind: 'booking_cancelled',
      title: 'Booking cancelled',
      body: `The dates for ${booking.listingTitle} went to another guest first, so your booking was cancelled.`,
      refId: booking.id,
    });
    if (paid) {
      // Charged for dates that are no longer available. Return the money first, then tell them
      //  in that order, so the message can state truthfully whether the refund went through.
      const outcomes = await refundPaymentsFor('booking_commission', booking.id, 'double-booked: dates taken by another guest');
      const refunded = outcomes.some(o => o.refunded);
      await notifyBookingCancelled(booking, bookingUser?.phone || '', bookingUser?.name || 'Guest', refunded);
      log.error(
        `[booking] ${booking.id} was paid for but the dates were taken first  cancelled and ` +
        `${refunded ? 'refunded' : 'REFUND FAILED, money still held'}.`
      );
    }
  } else {
    await addInAppNotification(booking.userId, {
      kind: 'booking_confirmed',
      title: 'Booking confirmed',
      body: `Your booking for ${booking.listingTitle} is confirmed.`,
      refId: booking.id,
    });
    await addInAppNotification(await resolveHostUserId(listing?.providerId), {
      kind: 'booking_confirmed',
      title: 'Booking confirmed',
      body: `${bookingUser?.name || 'A guest'} confirmed a booking for ${booking.listingTitle}.`,
      refId: booking.id,
    });
    // notifyBookingConfirmed never throws and records its own outcome on the booking row, so
    // awaiting it is safe and makes a message that did not go out a queryable fact.
    await notifyBookingConfirmed({
      booking,
      guestName: bookingUser?.name || 'Guest',
      guestPhone: bookingUser?.phone || '',
      hostName,
      hostPhone,
    });
  }

  return {
    conflict: conflicted,
    id: booking.id,
    user_id: booking.userId,
    listing_id: booking.listingId,
    listing_type: booking.listingType,
    listing_title: booking.listingTitle,
    check_in: booking.checkIn,
    check_out: booking.checkOut,
    guests: booking.guests,
    notes: booking.notes,
    status: booking.status,
    created_at: booking.createdAt,
    confirmed_at: booking.confirmedAt,
    listing,
    provider: providerInfo,
  };
}
