import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { expireStaleRequests } from '../src/lib/requestExpiry';
import { REQUEST_EXPIRY_HOURS } from '../src/config';
import { registerUser, onboardActiveProvider, loginAdmin, createListing } from './helpers';

/**
 * A request waits for the host's Accept. A host who never answers used to leave the guest waiting
 * forever; after REQUEST_EXPIRY_HOURS the request now closes and both sides are told.
 */
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const age = (id: string, hours: number) =>
  db.update(schema.bookings).set({ createdAt: new Date(Date.now() - hours * 3600_000).toISOString() }).where(eq(schema.bookings.id, id));
const status = async (id: string) => (await db.select().from(schema.bookings).where(eq(schema.bookings.id, id)))[0].status;

async function hostHomestay(name: string) {
  const { token, providerId } = await onboardActiveProvider({ name });
  const admin = await loginAdmin();
  const res = await request(app).post('/api/listings').set(auth(admin)).send({
    title: `${name} stay`, type: 'homestay', description: 'x', location: 'Darjeeling', price: 1500, provider_id: providerId,
  });
  return { hostToken: token, listing: res.body.item };
}
async function ask(token: string, listing: any, checkIn: string, checkOut?: string) {
  const res = await request(app).post('/api/bookings').set(auth(token)).send({
    listing_id: listing.id, listing_type: listing.type, check_in: checkIn, ...(checkOut ? { check_out: checkOut } : {}),
  });
  expect(res.status).toBe(200);
  return res.body.booking;
}

describe('unanswered requests close by themselves', () => {
  it(`closes a request older than ${REQUEST_EXPIRY_HOURS}h and tells the guest and the host`, async () => {
    const { hostToken, listing } = await hostHomestay('Silent Host');
    const { token: guest } = await registerUser({ name: 'Waiting Guest' });
    const old = await ask(guest, listing, '2033-01-01', '2033-01-03');
    const fresh = await ask(guest, listing, '2033-02-01', '2033-02-03');
    await age(old.id, REQUEST_EXPIRY_HOURS + 1);

    await expireStaleRequests();

    expect(await status(old.id)).toBe('cancelled');
    expect(await status(fresh.id)).toBe('pending_payment');
    const guestFeed = (await request(app).get('/api/notifications').set(auth(guest))).body.items;
    expect(guestFeed.some((n: any) => n.kind === 'booking_expired')).toBe(true);
    const hostFeed = (await request(app).get('/api/notifications').set(auth(hostToken))).body.items;
    expect(hostFeed.some((n: any) => n.kind === 'booking_expired')).toBe(true);
  });

  it('leaves accepted requests alone, and the host cannot accept one that has closed', async () => {
    const { hostToken, listing } = await hostHomestay('Slow Host');
    const { token: guest } = await registerUser({ name: 'Patient Guest' });
    const accepted = await ask(guest, listing, '2033-03-01', '2033-03-03');
    const lapsed = await ask(guest, listing, '2033-04-01', '2033-04-03');
    await request(app).patch(`/api/bookings/${accepted.id}/confirm`).set(auth(hostToken));
    await age(accepted.id, REQUEST_EXPIRY_HOURS + 5);
    await age(lapsed.id, REQUEST_EXPIRY_HOURS + 5);

    await expireStaleRequests();

    expect(await status(accepted.id)).toBe('accepted');
    const late = await request(app).patch(`/api/bookings/${lapsed.id}/confirm`).set(auth(hostToken));
    expect(late.status).toBe(409);
  });

  it('does not touch old unpaid checkouts on team-run listings, which wait on nobody', async () => {
    const listing = await createListing({ title: 'Team Spot Expiry' });
    const { token: guest } = await registerUser({ name: 'Spot Guest Expiry' });
    const b = await ask(guest, listing, '2033-05-01');
    await age(b.id, REQUEST_EXPIRY_HOURS + 1);
    await expireStaleRequests();
    expect(await status(b.id)).toBe('pending_payment');
  });
});
