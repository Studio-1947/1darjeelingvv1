import { describe, it, expect } from 'vitest';
import { breakupOf, rupees } from './prices';

describe('price breakup (same rule as backend/src/lib/pricing.ts)', () => {
  it('adds 18% GST and the 2% platform fee to the base', () => {
    expect(breakupOf(49900)).toMatchObject({ gst: 8982, platform_fee: 998, total: 59880 });
    expect(breakupOf(1200).total).toBe(1440);
    expect(breakupOf(100).total).toBe(120);
  });

  it('writes paise as rupees, with paise only when there are some', () => {
    expect(rupees(59880)).toBe('₹598.80');
    expect(rupees(49900)).toBe('₹499');
    expect(rupees(119880)).toBe('₹1,198.80');
    expect(rupees(120)).toBe('₹1.20');
  });
});
