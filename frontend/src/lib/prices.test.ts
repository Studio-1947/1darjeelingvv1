import { describe, it, expect } from 'vitest';
import { breakupOf, gstIncludedOf, hostPlanFlow, isSmallHostType, rupees } from './prices';

describe('price breakup (same rule as backend/src/lib/pricing.ts)', () => {
  it('adds 18% GST and the 2% gateway fee to a host plan', () => {
    expect(breakupOf(49900)).toMatchObject({ gst: 8982, platform_fee: 998, total: 59880 });
  });

  it('charges ₹99 + GST + fee (₹118.80) for cafes, shops and guides, ₹499 (₹598.80) for homestays and drivers', () => {
    expect(breakupOf(9900).total).toBe(11880);
    for (const type of ['cafe', 'shop', 'guide']) expect(hostPlanFlow(type)).toBe('host_plan_small');
    for (const type of ['homestay', 'driver', undefined]) expect(hostPlanFlow(type)).toBe('provider_registration');
    expect(isSmallHostType('homestay')).toBe(false);
  });

  it('keeps the pass at exactly ₹1 and ₹12: GST is inside the price, no fee', () => {
    expect(gstIncludedOf(100)).toEqual({ base: 85, gst: 15, platform_fee: 0, total: 100, gst_rate: 18, platform_fee_rate: 0, gst_included: true });
    expect(gstIncludedOf(1200)).toMatchObject({ base: 1017, gst: 183, total: 1200 });
  });

  it('adds GST and the 2% platform fee to the ₹1 booking fee: ₹1.20', () => {
    expect(breakupOf(100)).toMatchObject({ gst: 18, platform_fee: 2, total: 120 });
  });

  it('writes paise as rupees, with paise only when there are some', () => {
    expect(rupees(59880)).toBe('₹598.80');
    expect(rupees(49900)).toBe('₹499');
    expect(rupees(119880)).toBe('₹1,198.80');
    expect(rupees(120)).toBe('₹1.20');
  });
});
