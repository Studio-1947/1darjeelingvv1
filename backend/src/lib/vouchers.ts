import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';

/** Either the shared connection or a transaction handle; both can run an UPDATE. */
type Executor = Pick<typeof db, 'update'>;

/**
 * Gives a referral voucher back when the booking it was spent on never took effect.
 *
 * POST /bookings burns the voucher the moment the booking row is written, before the guest has
 * confirmed anything. If the nights then go to someone else, the checkout is refused, or the guest
 * changes their mind, the booking is cancelled and nothing was received for the voucher. Without
 * this the discount was simply lost, and the only way a referrer earns one is by bringing in
 * another person.
 *
 * Only call it for a booking that was not `confirmed`: a confirmed stay did use its discount, so
 * cancelling that one keeps the voucher spent. Idempotent, and a no-op when the booking carried no
 * voucher, so it is safe to call on every cancellation path.
 *
 * Returns whether a voucher was restored.
 */
export async function releaseVoucherForBooking(
  executor: Executor,
  bookingId: string
): Promise<boolean> {
  const restored = await executor
    .update(schema.vouchers)
    .set({ status: 'available', usedAt: null, usedOnBookingId: null })
    .where(
      and(
        eq(schema.vouchers.usedOnBookingId, bookingId),
        eq(schema.vouchers.status, 'used')
      )
    )
    .returning({ id: schema.vouchers.id });
  return restored.length > 0;
}
