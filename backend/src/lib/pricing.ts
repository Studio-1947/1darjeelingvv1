import { AMOUNTS, GST_RATE_PERCENT, PLATFORM_FEE_PERCENT, PASS_RENEWAL_BASE } from '../config';

/**
 * What a fixed-price payment is made of, in paise. The base price is the plan, pass or fee itself;
 * 18% GST is worked out on the base. Host payments also carry the 2% payment gateway fee;
 * traveller payments (the pass and the ₹1 booking fee) carry GST only.
 *
 *   host first year      ₹499 + ₹89.82 GST + ₹9.98 fee  = ₹598.80
 *   aangan pass, year 1  ₹12  + ₹2.16 GST               = ₹14.16
 *   aangan pass, after   ₹99  + ₹17.82 GST              = ₹116.82
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

/** Flows paid by travellers: GST only, no gateway fee. */
const TRAVELLER_FLOWS = new Set(['platform_support', 'booking_commission']);

export function feeRateFor(flow: string): number {
  return TRAVELLER_FLOWS.has(flow) ? 0 : PLATFORM_FEE_PERCENT;
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
