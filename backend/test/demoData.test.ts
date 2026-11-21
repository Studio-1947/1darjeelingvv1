import { describe, it, expect } from 'vitest';
import request from 'supertest';

import { app } from '../src/app';
import { db, pool, schema } from '../src/db';
import { DEMO_BUSINESSES, SEED_LISTINGS } from '../src/seed_data';
import { DEMO_PROVIDER_ID, HOST_TYPES, deleteDemoListings, findDemoData, isStockPhoto } from '../src/lib/demoData';
import { loginAdmin, registerUser } from './helpers';

let n = 0;
async function listing(o: { title: string; type: string; provider?: string; image?: string }) {
  const id = `l-${++n}-${Date.now()}`;
  await db.insert(schema.listings).values({
    id, title: o.title, type: o.type, description: 'x', location: 'Darjeeling', price: 0,
    image: o.image ?? '', tags: [], providerId: o.provider ?? DEMO_PROVIDER_ID, extras: {},
    createdAt: new Date().toISOString(),
  });
  return id;
}

async function bookingOn(listingId: string, title: string) {
  const user = await registerUser({ name: 'Guest' });
  await db.insert(schema.bookings).values({
    id: `b-${listingId}`, userId: user.user.id, listingId, listingType: 'homestay', listingTitle: title,
    status: 'confirmed', createdAt: new Date().toISOString(),
  } as typeof schema.bookings.$inferInsert);
}

const ids = (xs: { id: string }[]) => xs.map((x) => x.id).sort();

describe('demo business clean-up', () => {
  it('the seed list no longer contains businesses, so the admin Seed button cannot bring them back', async () => {
    expect(SEED_LISTINGS.filter((l) => HOST_TYPES.includes(l.type))).toEqual([]);
    expect(DEMO_BUSINESSES).toHaveLength(13);

    const admin = await loginAdmin();
    const res = await request(app).post('/api/admin/seed').set('Authorization', `Bearer ${admin}`);
    expect(res.status).toBe(200);
    const { rows } = await pool.query('SELECT type FROM listings WHERE type = ANY($1)', [HOST_TYPES]);
    expect(rows).toEqual([]);
  });

  it('removes only unbooked demo businesses and reports everything else', async () => {
    const mist = await listing({ title: 'Mist & Pine Homestay', type: 'homestay' });
    const glenarys = await listing({ title: "Glenary's Bakery & Cafe", type: 'cafe' });
    const bookedDemo = await listing({ title: 'Prayer Flag Cottage', type: 'homestay' });
    await bookingOn(bookedDemo, 'Prayer Flag Cottage');
    const adminStay = await listing({ title: 'Real Stay The Team Added', type: 'homestay' });
    const tigerHill = await listing({ title: 'Tiger Hill Sunrise', type: 'spot', image: 'https://res.cloudinary.com/x/tiger.webp' });
    // A real host may use the same name as a demo business; only the admin-owned copy is demo.
    const sameName = await listing({ title: 'Mist & Pine Homestay', type: 'homestay', provider: 'prov-real' });
    const stock = await listing({ title: 'Pemba Rides', type: 'driver', provider: 'prov-2', image: 'https://images.pexels.com/p.jpg' });
    const own = await listing({ title: 'Own Photos Cafe', type: 'cafe', provider: 'prov-3', image: 'https://aanganerp.in/one-darjeeling/a.jpg' });

    const report = await findDemoData(pool);
    expect(ids(report.remove)).toEqual([mist, glenarys].sort());
    expect(ids(report.booked)).toEqual([bookedDemo]);
    expect(ids(report.adminOwned)).toEqual([adminStay]);
    expect(ids(report.stockPhotos)).toEqual([stock]);

    // Asked to delete everything, it still deletes only the unbooked demo businesses.
    // One connection, as the script and the admin route use: BEGIN and COMMIT must share a session.
    const client = await pool.connect();
    const deleted = await deleteDemoListings(client, [mist, glenarys, bookedDemo, adminStay, tigerHill, sameName, stock, own])
      .finally(() => client.release());
    expect(deleted.sort()).toEqual([mist, glenarys].sort());
    const { rows } = await pool.query('SELECT id FROM listings ORDER BY id');
    expect(rows.map((r) => r.id).sort()).toEqual([bookedDemo, adminStay, tigerHill, sameName, stock, own].sort());

    // A second run has nothing left to remove.
    expect((await findDemoData(pool)).remove).toEqual([]);
  });

  it('tells stock and placeholder photos from real uploads', () => {
    for (const url of ['https://images.pexels.com/a.jpg', 'https://images.unsplash.com/photo-1', 'https://res.cloudinary.com/x/y.webp', 'https://loremflickr.com/320/240', 'https://miro.medium.com/v2/a.jpeg']) {
      expect(isStockPhoto(url), url).toBe(true);
    }
    for (const url of ['https://aanganerp.in/one-darjeeling/a.jpg', 'https://evil.com/images.pexels.com.jpg', '', null, 'not a url']) {
      expect(isStockPhoto(url), String(url)).toBe(false);
    }
  });
});
