import { describe, it, expect } from 'vitest';
import { breakupOf, rupees } from './prices';

describe('price breakup (same rule as backend/src/lib/pricing.ts)', () => {
  it('adds 18% GST and the 2% gateway fee to a host plan', () => {
    expect(breakupOf(49900)).toMatchObject({ gst: 8982, platform_fee: 998, total: 59880 });
  });

  it('adds GST only on traveller payments: ₹14.16 first pass, ₹116.82 after, ₹1.18 booking fee', () => {
    expect(breakupOf(1200, 18, 0).total).toBe(1416);
    expect(breakupOf(9900, 18, 0).total).toBe(11682);
    expect(breakupOf(100, 18, 0).total).toBe(118);
  });

  it('writes paise as rupees, with paise only when there are some', () => {
    expect(rupees(59880)).toBe('₹598.80');
    expect(rupees(49900)).toBe('₹499');
    expect(rupees(119880)).toBe('₹1,198.80');
    expect(rupees(120)).toBe('₹1.20');
  });
});
