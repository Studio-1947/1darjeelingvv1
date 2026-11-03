import { useEffect, useState } from 'react';
import api from '@/lib/api';

/**
 * What each payment costs: base + 18% GST + 2% platform fee (both on the base), in paise. The
 * server owns the numbers (GET /payments/prices, backend/src/lib/pricing.ts); the fallback below
 * is the same rule, so the breakup still shows if that call fails. The app has the same file
 * (src/lib/prices.ts).
 */
export type PriceBreakup = { base: number; gst: number; platform_fee: number; total: number; gst_rate: number; platform_fee_rate: number };
export type PricedFlow = 'provider_registration' | 'provider_renewal' | 'platform_support' | 'booking_commission';

const BASES: Record<PricedFlow, number> = {
  provider_registration: 49900,
  provider_renewal: 99900,
  platform_support: 1200,
  booking_commission: 100,
};

export function breakupOf(base: number, gstRate = 18, feeRate = 2): PriceBreakup {
  const gst = Math.round((base * gstRate) / 100);
  const fee = Math.round((base * feeRate) / 100);
  return { base, gst, platform_fee: fee, total: base + gst + fee, gst_rate: gstRate, platform_fee_rate: feeRate };
}

const FALLBACK = Object.fromEntries(Object.entries(BASES).map(([k, v]) => [k, breakupOf(v)])) as Record<PricedFlow, PriceBreakup>;

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

/** 59880 → "₹598.80", 49900 → "₹499". */
export function rupees(paise: number): string {
  const whole = paise % 100 === 0;
  return `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}
