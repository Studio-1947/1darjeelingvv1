import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { priceBreakup, flowBreakup, passBreakupFor, hostPlanBreakup, gstIncludedBreakup } from '../src/lib/pricing';

/**
 * Host plans and the booking fee are base + 18% GST + the 2% gateway fee. The aangan pass already
 * includes GST: the traveller pays exactly ₹1, then ₹12 (pricing cards, 2026-11-08).
 */
describe('price breakup', () => {
  it('adds GST and the platform fee to the host plan', () => {
    expect(priceBreakup(49900)).toEqual({ base: 49900, gst: 8982, platform_fee: 998, total: 59880, gst_rate: 18, platform_fee_rate: 2 });
    expect(priceBreakup(9900).total).toBe(11880);
  });

  it('adds GST and the 2% platform fee to the booking fee and both host plans', () => {
    expect(flowBreakup('booking_commission')).toMatchObject({ gst: 18, platform_fee: 2, total: 120 });
    expect(flowBreakup('provider_registration').total).toBe(59880);
    expect(flowBreakup('provider_renewal').total).toBe(59880);
  });

  it('charges ₹499 a year for homestays and drivers, ₹99 for cafes, shops and guides, every year', () => {
    for (const type of ['homestay', 'driver']) {
      expect(hostPlanBreakup(type)).toMatchObject({ base: 49900, total: 59880 });
      expect(hostPlanBreakup(type, 'provider_renewal').total).toBe(59880);
    }
    for (const type of ['cafe', 'shop', 'guide']) {
      expect(hostPlanBreakup(type)).toMatchObject({ base: 9900, gst: 1782, platform_fee: 198, total: 11880 });
      expect(hostPlanBreakup(type, 'provider_renewal').total).toBe(11880);
    }
  });

  it('charges exactly ₹1 for a first pass and ₹12 after that, GST included, no fee', () => {
    expect(passBreakupFor({ supportExpiresAt: null })).toEqual({ base: 85, gst: 15, platform_fee: 0, total: 100, gst_rate: 18, platform_fee_rate: 0, gst_included: true });
    expect(passBreakupFor({ supportExpiresAt: '2020-01-01T00:00:00.000Z' })).toMatchObject({ base: 1017, gst: 183, platform_fee: 0, total: 1200 });
    for (const total of [1, 100, 1200, 9999]) {
      const b = gstIncludedBreakup(total);
      expect(b.base + b.gst).toBe(total);
    }
  });

  it('adds up exactly, in whole paise', () => {
    for (const base of [1, 99, 100, 333, 1200, 49900, 99900, 123457]) {
      const b = priceBreakup(base);
      expect(Number.isInteger(b.gst) && Number.isInteger(b.platform_fee)).toBe(true);
      expect(b.total).toBe(b.base + b.gst + b.platform_fee);
    }
  });

  it('is public, for showing the breakup before paying', async () => {
    const res = await request(app).get('/api/payments/prices');
    expect(res.status).toBe(200);
    expect(res.body.gst_rate).toBe(18);
    expect(res.body.platform_fee_rate).toBe(2);
    expect(res.body.prices.provider_registration.total).toBe(59880);
    expect(res.body.prices.provider_renewal.total).toBe(59880);
    expect(res.body.prices.host_plan_small.total).toBe(11880);
    expect(res.body.prices.platform_support.total).toBe(100);
    expect(res.body.prices.platform_support_renewal.total).toBe(1200);
    expect(res.body.prices.booking_commission.total).toBe(120);
  });
});
