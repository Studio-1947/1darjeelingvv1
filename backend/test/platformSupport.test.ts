import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { nextPhone, registerUser, createListing, onboardActiveProvider } from './helpers';
import { LIFETIME_SUPPORT_EXPIRY } from '../src/config';

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
  it('charges 100 paise (₹1) regardless of anything in the request body', async () => {
    const { token, user } = await registerUser({ name: 'Support Payer', paySupport: false });
    const res = await request(app)
      .post('/api/payments/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ flow: 'platform_support', reference_id: user.id, amount: 1 });

    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(100);
    expect(res.body.order.amount).toBe(100);
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

  it('grants the pass for life when settled', async () => {
    const { token, user } = await registerUser({ name: 'First Timer', paySupport: false });

    const { completeRes } = await paySupport(token, user.id);
    expect(completeRes.status).toBe(200);

    expect((await me(token)).supportExpiresAt).toBe(LIFETIME_SUPPORT_EXPIRY);
  });

  it('turns time a user already had (a referral reward, an old yearly pass) into a lifetime pass', async () => {
    const { token, user } = await registerUser({ name: 'Upgrader', paySupport: false });
    await db.update(schema.users)
      .set({ supportExpiresAt: new Date(Date.now() + 30 * DAY_MS).toISOString() })
      .where(eq(schema.users.id, user.id));

    await paySupport(token, user.id);

    expect((await me(token)).supportExpiresAt).toBe(LIFETIME_SUPPORT_EXPIRY);
  });

  it('does not change the expiry when the same order settles twice', async () => {
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

describe('support gate on tourist creates', () => {
  it('402s a tourist who has not paid', async () => {
    const { token } = await registerUser({ name: 'Unpaid Tourist', paySupport: false });
    const listing = await createListing();

    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('support_required');
  });

  it('lets a tourist through once the fee is paid', async () => {
    const { token, user } = await registerUser({ name: 'Paid Tourist', paySupport: false });
    const listing = await createListing();
    await paySupport(token, user.id);

    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id });

    expect(res.status).toBe(200);
  });

  it('402s a provider who has not paid the registration fee', async () => {
    // role is already 'provider' but providerPaid is false  the loophole the exemption
    // rule exists to close.
    const { token } = await registerUser({ name: 'Unpaid Provider', role: 'provider' });
    const listing = await createListing();

    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id });

    expect(res.status).toBe(402);
  });

  it('lets an active provider through without paying the support fee', async () => {
    const { token } = await onboardActiveProvider({ name: 'Paid Provider' });
    const listing = await createListing();

    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id });

    expect(res.status).toBe(200);
  });

  it('still lets a tourist whose window has lapsed remove their own data', async () => {
    // Withdrawal is deliberately not gated: trapping a lapsed user in a booking they cannot
    // cancel is worse for the provider than the cancellation would have been.
    const { token, user } = await registerUser({ name: 'Lapser' });
    const listing = await createListing();

    await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id });

    // Expire them. There is no API for this (a paid pass never lapses; only unpaid time such as
    // a referral reward does) so the test reaches into the DB directly.
    await db.update(schema.users)
      .set({ supportExpiresAt: new Date(Date.now() - DAY_MS).toISOString() })
      .where(eq(schema.users.id, user.id));

    // Confirm the lapse actually took effect, so a silent no-op cannot make this test vacuous.
    const blocked = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id });
    expect(blocked.status).toBe(402);

    const res = await request(app)
      .delete(`/api/favorites/${listing.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
