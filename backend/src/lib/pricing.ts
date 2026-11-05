import { AMOUNTS, GST_RATE_PERCENT, PLATFORM_FEE_PERCENT, PASS_RENEWAL_BASE } from '../config';

/**
 * What a fixed-price payment is made of, in paise. The base price is the plan, pass or fee itself;
 * 18% GST and the 2% platform fee are each worked out on the base, on every payment.
 *
 *   host first year      ₹499 + ₹89.82 GST + ₹9.98 fee  = ₹598.80
 *   aangan pass, year 1  ₹12  + ₹2.16 GST  + ₹0.24 fee  = ₹14.40
 *   aangan pass, after   ₹99  + ₹17.82 GST + ₹1.98 fee  = ₹118.80
 *   booking fee          ₹1   + ₹0.18 GST  + ₹0.02 fee  = ₹1.20
 *
 * Both apps show these lines before the payment opens, and the payments row keeps a copy, so a
 * receipt still matches what was paid if the rates change later.
 */
export type PriceBreakup = {
  base: number;
  gst: number;
  platform_fee: number;
  total: number;
  gst_rate: number;
  platform_fee_rate: number;
};

/** Every fixed payment carries the 2% platform fee (host plans, the pass, the ₹1 booking fee). */
export function feeRateFor(_flow: string): number {
  return PLATFORM_FEE_PERCENT;
}

/** Paise, rounded half up. */
const percentOf = (paise: number, percent: number) => Math.round((paise * percent) / 100);

export function priceBreakup(base: number, platformFeeRate: number = PLATFORM_FEE_PERCENT): PriceBreakup {
  const gst = percentOf(base, GST_RATE_PERCENT);
  const platformFee = percentOf(base, platformFeeRate);
  return {
    base,
    gst,
    platform_fee: platformFee,
    total: base + gst + platformFee,
    gst_rate: GST_RATE_PERCENT,
    platform_fee_rate: platformFeeRate,
  };
}

/** The breakup of one fixed-price flow, with that flow's fee rate. */
export function flowBreakup(flow: string, base: number = AMOUNTS[flow]): PriceBreakup {
  return priceBreakup(base, feeRateFor(flow));
}

/**
 * The aangan pass costs ₹12 the first time and ₹99 every year after. Anyone who has held a pass
 * before (a stored expiry, lapsed or not) pays the renewal price.
 */
export function passBreakupFor(user: { supportExpiresAt?: string | null } | null | undefined): PriceBreakup {
  return flowBreakup('platform_support', user?.supportExpiresAt ? PASS_RENEWAL_BASE : AMOUNTS.platform_support);
}

/** The breakup of every fixed-price flow, for GET /payments/prices. */
export function priceList(): Record<string, PriceBreakup> {
  return {
    ...Object.fromEntries(Object.keys(AMOUNTS).map((flow) => [flow, flowBreakup(flow)])),
    platform_support_renewal: flowBreakup('platform_support', PASS_RENEWAL_BASE),
  };
}
