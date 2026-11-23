import { describe, it, expect } from 'vitest';
import { breakupOf, gstIncludedOf, hostPlanFlow, isSmallHostType, isFreeHostType, rupees } from './prices';

describe('price breakup (same rule as backend/src/lib/pricing.ts)', () => {
  it('adds 18% GST, and no platform fee, to a host plan', () => {
    expect(breakupOf(49900)).toMatchObject({ gst: 8982, platform_fee: 0, total: 58882 });
  });

  it('charges ₹99 + GST (₹116.82) for cafes, ₹499 (₹588.82) for homestays, drivers and guides; shops list free', () => {
    expect(breakupOf(9900).total).toBe(11682);
    expect(hostPlanFlow('cafe')).toBe('host_plan_small');
    expect(isFreeHostType('shop')).toBe(true);
    for (const type of ['homestay', 'driver', 'guide', undefined]) expect(hostPlanFlow(type)).toBe('provider_registration');
    expect(isSmallHostType('homestay')).toBe(false);
  });

  it('keeps the pass at exactly ₹1 and ₹12: GST is inside the price, no fee', () => {
    expect(gstIncludedOf(100)).toEqual({ base: 85, gst: 15, platform_fee: 0, total: 100, gst_rate: 18, platform_fee_rate: 0, gst_included: true });
    expect(gstIncludedOf(1200)).toMatchObject({ base: 1017, gst: 183, total: 1200 });
  });

  it('adds GST (no platform fee) to the ₹1 booking fee: ₹1.18', () => {
    expect(breakupOf(100)).toMatchObject({ gst: 18, platform_fee: 0, total: 118 });
  });

  it('writes paise as rupees, with paise only when there are some', () => {
    expect(rupees(58882)).toBe('₹588.82');
    expect(rupees(49900)).toBe('₹499');
    expect(rupees(119880)).toBe('₹1,198.80');
    expect(rupees(118)).toBe('₹1.18');
  });
});
