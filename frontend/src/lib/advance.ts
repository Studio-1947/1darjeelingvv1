import type { TFunction } from 'i18next';

/**
 * A homestay's advance (server lib/advance.ts): 10-15% the guest pays straight to the host's UPI
 * after the booking is confirmed. aangan never holds it; the app only records "I've paid" and
 * "Advance received". The host's refund rule: returned if the guest cancels at least 3, 7 or 14
 * days before check-in (`refund_days`), or never (null).
 */
export type AdvancePolicy = { percent: number; refund_days: number | null };

/** The policy on a listing's extras, or null when the host asks for none. */
export function advancePolicyOf(extras: any): AdvancePolicy | null {
  const a = extras?.advance;
  const percent = Number(a?.percent);
  if (!a || !Number.isInteger(percent) || percent < 10 || percent > 15) return null;
  const days = Number(a.refund_days);
  return { percent, refund_days: [3, 7, 14].includes(days) ? days : null };
}

/** The advance on `amount` rupees, rounded to the rupee (the server's rule). */
export const advanceOf = (amount: number, percent: number) => Math.max(0, Math.round((amount * percent) / 100));

/** "Returned if you cancel 7 or more days before check-in" / "Not returned if you cancel". */
export const refundRuleText = (t: TFunction, days: number | null) =>
  days ? String(t('advance.refund_days', { count: days })) : String(t('advance.refund_none'));

/**
 * A UPI payment link the guest's UPI app opens with the host, the amount and a note filled in.
 * The note names the booking so the host can match it; nothing else about the guest goes in.
 */
export function upiPayLink(upi: string, payee: string, amount: number, bookingId: string) {
  const q = new URLSearchParams({
    pa: upi, pn: payee.slice(0, 40), am: String(amount), cu: 'INR', tn: `aangan advance ${bookingId.slice(0, 8)}`,
  });
  return `upi://pay?${q.toString()}`;
}
