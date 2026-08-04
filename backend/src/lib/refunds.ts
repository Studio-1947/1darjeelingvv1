import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { db, schema } from '../db';
import { MOCK_PAYMENTS, rzpClient, log } from '../config';

/**
 * Returning money.
 *
 * Before this existed, every rupee the platform took was one-way: cancelling a booking flipped a
 * status column and nothing else, so a guest whose booking was cancelled — by themselves, by the
 * host, or by the double-booking guard in payments.ts — simply lost what they had paid. There was
 * no record of money owed and no way to return it without logging into the Razorpay dashboard by
 * hand.
 *
 * The unit of work here is the *payment*, not the booking: a refund is idempotent per payment row,
 * so a double-cancel, a retried webhook, and an admin clicking twice all converge on one refund.
 */

type PaymentRow = typeof schema.payments.$inferSelect;

export type RefundOutcome = {
  paymentId: string;
  orderId: string;
  amount: number;
  /** false when this payment was already refunded — not an error, just nothing left to do. */
  refunded: boolean;
  /** Set when the gateway refused. The payment row is left untouched so a retry can succeed. */
  error?: string;
};

/**
 * Refunds one settled payment. Safe to call repeatedly.
 *
 * Never throws: a refund runs on paths that have already taken the user's money and already
 * committed the thing the money was for (a cancellation, a conflicting booking). Aborting those
 * with a 500 because Razorpay was briefly unreachable would be worse than recording the failure
 * and letting an operator retry — so the failure is returned, and logged loudly.
 */
export async function refundPayment(payment: PaymentRow, reason: string): Promise<RefundOutcome> {
  const base = { paymentId: payment.id, orderId: payment.orderId, amount: payment.amount };

  if (payment.status !== 'paid') {
    // Never settled (or already refunded) — there is nothing to send back.
    return { ...base, refunded: false };
  }

  let gatewayRefundId: string;

  if (payment.mock || MOCK_PAYMENTS || !payment.paymentId) {
    // A mocked payment moved no money, so there is nothing to ask a gateway for. The row is still
    // marked refunded, because the app's own record of what the user owes must be correct in
    // mock mode too — that is what lets the pre-go-live deployment exercise this path honestly.
    gatewayRefundId = `mock_rfnd_${payment.orderId}`;
  } else {
    if (!rzpClient) {
      const error = 'Razorpay client is not configured; cannot refund a real payment.';
      log.error(`[refund] ${error} payment=${payment.id} order=${payment.orderId}`);
      await recordFailedAttempt(payment, reason, error);
      return { ...base, refunded: false, error };
    }
    try {
      // `speed: 'normal'` (rather than 'optimum') keeps this on the free settlement path; the
      // money lands in 5-7 working days, which is the standard the refund policy page states.
      const refund = await rzpClient.payments.refund(payment.paymentId, {
        amount: payment.amount,
        speed: 'normal',
        notes: { reason, order_id: payment.orderId },
      });
      gatewayRefundId = String(refund.id);
    } catch (err) {
      const error = (err as Error)?.message || 'unknown gateway error';
      // Loud, because nothing else in the system will notice: the cancellation the caller asked
      // for has already happened and it returns 200 either way.
      log.error(
        `[refund] gateway refused a refund — MONEY IS STILL HELD. ` +
        `payment=${payment.id} order=${payment.orderId} amount=${payment.amount} reason="${reason}": ${error}`
      );
      await recordFailedAttempt(payment, reason, error);
      return { ...base, refunded: false, error };
    }
  }

  // Conditional on status so two concurrent refunds cannot both mark the row and double-report.
  // Whoever loses the race gets zero rows back and reports "already refunded", which is true.
  const updated = await db.update(schema.payments)
    .set({
      status: 'refunded',
      refundId: gatewayRefundId,
      refundedAt: new Date().toISOString(),
      refundAmount: payment.amount,
      refundReason: reason,
    })
    .where(and(eq(schema.payments.id, payment.id), eq(schema.payments.status, 'paid')))
    .returning();

  if (updated.length === 0) {
    return { ...base, refunded: false };
  }

  log.info(`[refund] refunded ${payment.amount} paise for order=${payment.orderId} reason="${reason}" ref=${gatewayRefundId}`);
  return { ...base, refunded: true };
}

/**
 * Records that a refund was owed and could not be delivered, without changing `status`.
 *
 * The row stays `paid`, because the money genuinely is still with the platform — reporting it as
 * refunded would make the books lie. Stamping the reason and the error is what puts it on the
 * operator's queue (see listUnreturnedPayments) instead of losing it to a log line.
 */
async function recordFailedAttempt(payment: PaymentRow, reason: string, error: string): Promise<void> {
  await db.update(schema.payments)
    .set({ refundReason: reason, refundError: error.slice(0, 500) })
    .where(and(eq(schema.payments.id, payment.id), eq(schema.payments.status, 'paid')));
}

/**
 * Refunds every settled payment attached to one thing — a booking id, a provider id, a user id.
 *
 * There is normally exactly one, but the loop is deliberate: a retried checkout can leave two paid
 * rows against the same reference, and refunding only the first would quietly keep the second.
 */
export async function refundPaymentsFor(
  flow: string,
  referenceId: string,
  reason: string
): Promise<RefundOutcome[]> {
  const rows = await db.select().from(schema.payments).where(
    and(
      eq(schema.payments.flow, flow),
      eq(schema.payments.referenceId, referenceId),
      eq(schema.payments.status, 'paid')
    )
  );

  const outcomes: RefundOutcome[] = [];
  for (const row of rows) {
    outcomes.push(await refundPayment(row, reason));
  }
  return outcomes;
}

/**
 * Every payment that was charged but whose refund failed at the gateway — the operator's work
 * queue. Surfaced through GET /api/admin/refunds/pending so a Razorpay outage during a
 * cancellation cannot silently become money the platform simply kept.
 */
export async function listUnreturnedPayments(): Promise<PaymentRow[]> {
  return db.select().from(schema.payments).where(
    and(
      eq(schema.payments.status, 'paid'),
      isNotNull(schema.payments.refundReason),
      isNull(schema.payments.refundedAt)
    )
  );
}
