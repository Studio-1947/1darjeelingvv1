/**
 * The advance a homestay host may ask for (user decision 2026-11-22).
 *
 * A host can ask for 10 to 15% of the stay up front. The guest pays it straight to the host's own
 * UPI ID; the money never passes through aangan, so aangan never holds, refunds or reports it.
 * aangan only records what each side says: the guest taps "I've paid", the host taps "Advance
 * received".
 *
 * When: after the booking is confirmed, never before. The host's UPI ID is often just their phone
 * number ("98xxxxxxxx@ybl"), and the number opens only on a confirmed booking
 * (lib/listingContact.ts), so the UPI ID is shown at exactly the same moment and to the same
 * person, through the trip card's host contact, never on a listing or a host page.
 *
 * If the advance has not arrived ADVANCE_DUE_HOURS after confirming, the host may cancel the
 * booking (reason `advance_unpaid`). Like a no-show, the ₹1 is kept: the guest has had the number.
 *
 * The refund rule is the host's own, shown before a guest asks: returned if the guest cancels at
 * least 3, 7 or 14 days before check-in, or never returned. A host who cancels returns it in full.
 * The policy is copied onto each booking when it is made, so a later change never alters a
 * booking already asked for.
 */

/** The listing types that may ask for an advance. */
export const ADVANCE_TYPES = new Set(['homestay']);
export const MIN_ADVANCE_PERCENT = 10;
export const MAX_ADVANCE_PERCENT = 15;
/** "Returned if you cancel at least this many days before check-in". Null means never returned. */
export const ADVANCE_REFUND_DAYS = [3, 7, 14] as const;
/** How long the guest has, after confirming, before the host may cancel for an unpaid advance. */
export const ADVANCE_DUE_HOURS = 24;

export type AdvancePolicy = { percent: number; refund_days: number | null };

/**
 * The profile's `advance` field, checked. `null` (or an empty value) turns the advance off.
 * Otherwise `{ percent: 10..15, refund_days: 3 | 7 | 14 | null }`.
 */
export function checkAdvancePolicy(v: unknown): AdvancePolicy | null | { error: string } {
  if (v === null || v === undefined || v === '' || v === false) return null;
  if (typeof v !== 'object' || Array.isArray(v)) return { error: 'The advance must be a percent and a refund rule' };
  const e = v as Record<string, unknown>;
  const percent = typeof e.percent === 'string' && e.percent.trim() !== '' ? Number(e.percent) : e.percent;
  if (percent === 0 || percent === null || percent === undefined) return null;
  if (typeof percent !== 'number' || !Number.isInteger(percent) || percent < MIN_ADVANCE_PERCENT || percent > MAX_ADVANCE_PERCENT) {
    return { error: `The advance must be a whole percent from ${MIN_ADVANCE_PERCENT} to ${MAX_ADVANCE_PERCENT}` };
  }
  const raw = e.refund_days;
  const days = raw === null || raw === undefined || raw === '' || raw === 0 ? null : typeof raw === 'string' ? Number(raw) : raw;
  if (days !== null && !(ADVANCE_REFUND_DAYS as readonly unknown[]).includes(days)) {
    return { error: `The refund rule must be ${ADVANCE_REFUND_DAYS.join(', ')} days before check-in, or not returned` };
  }
  return { percent, refund_days: days as number | null };
}

/** The advance policy stored in a host's extras, or null when they do not ask for one. */
export function advancePolicyOf(extras: Record<string, any> | null | undefined): AdvancePolicy | null {
  const checked = checkAdvancePolicy(extras?.advance);
  return checked && !('error' in checked) ? checked : null;
}

/** The host's UPI ID, if they saved one. */
export function upiOf(extras: Record<string, any> | null | undefined): string | null {
  const v = extras?.upi;
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

/** The advance on a stay of `amount` rupees, rounded to the rupee. */
export function advanceAmount(amount: number, percent: number): number {
  return Math.max(0, Math.round((amount * percent) / 100));
}

type AdvanceRow = {
  status: string;
  confirmedAt: string | null;
  advancePercent: number | null;
  advanceAmount: number | null;
  advanceRefundDays: number | null;
  advancePaidAt: string | null;
  advanceReceivedAt: string | null;
};

/** When the advance is due: ADVANCE_DUE_HOURS after the booking was confirmed. */
export function advanceDueAt(b: Pick<AdvanceRow, 'confirmedAt'>): string | null {
  if (!b.confirmedAt) return null;
  const t = Date.parse(b.confirmedAt);
  return Number.isNaN(t) ? null : new Date(t + ADVANCE_DUE_HOURS * 3_600_000).toISOString();
}

/** Whether this booking carries an advance at all. */
export const asksAdvance = (b: Pick<AdvanceRow, 'advancePercent' | 'advanceAmount'>) =>
  !!b.advancePercent && (b.advanceAmount ?? 0) > 0;

/**
 * Whether the host may cancel this booking for an advance that never came: confirmed, asked for,
 * not marked received, and the due time has passed. The trip being over is checked by the caller.
 */
export function advanceUnpaidOpen(b: AdvanceRow, now: Date = new Date()): boolean {
  if (b.status !== 'confirmed' || !asksAdvance(b) || b.advanceReceivedAt) return false;
  const due = advanceDueAt(b);
  return !!due && now.getTime() >= Date.parse(due);
}

/** The advance as both booking lists return it; null when none was asked. Never the UPI ID. */
export function advanceShape(b: AdvanceRow) {
  if (!asksAdvance(b)) return null;
  return {
    percent: b.advancePercent,
    amount: b.advanceAmount,
    refund_days: b.advanceRefundDays,
    due_at: advanceDueAt(b),
    paid_at: b.advancePaidAt,
    received_at: b.advanceReceivedAt,
  };
}
