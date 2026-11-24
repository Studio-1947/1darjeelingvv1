import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { isValidGstin, normaliseGstin, parseGstInput } from '../src/lib/gstin';
import { onboardActiveProvider } from './helpers';

const VALID = '27AAPFU0939F1ZV';
const VALID_WB = '19ABCDE1234F1ZX';

describe('GSTIN check', () => {
  it('accepts a real-shaped GSTIN with the right check character', () => {
    expect(isValidGstin(VALID)).toBe(true);
    expect(isValidGstin(VALID_WB)).toBe(true);
  });

  it('accepts lower case and spaces, and stores it upper case without them', () => {
    expect(isValidGstin(' 27aapfu0939f1zv ')).toBe(true);
    expect(normaliseGstin('27 aapfu-0939f1zv')).toBe(VALID);
  });

  it('refuses a wrong check character, a bad shape or an unknown state', () => {
    expect(isValidGstin('27AAPFU0939F1ZA')).toBe(false);
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false);
    expect(isValidGstin('ABCDEFGHIJKLMNO')).toBe(false);
    expect(isValidGstin('')).toBe(false);
    expect(isValidGstin(null)).toBe(false);
  });

  it('reads the body: absent keeps, null clears, a value needs the legal name', () => {
    expect(parseGstInput(undefined)).toEqual({ value: undefined });
    expect(parseGstInput(null)).toEqual({ value: null });
    expect(parseGstInput({ gstin: VALID, legal_name: '  Hill  View Stays ' })).toEqual({
      value: { gstin: VALID, legal_name: 'Hill View Stays', state_code: '27' },
    });
    expect(parseGstInput({ gstin: VALID, legal_name: '' })).toHaveProperty('error');
    expect(parseGstInput({ gstin: 'nope', legal_name: 'Hill View' })).toHaveProperty('error');
  });
});

async function renewalOrder(token: string, providerId: string, extra: Record<string, unknown> = {}) {
  // Lapse the plan so renewal is open.
  await db.update(schema.providers)
    .set({ planExpiresAt: new Date(Date.now() - 86_400_000).toISOString() })
    .where(eq(schema.providers.id, providerId));
  return request(app).post('/api/payments/order').set('Authorization', `Bearer ${token}`)
    .send({ flow: 'provider_renewal', reference_id: providerId, ...extra });
}

const providerMe = async (token: string) =>
  (await request(app).get('/api/providers/me').set('Authorization', `Bearer ${token}`)).body.provider;

const paymentFor = async (orderId: string) =>
  (await db.select().from(schema.payments).where(eq(schema.payments.orderId, orderId)).limit(1))[0];

describe('host plan invoiced to a GSTIN', () => {
  it('saves the GSTIN on the business and records it on the payment', async () => {
    const { token } = await onboardActiveProvider({ name: 'GST Host' });
    const p = await providerMe(token);
    expect(p.gstin).toBeNull();

    const res = await renewalOrder(token, p.id, { gst: { gstin: VALID_WB.toLowerCase(), legal_name: 'Hill View Stays LLP' } });
    expect(res.status).toBe(200);
    expect(res.body.billing).toEqual({ gstin: VALID_WB, legal_name: 'Hill View Stays LLP', state_code: '19' });
    expect((await paymentFor(res.body.order.id)).billing).toEqual(res.body.billing);

    const after = await providerMe(token);
    expect(after.gstin).toBe(VALID_WB);
    expect(after.gst_legal_name).toBe('Hill View Stays LLP');
  });

  it('uses the saved GSTIN when the next order says nothing, and clears it on null', async () => {
    const { token } = await onboardActiveProvider({ name: 'GST Host 2' });
    const p = await providerMe(token);
    await renewalOrder(token, p.id, { gst: { gstin: VALID, legal_name: 'Pine Cabs' } });

    // Same order reused (same price, still open): it now carries no billing once cleared.
    const cleared = await renewalOrder(token, p.id, { gst: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.billing).toBeNull();
    expect((await paymentFor(cleared.body.order.id)).billing).toBeNull();
    expect((await providerMe(token)).gstin).toBeNull();

    await renewalOrder(token, p.id, { gst: { gstin: VALID, legal_name: 'Pine Cabs' } });
    const kept = await renewalOrder(token, p.id);
    expect(kept.body.billing).toMatchObject({ gstin: VALID, legal_name: 'Pine Cabs' });
  });

  it('refuses an invalid GSTIN and saves nothing', async () => {
    const { token } = await onboardActiveProvider({ name: 'GST Host 3' });
    const p = await providerMe(token);
    const res = await renewalOrder(token, p.id, { gst: { gstin: '27AAPFU0939F1ZA', legal_name: 'Pine Cabs' } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('invalid_gstin');
    expect((await providerMe(token)).gstin).toBeNull();
  });

  it('never attaches a GSTIN to a traveller payment', async () => {
    const { token } = await onboardActiveProvider({ name: 'GST Host 4' });
    const p = await providerMe(token);
    await renewalOrder(token, p.id, { gst: { gstin: VALID, legal_name: 'Pine Cabs' } });
    const pass = await request(app).post('/api/payments/order').set('Authorization', `Bearer ${token}`)
      .send({ flow: 'platform_support', reference_id: p.user_id, gst: { gstin: VALID, legal_name: 'Pine Cabs' } });
    expect(pass.status).toBe(200);
    expect(pass.body.billing).toBeNull();
  });
});
