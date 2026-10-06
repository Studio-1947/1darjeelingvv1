import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { computeHostPlanExpiry, isHostPlanLapsed, isHostPlanLive } from '../src/lib/hostPlan';
import { onboardActiveProvider, registerUser } from './helpers';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('computeHostPlanExpiry', () => {
  const now = new Date('2026-07-22T00:00:00.000Z');

  it('grants 365 days from now for a first payment', () => {
    const result = computeHostPlanExpiry(null, now);
    expect(Date.parse(result) - now.getTime()).toBe(365 * DAY_MS);
  });

  it('extends an existing future window instead of restarting it', () => {
    const existing = new Date(now.getTime() + 100 * DAY_MS).toISOString();
    const result = computeHostPlanExpiry(existing, now);
    expect(Date.parse(result) - now.getTime()).toBe(465 * DAY_MS);
  });

  it('restarts from now when the existing window has already lapsed', () => {
    const existing = new Date(now.getTime() - 30 * DAY_MS).toISOString();
    const result = computeHostPlanExpiry(existing, now);
    expect(Date.parse(result) - now.getTime()).toBe(365 * DAY_MS);
  });

  it('never moves an expiry backwards', () => {
    const existing = new Date(now.getTime() + 500 * DAY_MS).toISOString();
    const result = computeHostPlanExpiry(existing, now);
    expect(Date.parse(result)).toBeGreaterThan(Date.parse(existing));
  });

  it('ignores an unparseable existing value and grants a full window', () => {
    const result = computeHostPlanExpiry('garbage', now);
    expect(Date.parse(result) - now.getTime()).toBe(365 * DAY_MS);
  });
});

describe('isHostPlanLapsed / isHostPlanLive', () => {
  const now = new Date('2026-07-22T00:00:00.000Z');
  const future = new Date(now.getTime() + DAY_MS).toISOString();
  const past = new Date(now.getTime() - DAY_MS).toISOString();

  it('is live while active and inside the year', () => {
    expect(isHostPlanLive({ status: 'active', planExpiresAt: future }, now)).toBe(true);
    expect(isHostPlanLapsed({ status: 'active', planExpiresAt: future }, now)).toBe(false);
  });

  it('is lapsed once the year has ended', () => {
    expect(isHostPlanLapsed({ status: 'active', planExpiresAt: past }, now)).toBe(true);
    expect(isHostPlanLive({ status: 'active', planExpiresAt: past }, now)).toBe(false);
  });

  it('is neither lapsed nor live before the first payment', () => {
    expect(isHostPlanLapsed({ status: 'pending_payment', planExpiresAt: null }, now)).toBe(false);
    expect(isHostPlanLive({ status: 'pending_payment', planExpiresAt: null }, now)).toBe(false);
  });

  it('is not live while suspended, whatever the date', () => {
    expect(isHostPlanLive({ status: 'suspended', planExpiresAt: future }, now)).toBe(false);
  });
});

async function pay(token: string, flow: string, referenceId: string) {
  const order = await request(app)
    .post('/api/payments/order')
    .set('Authorization', `Bearer ${token}`)
    .send({ flow, reference_id: referenceId });
  if (order.status !== 200) return { order, complete: null };
  const complete = await request(app)
    .post('/api/payments/mock/complete')
    .set('Authorization', `Bearer ${token}`)
    .send({ order_id: order.body.order.id, flow, reference_id: referenceId });
  return { order, complete };
}

async function providerMe(token: string) {
  const res = await request(app).get('/api/providers/me').set('Authorization', `Bearer ${token}`);
  return res.body.provider;
}

async function lapse(providerId: string) {
  await db.update(schema.providers)
    .set({ planExpiresAt: new Date(Date.now() - DAY_MS).toISOString() })
    .where(eq(schema.providers.id, providerId));
}

async function listingOf(providerId: string) {
  const [row] = await db.select().from(schema.listings).where(eq(schema.listings.providerId, providerId)).limit(1);
  return row;
}

