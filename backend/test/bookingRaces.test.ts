import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { activateSupport, createListing, inDays, loginAdmin, onboardActiveProvider, registerUser } from './helpers';

// Two actions on one booking at the same instant. Each side is told an outcome; the row must
// end up agreeing with whatever the cancel was told. Repeated, because a race only shows
// some of the time.
const ROUNDS = 6;
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const statusOf = async (id: string) =>
  (await db.select({ s: schema.bookings.status }).from(schema.bookings).where(eq(schema.bookings.id, id)))[0]?.s;

async function hostListing() {
  const { token: host, providerId } = await onboardActiveProvider({ name: 'Race Host' });
  const admin = await loginAdmin();
  const listing = (await request(app).post('/api/listings').set(auth(admin)).send({
    title: 'Race Homestay', type: 'homestay', description: 'x', location: 'Darjeeling', price: 1000, provider_id: providerId,
  })).body.item;
  return { host, listing };
}

describe('booking races', () => {
  it('a cancel at the same moment as the host accepting is never undone', async () => {
    const { host, listing } = await hostListing();
    const { token: guest } = await registerUser({ name: 'Race Guest' });
    for (let i = 0; i < ROUNDS; i++) {
      const made = await request(app).post('/api/bookings').set(auth(guest))
        .send({ listing_id: listing.id, check_in: inDays(20 + i * 2), check_out: inDays(21 + i * 2) });
      expect(made.status).toBe(200);
      const id = made.body.booking.id;
      const [, cancel] = await Promise.all([
        request(app).patch(`/api/bookings/${id}/confirm`).set(auth(host)),
        request(app).patch(`/api/bookings/${id}/cancel`).set(auth(guest)),
      ]);
      expect(cancel.status).toBe(200);
      expect(await statusOf(id)).toBe('cancelled');
    }
  });

  it('a cancel at the same moment as the guest confirming is never undone', async () => {
    const { host, listing } = await hostListing();
    const { token: guest, user } = await registerUser({ name: 'Race Pass Guest' });
    await activateSupport(guest, user.id);
    for (let i = 0; i < ROUNDS; i++) {
      const made = await request(app).post('/api/bookings').set(auth(guest))
        .send({ listing_id: listing.id, check_in: inDays(40 + i * 2), check_out: inDays(41 + i * 2) });
      const id = made.body.booking.id;
      expect((await request(app).patch(`/api/bookings/${id}/confirm`).set(auth(host))).status).toBe(200);
      const [checkout, cancel] = await Promise.all([
        request(app).post(`/api/bookings/${id}/checkout`).set(auth(guest)),
        request(app).patch(`/api/bookings/${id}/cancel`).set(auth(guest)),
      ]);
      expect(cancel.status).toBe(200);
      expect(await statusOf(id)).toBe('cancelled');
      // Whoever lost was told so: a checkout after the cancel answers 409, not "confirmed".
      if (checkout.status === 200) expect(checkout.body.booking.status).toBe('confirmed');
      else expect(checkout.status).toBe(409);
    }
  });

  it('a double tap on "Request to book" saves one request', async () => {
    const listing = await createListing({ title: 'Double Tap Homestay', type: 'homestay' });
    const driver = await createListing({ title: 'Double Tap Driver', type: 'driver' });
    for (let i = 0; i < ROUNDS; i++) {
      // A new traveller each round, so the cap on waiting requests stays out of the way.
      const { token } = await registerUser({ name: 'Double Tapper' });
      for (const [l, body] of [
        [listing, { check_in: inDays(60 + i * 2), check_out: inDays(61 + i * 2) }],
        [driver, { check_in: inDays(60 + i) }],
      ] as const) {
        const res = await Promise.all([1, 2, 3].map(() =>
          request(app).post('/api/bookings').set(auth(token)).send({ listing_id: l.id, ...body })));
        expect(res.filter((r) => r.status === 200)).toHaveLength(1);
        for (const r of res.filter((x) => x.status !== 200)) expect(r.body.code).toBe('already_requested');
      }
    }
  });
});

describe('limits on unpaid requests and orders', () => {
  it('lets a traveller have at most 5 requests waiting, counting requests sent at once', async () => {
    const { token } = await registerUser({ name: 'Many Requests' });
    const listings = await Promise.all([1, 2, 3, 4, 5, 6, 7].map((n) => createListing({ title: `Cap Homestay ${n}`, type: 'homestay' })));
    const res = await Promise.all(listings.map((l) =>
      request(app).post('/api/bookings').set(auth(token)).send({ listing_id: l.id, check_in: inDays(90), check_out: inDays(91) })));
    expect(res.filter((r) => r.status === 200)).toHaveLength(5);
    for (const r of res.filter((x) => x.status !== 200)) {
      expect(r.status).toBe(409);
      expect(r.body.code).toBe('too_many_requests');
    }
    // Cancelling one frees a place.
    const first = res.find((r) => r.status === 200)!.body.booking.id;
    await request(app).patch(`/api/bookings/${first}/cancel`).set(auth(token));
    const again = await request(app).post('/api/bookings').set(auth(token))
      .send({ listing_id: listings[6].id, check_in: inDays(95), check_out: inDays(96) });
    expect(again.status).toBe(200);
  });

  it('hands back the same open order when Pay is pressed again, even at the same instant', async () => {
    const listing = await createListing({ title: 'One Order Spot' });
    const { token } = await registerUser({ name: 'Presses Pay Twice', paySupport: false });
    const made = await request(app).post('/api/bookings').set(auth(token)).send({ listing_id: listing.id });
    const order = () => request(app).post('/api/payments/order').set(auth(token))
      .send({ flow: 'booking_commission', reference_id: made.body.booking.id });
    const [a, b] = await Promise.all([order(), order()]);
    const c = await order();
    expect(a.status).toBe(200);
    expect(new Set([a.body.order.id, b.body.order.id, c.body.order.id]).size).toBe(1);
    const rows = await db.select().from(schema.payments).where(eq(schema.payments.referenceId, made.body.booking.id));
    expect(rows).toHaveLength(1);
  });
});
