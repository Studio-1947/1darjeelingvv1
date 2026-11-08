import { useEffect, useState } from 'react';
import api from '@/lib/api';

/**
 * What each payment costs, in paise (pricing cards, 2026-11-08):
 *   - Host plan, every year: ₹499 for homestays and drivers, ₹99 for cafes, shops and guides,
 *     each + 18% GST + the 2% payment gateway fee (₹598.80 / ₹118.80).
 *   - aangan pass: ₹1 for the first year, then ₹12 a year. GST is already in that price and there
 *     is no fee, so the traveller pays exactly ₹1 or ₹12.
 *   - Booking fee (no pass): ₹1 + GST + fee (₹1.20).
 *
 * The server owns the numbers (GET /payments/prices, backend/src/lib/pricing.ts); the fallback below
 * is the same rule, so the breakup still shows if that call fails. The app has the same file
 * (src/lib/prices.ts).
 */
export type PriceBreakup = {
  base: number;
  gst: number;
  platform_fee: number;
  total: number;
  gst_rate: number;
  platform_fee_rate: number;
  /** The price already includes the GST: nothing is added on top (the pass). */
  gst_included?: boolean;
};
export type PricedFlow =
  | 'provider_registration'
  | 'provider_renewal'
  | 'host_plan_small'
  | 'platform_support'
  | 'platform_support_renewal'
  | 'booking_commission';

const BASES: Record<PricedFlow, number> = {
  provider_registration: 49900,
  provider_renewal: 49900,
  host_plan_small: 9900,
  platform_support: 100,
  platform_support_renewal: 1200,
  booking_commission: 100,
};

/** Prices that already include GST and carry no fee. */
const GST_INCLUDED: PricedFlow[] = ['platform_support', 'platform_support_renewal'];

/** Cafes, shops and guides pay the ₹99 plan; homestays and drivers the ₹499 one. */
const SMALL_HOST_TYPES = ['cafe', 'shop', 'guide'];
export const isSmallHostType = (type?: string | null) => !!type && SMALL_HOST_TYPES.includes(type);
export const hostPlanFlow = (type?: string | null): PricedFlow => (isSmallHostType(type) ? 'host_plan_small' : 'provider_registration');

export function breakupOf(base: number, gstRate = 18, feeRate = 2): PriceBreakup {
  const gst = Math.round((base * gstRate) / 100);
  const fee = Math.round((base * feeRate) / 100);
  return { base, gst, platform_fee: fee, total: base + gst + fee, gst_rate: gstRate, platform_fee_rate: feeRate };
}

/** A price with the GST inside it: ₹1 is ₹0.85 + ₹0.15 GST. */
export function gstIncludedOf(total: number, gstRate = 18): PriceBreakup {
  const gst = Math.round((total * gstRate) / (100 + gstRate));
  return { base: total - gst, gst, platform_fee: 0, total, gst_rate: gstRate, platform_fee_rate: 0, gst_included: true };
}

const FALLBACK = Object.fromEntries(
  (Object.entries(BASES) as [PricedFlow, number][]).map(([k, v]) => [k, GST_INCLUDED.includes(k) ? gstIncludedOf(v) : breakupOf(v)]),
) as Record<PricedFlow, PriceBreakup>;

let cache: Record<PricedFlow, PriceBreakup> | null = null;
let pending: Promise<Record<PricedFlow, PriceBreakup>> | null = null;

function loadPrices() {
  if (cache) return Promise.resolve(cache);
  pending ??= api.get('/payments/prices')
    .then(({ data }) => (cache = { ...FALLBACK, ...(data?.prices || {}) }))
    .catch(() => FALLBACK)
    .finally(() => { pending = null; });
  return pending;
}

/** The breakup of one payment, from the server once loaded. */
export function usePrice(flow: PricedFlow): PriceBreakup {
  const [prices, setPrices] = useState(cache || FALLBACK);
  useEffect(() => {
    let live = true;
    loadPrices().then((p) => { if (live) setPrices(p); });
    return () => { live = false; };
  }, []);
  return prices[flow];
}

/** A host's yearly plan, by business type. The first year and each renewal cost the same. */
export function useHostPlanPrice(type?: string | null): PriceBreakup {
  const full = usePrice('provider_registration');
  const small = usePrice('host_plan_small');
  return isSmallHostType(type) ? small : full;
}

/**
 * The pass this person would buy: ₹1 if they have never held one, ₹12 if they have (the server
 * makes the same choice when it creates the order).
 */
export function usePassPrice(user: { supportExpiresAt?: string | null } | null | undefined): PriceBreakup {
  const first = usePrice('platform_support');
  const renewal = usePrice('platform_support_renewal');
  return user?.supportExpiresAt ? renewal : first;
}

/** 59880 → "₹598.80", 49900 → "₹499". */
export function rupees(paise: number): string {
  const whole = paise % 100 === 0;
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}
