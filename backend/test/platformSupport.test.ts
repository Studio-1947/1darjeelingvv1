import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { nextPhone, registerUser } from './helpers';

describe('support column', () => {
  // Registers through the raw endpoint rather than the registerUser helper on purpose: a later
  // task makes that helper pay the fee by default, and this test must keep describing a user
  // who has never paid.
  it('starts a newly registered tourist with no support expiry', async () => {
    const phone = nextPhone();
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone, otp: '123456', name: 'Fresh Tourist' });

    expect(res.status).toBe(200);
    expect(res.body.user.supportExpiresAt).toBeNull();
  });
});

const DAY_MS = 24 * 60 * 60 * 1000;

async function paySupport(token: string, userId: string) {
  const orderRes = await request(app)
    .post('/api/payments/order')
    .set('Authorization', `Bearer ${token}`)
    .send({ flow: 'platform_support', reference_id: userId });
  expect(orderRes.status).toBe(200);

  const orderId = orderRes.body.order.id as string;
  const completeRes = await request(app)
    .post('/api/payments/mock/complete')
    .set('Authorization', `Bearer ${token}`)
    .send({ order_id: orderId, flow: 'platform_support', reference_id: userId });

  return { orderId, orderRes, completeRes };
}

async function me(token: string) {
  const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  return res.body.user;
}

describe('platform_support payment flow', () => {
  it('charges 1200 paise regardless of anything in the request body', async () => {
    const { token, user } = await registerUser({ name: 'Support Payer', paySupport: false });
    const res = await request(app)
      .post('/api/payments/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ flow: 'platform_support', reference_id: user.id, amount: 1 });

    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(1200);
    expect(res.body.order.amount).toBe(1200);
  });

  it('refuses an order that references another user', async () => {
    const { token } = await registerUser({ name: 'Attacker', paySupport: false });
    const { user: victim } = await registerUser({ name: 'Victim', paySupport: false });

    const res = await request(app)
      .post('/api/payments/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ flow: 'platform_support', reference_id: victim.id });

    expect(res.status).toBe(403);
  });

  it('stamps an expiry 365 days out when settled', async () => {
    const { token, user } = await registerUser({ name: 'First Timer', paySupport: false });
    const before = Date.now();

    const { completeRes } = await paySupport(token, user.id);
    expect(completeRes.status).toBe(200);

    const expiry = Date.parse((await me(token)).supportExpiresAt);
    expect(expiry - before).toBeGreaterThan(364 * DAY_MS);
    expect(expiry - before).toBeLessThan(366 * DAY_MS);
  });

  it('extends the existing window when paid a second time', async () => {
    const { token, user } = await registerUser({ name: 'Renewer', paySupport: false });

    await paySupport(token, user.id);
    const first = Date.parse((await me(token)).supportExpiresAt);

    await paySupport(token, user.id);
    const second = Date.parse((await me(token)).supportExpiresAt);

    expect(second - first).toBeGreaterThan(364 * DAY_MS);
    expect(second - first).toBeLessThan(366 * DAY_MS);
  });

  it('does not extend the window when the same order settles twice', async () => {
    const { token, user } = await registerUser({ name: 'Double Settler', paySupport: false });
    const { orderId } = await paySupport(token, user.id);
    const afterFirst = (await me(token)).supportExpiresAt;

    const replay = await request(app)
      .post('/api/payments/mock/complete')
      .set('Authorization', `Bearer ${token}`)
      .send({ order_id: orderId, flow: 'platform_support', reference_id: user.id });

    expect(replay.status).toBe(200);
    expect(replay.body.already).toBe(true);
    expect((await me(token)).supportExpiresAt).toBe(afterFirst);
  });
});
