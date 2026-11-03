import { AMOUNTS, GST_RATE_PERCENT, PLATFORM_FEE_PERCENT } from '../config';

/**
 * What a fixed-price payment is made of, in paise. The base price is the plan, pass or fee itself;
 * 18% GST and the 2% platform fee are each worked out on the base, and the total is what is charged.
 *
 *   host first year  ₹499 + ₹89.82 GST + ₹9.98 fee  = ₹598.80
 *   aangan pass      ₹12  + ₹2.16 GST  + ₹0.24 fee  = ₹14.40
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

/** Paise, rounded half up. */
const percentOf = (paise: number, percent: number) => Math.round((paise * percent) / 100);

export function priceBreakup(base: number): PriceBreakup {
  const gst = percentOf(base, GST_RATE_PERCENT);
  const platformFee = percentOf(base, PLATFORM_FEE_PERCENT);
  return {
    base,
    gst,
    platform_fee: platformFee,
    total: base + gst + platformFee,
    gst_rate: GST_RATE_PERCENT,
    platform_fee_rate: PLATFORM_FEE_PERCENT,
  };
}

/** The breakup of every fixed-price flow, for GET /payments/prices. */
export function priceList(): Record<string, PriceBreakup> {
  return Object.fromEntries(Object.entries(AMOUNTS).map(([flow, base]) => [flow, priceBreakup(base)]));
}
