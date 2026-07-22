import { AMOUNTS, DONATION_MIN_PAISE, DONATION_MAX_PAISE } from '../config';

export type AmountResolution =
  | { amount: number }
  | { error: { status: number; detail: string } };

const rupees = (paise: number) => (paise / 100).toLocaleString('en-IN');

/**
 * Decides how much an order is for — the single place in the system permitted to do so.
 *
 * Every flow but one has a fixed price, taken from AMOUNTS and never from the caller. A donation
 * is the exception by nature: the giver chooses. That makes it the only path where a
 * client-supplied number becomes a real charge, which is exactly why the decision lives in one
 * named, testable function instead of an `if` inside the route handler. Anyone auditing "can a
 * client name its own price?" reads this function and gets a complete answer.
 *
 * Returns either the resolved amount or the error to send. Never throws.
 */
export function resolveAmount(flow: string, body: any): AmountResolution {
  if (typeof flow !== 'string' || flow.length === 0) {
    return { error: { status: 400, detail: 'Invalid payment flow' } };
  }

  if (flow !== 'donation') {
    const amount = AMOUNTS[flow];
    if (!amount) {
      return { error: { status: 400, detail: 'Invalid payment flow' } };
    }
    // The body is not consulted. A fixed-price flow carrying an `amount` is either a confused
    // client or a hostile one; either way the map wins.
    return { amount };
  }

  const raw = body?.amount;

  // Deliberately no coercion. Number('  5000  ') is 5000 and Number('1e9') is a billion — a
  // string that looks like money must be rejected, not quietly turned into a charge.
  if (typeof raw !== 'number' || !Number.isFinite(raw) || !Number.isInteger(raw)) {
    return {
      error: {
        status: 400,
        detail: 'Donation amount must be a whole number of paise',
      },
    };
  }

  if (raw < DONATION_MIN_PAISE || raw > DONATION_MAX_PAISE) {
    return {
      error: {
        status: 400,
        detail: `Donation must be between ₹${rupees(DONATION_MIN_PAISE)} and ₹${rupees(DONATION_MAX_PAISE)}`,
      },
    };
  }

  return { amount: raw };
}
