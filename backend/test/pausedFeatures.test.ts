import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { onboardActiveProvider, registerUser } from './helpers';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

/**
 * TEMPORARY(legal-pause): delete this file with the pause.
 *
 * Home delivery and donations are paused until the CA has answered (config.ts). The rest of the
 * suite runs with both on (vitest.config.ts); here they are switched off, as in production.
 */
afterEach(() => {
  vi.unstubAllEnvs();
});

async function deliveringCafe() {
  const cafe = await onboardActiveProvider({ name: 'Paused Cafe', businessType: 'cafe' });
  const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.providerId, cafe.providerId)).limit(1);
  await db.update(schema.listings).set({ extras: { ...(listing.extras || {}), home_delivery: true } }).where(eq(schema.listings.id, listing.id));
  return { cafe, listing };
}

describe('home delivery, paused', () => {
  it('is not advertised on the listing or in lists', async () => {
    const { listing } = await deliveringCafe();
    vi.stubEnv('HOME_DELIVERY', 'false');

    const detail = await request(app).get(`/api/listings/${listing.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.item.extras).not.toHaveProperty('home_delivery');

    const list = await request(app).get('/api/listings?type=cafe');
    const row = (list.body.items || list.body).find((l: any) => l.id === listing.id);
    expect(row.extras).not.toHaveProperty('home_delivery');
  });

  it('refuses a new request, but keeps the host setting so switching it back on restores it', async () => {
    const { listing } = await deliveringCafe();
    const t = await registerUser({ name: 'Hungry Hari' });
    vi.stubEnv('HOME_DELIVERY', 'false');

    const res = await request(app).post('/api/deliveries').set(auth(t.token))
      .send({ listing_id: listing.id, items: [{ name: 'Momo', qty: 1 }], address: 'Near the clock tower, Darjeeling' });
    expect(res.status).toBe(403);
    expect(res.body.detail).toMatch(/paused/i);

    const [stored] = await db.select().from(schema.listings).where(eq(schema.listings.id, listing.id)).limit(1);
    expect((stored.extras as any).home_delivery).toBe(true);

    vi.stubEnv('HOME_DELIVERY', 'true');
    expect((await request(app).get(`/api/listings/${listing.id}`)).body.item.extras.home_delivery).toBe(true);
  });

  it('still lets a host answer a request that was already open', async () => {
    const { cafe, listing } = await deliveringCafe();
    const t = await registerUser({ name: 'Early Ema' });
    const made = await request(app).post('/api/deliveries').set(auth(t.token))
      .send({ listing_id: listing.id, items: [{ name: 'Tea', qty: 2 }], address: 'Mall Road, Darjeeling town' });
    expect(made.status).toBe(201);

    vi.stubEnv('HOME_DELIVERY', 'false');
    const answered = await request(app).patch(`/api/deliveries/${made.body.request.id}`).set(auth(cafe.token)).send({ status: 'accepted' });
    expect(answered.status).toBe(200);
  });
});

describe('GET /api/app/status', () => {
  it('tells the website the current switches, uncached, as the .env sets them', async () => {
    vi.stubEnv('MAINTENANCE', 'true');
    vi.stubEnv('HOME_DELIVERY', 'false');
    vi.stubEnv('DONATIONS', 'false');
    const on = await request(app).get('/api/app/status');
    expect(on.status).toBe(200);
    expect(on.headers['cache-control']).toBe('no-store');
    expect(on.body).toEqual({ maintenance: true, home_delivery: false, donations: false });

    vi.stubEnv('MAINTENANCE', 'false');
    vi.stubEnv('HOME_DELIVERY', 'true');
    vi.stubEnv('DONATIONS', 'true');
    expect((await request(app).get('/api/app/status')).body).toEqual({ maintenance: false, home_delivery: true, donations: true });
  });

  it('keeps maintenance off outside production when the variable is unset', async () => {
    vi.stubEnv('MAINTENANCE', '');
    expect((await request(app).get('/api/app/status')).body.maintenance).toBe(false);
  });
});

describe('donations, paused', () => {
  it('refuses a new donation order', async () => {
    const t = await registerUser({ name: 'Generous Gita' });
    vi.stubEnv('DONATIONS', 'false');
    const res = await request(app).post('/api/payments/order').set(auth(t.token))
      .send({ flow: 'donation', reference_id: t.user.id, amount: 5000 });
    expect(res.status).toBe(403);
    expect(res.body.detail).toMatch(/paused/i);
  });
});
