import { AMOUNTS, GST_RATE_PERCENT, PLATFORM_FEE_PERCENT, PASS_RENEWAL_BASE, GST_INCLUDED_FLOWS, SMALL_HOST_PLAN_BASE, SMALL_HOST_TYPES } from '../config';

/**
 * What a fixed-price payment is made of, in paise. The base price is the plan, pass or fee itself;
 * 18% GST is worked out on the base. There is no platform fee (PLATFORM_FEE_PERCENT is 0; the
 * platform_fee field stays, always 0, so stored breakups keep one shape).
 *
 *   homestay, driver or guide, each year  ₹499 + ₹89.82 GST = ₹588.82
 *   cafe, each year                       ₹99  + ₹17.82 GST = ₹116.82
 *   request fee                           ₹1   + ₹0.18 GST  = ₹1.18
 *
 * The aangan pass already includes GST (`gst_included`): ₹1 the first year
 * (₹0.85 + ₹0.15 GST), ₹12 every year after (₹10.17 + ₹1.83 GST).
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
  /** The price on the card already includes the GST; nothing is added on top. */
  gst_included?: boolean;
};

/** The platform fee rate for a flow: 0 for every flow (no platform fee is charged). */
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

/** A price that already includes GST: the GST is the part of it, not added to it. No fee. */
export function gstIncludedBreakup(total: number): PriceBreakup {
  const gst = Math.round((total * GST_RATE_PERCENT) / (100 + GST_RATE_PERCENT));
  return { base: total - gst, gst, platform_fee: 0, total, gst_rate: GST_RATE_PERCENT, platform_fee_rate: 0, gst_included: true };
}

/** The breakup of one fixed-price flow, with that flow's fee rate. */
export function flowBreakup(flow: string, base: number = AMOUNTS[flow]): PriceBreakup {
  return GST_INCLUDED_FLOWS.has(flow) ? gstIncludedBreakup(base) : priceBreakup(base, feeRateFor(flow));
}

/** A host's yearly plan base: ₹499 for homestays and drivers, ₹99 for cafes, shops and guides. */
export function hostPlanBase(businessType: string | null | undefined): number {
  return businessType && SMALL_HOST_TYPES.has(businessType) ? SMALL_HOST_PLAN_BASE : AMOUNTS.provider_registration;
}

/** What this host pays for a year (first year or renewal: the same price). */
export function hostPlanBreakup(businessType: string | null | undefined, flow: 'provider_registration' | 'provider_renewal' = 'provider_registration'): PriceBreakup {
  return flowBreakup(flow, hostPlanBase(businessType));
}

/**
 * The aangan pass costs ₹1 the first time and ₹12 every year after, GST included. Anyone who has held a pass
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
    // provider_registration / provider_renewal above are the ₹499 plan (homestays and drivers);
    // this is the ₹99 one for cafes, shops and guides.
    host_plan_small: flowBreakup('provider_registration', SMALL_HOST_PLAN_BASE),
  };
}