describe('host plan: ₹1 first year, ₹499 after', () => {
  it('registers for ₹1 and starts a one-year plan', async () => {
    const before = Date.now();
    const { token } = await onboardActiveProvider({ name: 'New Host' });
    const provider = await providerMe(token);

    expect(provider.status).toBe('active');
    expect(provider.plan_active).toBe(true);
    const expiry = Date.parse(provider.plan_expires_at);
    expect(expiry - before).toBeGreaterThan(364 * DAY_MS);
    expect(expiry - before).toBeLessThan(366 * DAY_MS);

    const [payment] = await db.select().from(schema.payments)
      .where(eq(schema.payments.referenceId, provider.id)).limit(1);
    expect(payment.amount).toBe(100);
  });

  it('refuses a second ₹1 registration once registered, so a year cannot be bought for ₹1', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Repeat Registrant' });
    const { order } = await pay(token, 'provider_registration', providerId);

    expect(order.status).toBe(409);
    expect(order.body.detail).toMatch(/Renew/);
    // And no duplicate listing was created by a second activation.
    const rows = await db.select().from(schema.listings).where(eq(schema.listings.providerId, providerId));
    expect(rows).toHaveLength(1);
  });

  it('renews for ₹499 and adds a year on top of the current one', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Early Renewer' });
    const first = Date.parse((await providerMe(token)).plan_expires_at);

    const { order, complete } = await pay(token, 'provider_renewal', providerId);
    expect(order.status).toBe(200);
    expect(order.body.amount).toBe(49900);
    expect(complete!.status).toBe(200);

    const second = Date.parse((await providerMe(token)).plan_expires_at);
    expect(second - first).toBeGreaterThan(364 * DAY_MS);
    expect(second - first).toBeLessThan(366 * DAY_MS);
  });

  it('refuses a renewal before the host has registered', async () => {
    const { token, phone } = await registerUser({ name: 'Unregistered Host', role: 'provider' });
    const onboard = await request(app)
      .post('/api/providers/onboard')
      .set('Authorization', `Bearer ${token}`)
      .send({
        business_name: 'Not Yet Co',
        business_type: 'homestay',
        description: 'Pending',
        location: 'Darjeeling',
        contact_phone: phone,
      });

    const { order } = await pay(token, 'provider_renewal', onboard.body.provider.id);
    expect(order.status).toBe(409);
  });

  it('refuses a renewal against someone else\'s business', async () => {
    const { providerId } = await onboardActiveProvider({ name: 'Renewal Victim' });
    const { token: attacker } = await registerUser({ name: 'Renewal Attacker' });

    const { order } = await pay(attacker, 'provider_renewal', providerId);
    expect(order.status).toBe(403);
  });
});

describe('a lapsed host plan', () => {
  it('takes the host\'s listings out of the public feed and detail page', async () => {
    const { providerId } = await onboardActiveProvider({ name: 'Lapsed Host' });
    const listing = await listingOf(providerId);

    const visible = await request(app).get('/api/listings?type=homestay');
    expect(visible.body.items.some((i: any) => i.id === listing.id)).toBe(true);

    await lapse(providerId);

    const feed = await request(app).get('/api/listings?type=homestay');
    expect(feed.body.items.some((i: any) => i.id === listing.id)).toBe(false);
    const detail = await request(app).get(`/api/listings/${listing.id}`);
    expect(detail.status).toBe(404);
  });

  it('stops new bookings on the host\'s listings', async () => {
    const { providerId } = await onboardActiveProvider({ name: 'No Bookings Host' });
    const listing = await listingOf(providerId);
    await lapse(providerId);

    const { token } = await registerUser({ name: 'Hopeful Guest' });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id, listing_type: 'homestay', check_in: '2030-01-01', check_out: '2030-01-03' });
    expect(res.status).toBe(409);
  });

  it('refuses to confirm a booking made before the plan lapsed', async () => {
    const { providerId } = await onboardActiveProvider({ name: 'Mid-Checkout Lapse' });
    const listing = await listingOf(providerId);
    const { token } = await registerUser({ name: 'Early Guest' });
    const booking = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id, listing_type: 'homestay', check_in: '2030-02-01', check_out: '2030-02-03' });
    expect(booking.status).toBe(200);

    await lapse(providerId);

    const checkout = await request(app)
      .post(`/api/bookings/${booking.body.booking.id}/checkout`)
      .set('Authorization', `Bearer ${token}`);
    expect(checkout.status).toBe(409);
  });

  it('comes straight back when the host renews', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Returning Host' });
    const listing = await listingOf(providerId);
    await lapse(providerId);

    const before = Date.now();
    const { complete } = await pay(token, 'provider_renewal', providerId);
    expect(complete!.status).toBe(200);

    // Renewed from today, not from the lapsed date.
    const expiry = Date.parse((await providerMe(token)).plan_expires_at);
    expect(expiry - before).toBeGreaterThan(364 * DAY_MS);

    const detail = await request(app).get(`/api/listings/${listing.id}`);
    expect(detail.status).toBe(200);
  });
});
