import { describe, it, expect } from 'vitest';
import { advanceOf, advancePolicyOf, upiPayLink } from './advance';

describe('the homestay advance', () => {
  it('reads the host policy from the listing, or none', () => {
    expect(advancePolicyOf({ advance: { percent: 10, refund_days: 7 } })).toEqual({ percent: 10, refund_days: 7 });
    expect(advancePolicyOf({ advance: { percent: 15, refund_days: null } })).toEqual({ percent: 15, refund_days: null });
    expect(advancePolicyOf({ advance: null })).toBeNull();
    expect(advancePolicyOf({ advance: { percent: 30 } })).toBeNull();
    expect(advancePolicyOf(undefined)).toBeNull();
  });

  it('works the amount out the way the server does', () => {
    expect(advanceOf(4000, 10)).toBe(400);
    expect(advanceOf(4499, 10)).toBe(450);
  });

  it('builds a UPI link with only the host, the amount and the booking', () => {
    const link = upiPayLink('host@okaxis', 'Hill House', 400, 'abcdef12-3456');
    expect(link.startsWith('upi://pay?')).toBe(true);
    const q = new URLSearchParams(link.slice('upi://pay?'.length));
    expect(q.get('pa')).toBe('host@okaxis');
    expect(q.get('am')).toBe('400');
    expect(q.get('cu')).toBe('INR');
    expect(q.get('tn')).toBe('aangan advance abcdef12');
  });
});
