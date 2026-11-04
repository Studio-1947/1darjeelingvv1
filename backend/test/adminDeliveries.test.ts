import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { loginAdmin, onboardActiveProvider, registerUser } from './helpers';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('admin: home delivery requests and trip suggestions', () => {
  it('lists every delivery request with both sides, filters by status and counts open ones', async () => {
    const admin = await loginAdmin();
    const cafe = await onboardActiveProvider({ name: 'Admin View Cafe', businessType: 'cafe' });
    const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.providerId, cafe.providerId)).limit(1);
    await db.update(schema.listings).set({ extras: { ...(listing.extras || {}), home_delivery: true } }).where(eq(schema.listings.id, listing.id));
    const t = await registerUser({ name: 'Delivery Dawa' });

    const before = (await request(app).get('/api/admin/stats').set(auth(admin))).body.open_deliveries;
    const made = await request(app).post('/api/deliveries').set(auth(t.token))
      .send({ listing_id: listing.id, items: [{ name: 'Thukpa', qty: 1 }], address: 'Near the clock tower, Darjeeling' });
    expect(made.status).toBe(201);
    expect((await request(app).get('/api/admin/stats').set(auth(admin))).body.open_deliveries).toBe(before + 1);

    const open = await request(app).get('/api/deliveries/admin?status=open').set(auth(admin));
    expect(open.status).toBe(200);
    const row = open.body.items.find((i: any) => i.id === made.body.request.id);
    expect(row).toMatchObject({ status: 'open', listing_title: listing.title, customer: { name: 'Delivery Dawa' } });
    expect(row.business?.name).toBeTruthy();
    expect(open.body.counts.open).toBeGreaterThanOrEqual(1);

    const delivered = await request(app).get('/api/deliveries/admin?status=delivered').set(auth(admin));
    expect(delivered.body.items.some((i: any) => i.id === made.body.request.id)).toBe(false);

    // Admin only.
    expect((await request(app).get('/api/deliveries/admin').set(auth(t.token))).status).toBe(403);
    expect((await request(app).get('/api/deliveries/admin').set(auth(cafe.token))).status).toBe(403);
  });

  it('shows which trip a traveller suggestion came from', async () => {
    const admin = await loginAdmin();
    const t = await registerUser({ name: 'Suggesting Sonam' });
    const bookingId = uuidv4();
    const host = await onboardActiveProvider({ name: 'Trip Place' });
    const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.providerId, host.providerId)).limit(1);
    await db.insert(schema.bookings).values({
      id: bookingId, userId: t.user.id, listingId: listing.id, listingType: listing.type, listingTitle: listing.title,
      checkIn: null, checkOut: null, guests: 1, notes: '', status: 'confirmed', createdAt: new Date().toISOString(),
    } as any);
    expect((await request(app).post('/api/feedback/aangan').set(auth(t.token)).send({ message: 'More cafes near the mall please', booking_id: bookingId })).status).toBe(201);
    const all = await request(app).get('/api/feedback/aangan/all').set(auth(admin));
    const item = all.body.items.find((i: any) => i.message === 'More cafes near the mall please');
    expect(item.booking).toEqual({ id: bookingId, place: listing.title });
  });
});
