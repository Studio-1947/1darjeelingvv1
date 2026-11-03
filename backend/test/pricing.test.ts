import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { priceBreakup, flowBreakup, passBreakupFor } from '../src/lib/pricing';

/** Every fixed payment is base + 18% GST; host payments also carry the 2% gateway fee. */
describe('price breakup', () => {
  it('adds GST and the platform fee to the host plan', () => {
    expect(priceBreakup(49900)).toEqual({ base: 49900, gst: 8982, platform_fee: 998, total: 59880, gst_rate: 18, platform_fee_rate: 2 });
    expect(priceBreakup(99900).total).toBe(119880);
  });

  it('adds GST only to the traveller pass and the ₹1 booking fee', () => {
    expect(flowBreakup('platform_support')).toMatchObject({ base: 1200, gst: 216, platform_fee: 0, total: 1416 });
    expect(flowBreakup('booking_commission')).toMatchObject({ gst: 18, platform_fee: 0, total: 118 });
    expect(flowBreakup('provider_registration').total).toBe(59880);
  });

  it('charges ₹12 for a first pass and ₹99 after that', () => {
    expect(passBreakupFor({ supportExpiresAt: null }).total).toBe(1416);
    expect(passBreakupFor({ supportExpiresAt: '2020-01-01T00:00:00.000Z' })).toMatchObject({ base: 9900, total: 11682 });
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
    expect(res.body.prices.platform_support.total).toBe(1416);
    expect(res.body.prices.platform_support_renewal.total).toBe(11682);
    expect(res.body.prices.booking_commission.total).toBe(118);
  });
});
