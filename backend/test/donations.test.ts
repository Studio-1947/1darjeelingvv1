import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, createListing } from './helpers';
import { DONATION_MIN_PAISE, DONATION_MAX_PAISE } from '../src/config';

async function order(token: string, body: any) {
  return request(app)
    .post('/api/payments/order')
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

async function me(token: string) {
  const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  return res.body.user;
}

describe('donation orders', () => {
  it('creates an order for the amount the donor chose', async () => {
    const { token, user } = await registerUser({ name: 'Generous Gita' });
    const res = await order(token, { flow: 'donation', reference_id: user.id, amount: 50000 });

    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(50000);
    expect(res.body.order.amount).toBe(50000);
  });

  it('accepts both boundary amounts exactly', async () => {
    const { token, user } = await registerUser({ name: 'Boundary Bina' });

    const low = await order(token, { flow: 'donation', reference_id: user.id, amount: DONATION_MIN_PAISE });
    expect(low.status).toBe(200);
    expect(low.body.amount).toBe(DONATION_MIN_PAISE);

    const high = await order(token, { flow: 'donation', reference_id: user.id, amount: DONATION_MAX_PAISE });
    expect(high.status).toBe(200);
    expect(high.body.amount).toBe(DONATION_MAX_PAISE);
  });

  it('rejects amounts outside the permitted range', async () => {
    const { token, user } = await registerUser({ name: 'Outside Om' });

    const tooLow = await order(token, { flow: 'donation', reference_id: user.id, amount: DONATION_MIN_PAISE - 1 });
    expect(tooLow.status).toBe(400);

    const tooHigh = await order(token, { flow: 'donation', reference_id: user.id, amount: DONATION_MAX_PAISE + 1 });
    expect(tooHigh.status).toBe(400);
  });

  it('rejects a missing, fractional, or string amount', async () => {
    const { token, user } = await registerUser({ name: 'Malformed Mira' });

    expect((await order(token, { flow: 'donation', reference_id: user.id })).status).toBe(400);
    expect((await order(token, { flow: 'donation', reference_id: user.id, amount: 1050.5 })).status).toBe(400);
    expect((await order(token, { flow: 'donation', reference_id: user.id, amount: '5000' })).status).toBe(400);
    expect((await order(token, { flow: 'donation', reference_id: user.id, amount: -5000 })).status).toBe(400);
  });

  it('refuses a donation attributed to another user', async () => {
    const { token } = await registerUser({ name: 'Donor Dev' });
    const { user: other } = await registerUser({ name: 'Other Otto' });

    const res = await order(token, { flow: 'donation', reference_id: other.id, amount: 50000 });
    expect(res.status).toBe(403);
  });
});

describe('donation settlement', () => {
  async function donate(token: string, userId: string, amount: number) {
    const orderRes = await order(token, { flow: 'donation', reference_id: userId, amount });
    const orderId = orderRes.body.order.id as string;
    const completeRes = await request(app)
      .post('/api/payments/mock/complete')
      .set('Authorization', `Bearer ${token}`)
      .send({ order_id: orderId, flow: 'donation', reference_id: userId });
    return { orderId, completeRes };
  }

  it('settles and reports the amount back for the thank-you screen', async () => {
    const { token, user } = await registerUser({ name: 'Settler Sam' });
    const { completeRes } = await donate(token, user.id, 25000);

    expect(completeRes.status).toBe(200);
    expect(completeRes.body.record.amount).toBe(25000);
  });

  it('grants nothing — a donation must never buy access', async () => {
    // The property that matters most about this flow. Donating cannot extend support, activate a
    // provider, or confirm a booking; if it ever could, "donate" becomes a discount code.
    const { token, user } = await registerUser({ name: 'Nothing Nita', paySupport: false });
    const before = await me(token);
    expect(before.supportExpiresAt).toBeNull();

    await donate(token, user.id, DONATION_MAX_PAISE);

    const after = await me(token);
    expect(after.supportExpiresAt).toBeNull();
    expect(after.providerPaid).toBe(false);
    expect(after.role).toBe('tourist');
  });

  it('does not lift the support gate', async () => {
    // Same property, observed from the outside: a donor who has not paid the ₹12 is still gated.
    const { token, user } = await registerUser({ name: 'Gated Gopal', paySupport: false });
    const listing = await createListing();

    await donate(token, user.id, 100000);

    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('support_required');
  });

  it('reports the STORED amount, not one supplied at settlement time', async () => {
    // A receipt is only worth anything if the figure comes from the order, not the claim.
    const { token, user } = await registerUser({ name: 'Liar Lakshmi' });
    const orderRes = await order(token, { flow: 'donation', reference_id: user.id, amount: 10000 });
    const orderId = orderRes.body.order.id as string;

    const completeRes = await request(app)
      .post('/api/payments/mock/complete')
      .set('Authorization', `Bearer ${token}`)
      .send({ order_id: orderId, flow: 'donation', reference_id: user.id, amount: 9999999 });

    expect(completeRes.body.record.amount).toBe(10000);
  });

  it('is idempotent when the same order settles twice', async () => {
    const { token, user } = await registerUser({ name: 'Twice Tara' });
    const { orderId } = await donate(token, user.id, 30000);

    const replay = await request(app)
      .post('/api/payments/mock/complete')
      .set('Authorization', `Bearer ${token}`)
      .send({ order_id: orderId, flow: 'donation', reference_id: user.id });

    expect(replay.status).toBe(200);
    expect(replay.body.already).toBe(true);
  });
});

describe('fixed-price flows are unaffected by the amount field', () => {
  it('still charges the map price when an amount is supplied', async () => {
    const { token, user } = await registerUser({ name: 'Sneaky Sunil', paySupport: false });

    const res = await order(token, { flow: 'platform_support', reference_id: user.id, amount: 1 });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(1200);
  });
});
