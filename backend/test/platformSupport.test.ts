import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { nextPhone, registerUser, createListing, onboardActiveProvider } from './helpers';
import { SUPPORT_PASS_DAYS } from '../src/config';

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
  it('charges exactly ₹1 (GST included) for a first pass, regardless of anything in the request body', async () => {
    const { token, user } = await registerUser({ name: 'Support Payer', paySupport: false });
    const res = await request(app)
      .post('/api/payments/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ flow: 'platform_support', reference_id: user.id, amount: 1 });

    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(100);
    expect(res.body.order.amount).toBe(100);
    expect(res.body.breakup).toMatchObject({ total: 100, platform_fee: 0, gst_included: true });
  });

  it('charges exactly ₹1 (GST included) again once a pass has been held before', async () => {
    const { token, user } = await registerUser({ name: 'Returning Rinzing', paySupport: false });
    await paySupport(token, user.id);
    const res = await request(app)
      .post('/api/payments/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ flow: 'platform_support', reference_id: user.id });
    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(100);
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

  it('grants the pass for one year when settled', async () => {
    const { token, user } = await registerUser({ name: 'First Timer', paySupport: false });

    const { completeRes } = await paySupport(token, user.id);
    expect(completeRes.status).toBe(200);

    const expiry = Date.parse((await me(token)).supportExpiresAt);
    expect(expiry - Date.now()).toBeGreaterThan((SUPPORT_PASS_DAYS - 1) * DAY_MS);
    expect(expiry - Date.now()).toBeLessThanOrEqual(SUPPORT_PASS_DAYS * DAY_MS);
  });

  it('extends time a user already had when settled early', async () => {
    const { token, user } = await registerUser({ name: 'Upgrader', paySupport: false });
    await db.update(schema.users)
      .set({ supportExpiresAt: new Date(Date.now() + 30 * DAY_MS).toISOString() })
      .where(eq(schema.users.id, user.id));

    const before = (await me(token)).supportExpiresAt;
    await paySupport(token, user.id);
    const after = (await me(token)).supportExpiresAt;

    expect(Date.parse(after) - Date.parse(before)).toBeCloseTo(SUPPORT_PASS_DAYS * DAY_MS, -4);
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
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id, rating: 5, comment: 'Lovely quiet place' });

    expect(res.status).toBe(402);
  });

  it('saves a place without the pass (saving is free)', async () => {
    const { token } = await registerUser({ name: 'Free Saver', paySupport: false });
    const listing = await createListing();
    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id });
    expect(res.status).toBe(200);
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
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id, rating: 5, comment: 'Lovely quiet place' });

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
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id, rating: 5, comment: 'Lovely quiet place' });
    expect(blocked.status).toBe(402);

    const res = await request(app)
      .delete(`/api/favorites/${listing.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

describe('membership card and ending it', () => {
  it('shows a member since date, what was paid and a stable member ID', async () => {
    const { token, user } = await registerUser({ name: 'Card Holder', paySupport: false });
    const none = await request(app).get('/api/payments/membership').set('Authorization', `Bearer ${token}`);
    expect(none.status).toBe(200);
    expect(none.body).toMatchObject({ active: false, since: null, paid: null });

    const { completeRes } = await paySupport(token, user.id);
    expect(completeRes.status).toBe(200);
    const res = await request(app).get('/api/payments/membership').set('Authorization', `Bearer ${token}`);
    expect(res.body.active).toBe(true);
    expect(res.body.paid).toBe(100);
    expect(typeof res.body.since).toBe('string');
    expect(res.body.member_id).toMatch(/^AG-\d{2}-[0-9A-F]{5}$/);
    const again = await request(app).get('/api/payments/membership').set('Authorization', `Bearer ${token}`);
    expect(again.body.member_id).toBe(res.body.member_id);
  });

  it('ends the pass now, and the next pass is the same ₹1 a year', async () => {
    const { token, user } = await registerUser({ name: 'Leaver', paySupport: false });
    await paySupport(token, user.id);
    expect(Date.parse((await me(token)).supportExpiresAt)).toBeGreaterThan(Date.now());

    const end = await request(app).post('/api/payments/membership/end').set('Authorization', `Bearer ${token}`);
    expect(end.status).toBe(200);
    expect(Date.parse((await me(token)).supportExpiresAt)).toBeLessThanOrEqual(Date.now());
    const card = await request(app).get('/api/payments/membership').set('Authorization', `Bearer ${token}`);
    expect(card.body.active).toBe(false);

    const order = await request(app).post('/api/payments/order').set('Authorization', `Bearer ${token}`)
      .send({ flow: 'platform_support', reference_id: user.id });
    expect(order.body.amount).toBe(100);
  });

  it('needs a signed-in user', async () => {
    expect((await request(app).get('/api/payments/membership')).status).toBe(401);
    expect((await request(app).post('/api/payments/membership/end')).status).toBe(401);
  });
});
