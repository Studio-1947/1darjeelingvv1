import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { onboardActiveProvider, registerUser } from './helpers';

/**
 * "Guest did not come": the host closes a confirmed booking whose guest never came, from the day
 * after the trip's first day until two days after its last. It then never counts as a completed trip.
 */

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const iso = (days: number) => new Date(Date.now() + days * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

async function setup(name: string) {
  const h = await onboardActiveProvider({ name });
  const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.providerId, h.providerId)).limit(1);
  const g = await registerUser({ name: `${name} Guest` });
  const add = async (b: Partial<typeof schema.bookings.$inferInsert>) => {
    const id = uuidv4();
    await db.insert(schema.bookings).values({
      id, userId: g.user.id, listingId: listing.id, listingType: listing.type, listingTitle: listing.title,
      checkIn: null, checkOut: null, guests: 2, notes: '', status: 'confirmed', createdAt: new Date().toISOString(), ...b,
    } as any);
    return id;
  };
  const hostItems = async () => (await request(app).get('/api/bookings/provider').set(auth(h.token))).body.items as any[];
  return { h, g, add, hostItems };
}

describe('POST /bookings/:id/no-show', () => {
  it('closes a stay the guest never came to, keeps the fee, and tells the guest', async () => {
    const { h, g, add, hostItems } = await setup('No Show Host');
    const id = await add({ checkIn: iso(-1), checkOut: iso(1) });
    const orderId = `mock_order_ns_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    await db.insert(schema.payments).values({
      id: uuidv4(), userId: g.user.id, flow: 'booking_commission', referenceId: id, amount: 100,
      orderId, status: 'paid', mock: true, createdAt: new Date().toISOString(), paidAt: new Date().toISOString(),
    } as any);

    expect((await hostItems()).find((b) => b.id === id).no_show_open).toBe(true);
    const res = await request(app).post(`/api/bookings/${id}/no-show`).set(auth(h.token));
    expect(res.status).toBe(200);
    expect(res.body.booking).toMatchObject({ status: 'cancelled', cancel_reason: 'no_show', cancelled_by: 'host' });

    const after = (await hostItems()).find((b) => b.id === id);
    expect(after).toMatchObject({ completed: false, no_show_open: false });
    // The guest had the number and held the room: the ₹1 is not given back.
    const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, orderId)).limit(1);
    expect(payment.status).toBe('paid');
    const feed = (await request(app).get('/api/notifications').set(auth(g.token))).body.items as any[];
    expect(feed.some((n) => n.kind === 'booking_no_show' && n.ref_id === id)).toBe(true);

    // Pressing it twice changes nothing.
    const again = await request(app).post(`/api/bookings/${id}/no-show`).set(auth(h.token));
    expect(again.status).toBe(200);
  });

  it('turns a just-completed stay back into a no-show, so it stops counting', async () => {
    const { h, add, hostItems } = await setup('Completed No Show');
    const id = await add({ checkIn: iso(-4), checkOut: iso(-2) });
    expect((await hostItems()).find((b) => b.id === id).completed).toBe(true);
    const before = (await request(app).get('/api/providers/me/stats').set(auth(h.token))).body.completed;

    await request(app).post(`/api/bookings/${id}/no-show`).set(auth(h.token)).expect(200);
    expect((await hostItems()).find((b) => b.id === id).completed).toBe(false);
    const stats = (await request(app).get('/api/providers/me/stats').set(auth(h.token))).body;
    expect(stats.completed).toBe(before - 1);
  });

  it('is refused on arrival day, after the window, without dates, and on an unconfirmed booking', async () => {
    const { h, add, hostItems } = await setup('Early Late Host');
    const future = await add({ checkIn: iso(2), checkOut: iso(3) });
    const arriving = await add({ checkIn: iso(0), checkOut: iso(2) });
    const old = await add({ checkIn: iso(-6), checkOut: iso(-3) });
    const edge = await add({ checkIn: iso(-4), checkOut: iso(-2) });
    const undated = await add({});
    const pending = await add({ checkIn: iso(-1), checkOut: iso(1), status: 'accepted' });

    const items = await hostItems();
    expect(items.find((b) => b.id === future).no_show_open).toBe(false);
    // The guest may still arrive this evening.
    expect(items.find((b) => b.id === arriving).no_show_open).toBe(false);
    expect(items.find((b) => b.id === old).no_show_open).toBe(false);
    // Exactly two days after the last day is still inside the window.
    expect(items.find((b) => b.id === edge).no_show_open).toBe(true);

    const today = await request(app).post(`/api/bookings/${arriving}/no-show`).set(auth(h.token));
    expect(today.status).toBe(409);
    expect(today.body.code).toBe('not_started');
    const noDates = await request(app).post(`/api/bookings/${undated}/no-show`).set(auth(h.token));
    expect(noDates.status).toBe(409);
    expect(noDates.body.code).toBe('no_dates');

    const early = await request(app).post(`/api/bookings/${future}/no-show`).set(auth(h.token));
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('not_started');
    const late = await request(app).post(`/api/bookings/${old}/no-show`).set(auth(h.token));
    expect(late.status).toBe(409);
    expect(late.body.code).toBe('too_late');
    const unconfirmed = await request(app).post(`/api/bookings/${pending}/no-show`).set(auth(h.token));
    expect(unconfirmed.status).toBe(409);
    expect(unconfirmed.body.code).toBe('not_confirmed');
  });

  it('only the host of the listing (or the team) can report it', async () => {
    const { g, add } = await setup('Owner Only Host');
    const id = await add({ checkIn: iso(-1), checkOut: iso(1) });
    const other = await onboardActiveProvider({ name: 'Some Other Host' });
    expect((await request(app).post(`/api/bookings/${id}/no-show`).set(auth(g.token))).status).toBe(403);
    expect((await request(app).post(`/api/bookings/${id}/no-show`).set(auth(other.token))).status).toBe(403);
  });

  it('is refused once the guest has reviewed the stay', async () => {
    const { h, g, add } = await setup('Reviewed Host');
    const id = await add({ checkIn: iso(-3), checkOut: iso(-1) });
    const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, id)).limit(1);
    await db.insert(schema.reviews).values({ id: uuidv4(), userId: g.user.id, listingId: b.listingId, rating: 2, comment: 'Not great', photos: [], authorName: 'G', createdAt: new Date().toISOString() } as any);
    const res = await request(app).post(`/api/bookings/${id}/no-show`).set(auth(h.token));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('reviewed');
  });

  it('rejects a note longer than a cancel note may be', async () => {
    const { h, add } = await setup('Long Note Host');
    const id = await add({ checkIn: iso(-1), checkOut: iso(1) });
    const res = await request(app).post(`/api/bookings/${id}/no-show`).set(auth(h.token)).send({ note: 'x'.repeat(201) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('bad_note');
  });
});

describe('cancelling a trip that is over', () => {
  it('a booking with no date can still be cancelled by the host after it is confirmed', async () => {
    const { h, add } = await setup('Undated Cancel Host');
    const id = await add({});
    const res = await request(app).patch(`/api/bookings/${id}/cancel`).set(auth(h.token)).send({ as: 'host' });
    expect(res.status).toBe(200);
  });

  it('accepting an old cancel request does not cancel a finished trip', async () => {
    const { h, add } = await setup('Old Request Host');
    const id = await add({ checkIn: iso(-4), checkOut: iso(-2), cancelRequestedAt: new Date(Date.now() - 6 * 864e5).toISOString() });
    const res = await request(app).post(`/api/bookings/${id}/cancel-request/accept`).set(auth(h.token));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('trip_over');
  });
});
