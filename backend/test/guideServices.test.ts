import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { onboardActiveProvider, registerUser } from './helpers';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const day = (n: number) => new Date(Date.now() + n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

describe('guide booking: the traveller asks for given services (board)', () => {
  it('keeps only services the guide offers, and shows them to both sides', async () => {
    const guide = await onboardActiveProvider({ name: 'Pemba Treks', businessType: 'guide' });
    const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.providerId, guide.providerId)).limit(1);
    await db.update(schema.listings).set({
      extras: { ...(listing.extras || {}), services: [{ name: 'Tiger Hill sunrise', price: 1500, unit: 'trip' }, { name: 'Tea garden walk', price: 800, unit: 'trip' }] },
    }).where(eq(schema.listings.id, listing.id));
    const t = await registerUser({ name: 'Asha' });

    const made = await request(app).post('/api/bookings').set(auth(t.token)).send({
      listing_id: listing.id, listing_type: 'guide', check_in: day(5), guests: 2,
      services: ['Tiger Hill sunrise', 'Not a real service', 'Tiger Hill sunrise'],
    });
    expect([200, 201]).toContain(made.status);
    const id = made.body.booking?.id || made.body.id;

    const mine = await request(app).get('/api/bookings/me').set(auth(t.token));
    expect(mine.body.items.find((b: any) => b.id === id).services).toEqual(['Tiger Hill sunrise']);
    const inbox = await request(app).get('/api/bookings/provider').set(auth(guide.token));
    expect(inbox.body.items.find((b: any) => b.id === id).services).toEqual(['Tiger Hill sunrise']);
  });

  it('ignores services on other kinds of booking', async () => {
    const host = await onboardActiveProvider({ name: 'Plain Stay' });
    const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.providerId, host.providerId)).limit(1);
    const t = await registerUser({ name: 'Bimal' });
    const made = await request(app).post('/api/bookings').set(auth(t.token)).send({
      listing_id: listing.id, listing_type: 'homestay', check_in: day(10), check_out: day(11), guests: 1, services: ['Anything'],
    });
    const id = made.body.booking?.id || made.body.id;
    const mine = await request(app).get('/api/bookings/me').set(auth(t.token));
    expect(mine.body.items.find((b: any) => b.id === id).services).toEqual([]);
  });
});
