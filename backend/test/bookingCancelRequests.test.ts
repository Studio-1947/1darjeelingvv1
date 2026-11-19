import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { createConfirmedBooking, inDays, loginAdmin, onboardActiveProvider, registerUser } from './helpers';

/** A real host's homestay, so requests wait for the host and the host can answer them. */
async function hostWithHomestay(name: string) {
  const { token } = await onboardActiveProvider({ name });
  const res = await request(app).post('/api/listings').set('Authorization', `Bearer ${token}`)
    .send({ title: `${name} House`, type: 'homestay', description: 'x', location: 'Darjeeling', price: 1200 });
  expect(res.status).toBe(200);
  return { hostToken: token, listingId: res.body.item.id as string };
}

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function ask(token: string, listingId: string, from: number, to: number) {
  const res = await request(app).post('/api/bookings').set(auth(token)).send({ listing_id: listingId, check_in: inDays(from), check_out: inDays(to) });
  expect(res.status).toBe(200);
  return res.body.booking.id as string;
}

async function notes(userToken: string) {
  const res = await request(app).get('/api/notifications').set(auth(userToken));
  return (res.body.items || res.body) as any[];
}

describe('cancelling with a reason (PATCH /bookings/:id/cancel)', () => {
  it('a host declining a request records the reason and tells the guest', async () => {
    const { hostToken, listingId } = await hostWithHomestay('Decliner');
    const { token } = await registerUser({ name: 'Declined Guest' });
    const id = await ask(token, listingId, 10, 12);

    const wrongSide = await request(app).patch(`/api/bookings/${id}/cancel`).set(auth(hostToken)).send({ reason: 'plans_changed' });
    expect(wrongSide.status).toBe(400);
    expect(wrongSide.body.code).toBe('bad_reason');

    const res = await request(app).patch(`/api/bookings/${id}/cancel`).set(auth(hostToken)).send({ reason: 'fully_booked', note: 'Wedding in the family' });
    expect(res.status).toBe(200);
    expect(res.body.booking).toMatchObject({
      status: 'cancelled', cancelled_by: 'host', declined: true, cancel_reason: 'fully_booked', cancel_note: 'Wedding in the family', cancel_late: false,
    });
    expect(res.body.booking.cancelled_at).toBeTruthy();

    const mine = await request(app).get('/api/bookings/me').set(auth(token));
    expect(mine.body.items[0]).toMatchObject({ declined: true, cancelled_by: 'host', cancel_reason: 'fully_booked' });
    const host = await request(app).get('/api/bookings/provider').set(auth(hostToken));
    expect(host.body.items[0]).toMatchObject({ declined: true, cancel_reason: 'fully_booked' });
    const feed = await notes(token);
    expect(feed.some((n) => n.kind === 'booking_declined' && n.msg?.key === 'request_declined' && /Fully booked/.test(n.body))).toBe(true);
  });

  it('a guest cancelling a confirmed booking under 24 hours ahead is late (nothing to refund: confirming is free)', async () => {
    const { token } = await registerUser({ name: 'Late Guest', paySupport: false });
    const { hostToken, listingId } = await hostWithHomestay('Late Host');
    void hostToken;
    const id = await ask(token, listingId, 0, 1);
    await request(app).patch(`/api/bookings/${id}/confirm`).set(auth(await loginAdmin()));
    // No pass: it confirms free.
    const checkout = await request(app).post(`/api/bookings/${id}/checkout`).set(auth(token));
    expect(checkout.status).toBe(200);

    const res = await request(app).patch(`/api/bookings/${id}/cancel`).set(auth(token)).send({ reason: 'weather_road' });
    expect(res.status).toBe(200);
    expect(res.body.refunded).toBeFalsy();
    expect(res.body.booking).toMatchObject({ cancelled_by: 'guest', cancel_late: true, declined: false, cancel_reason: 'weather_road' });
  });

  it('still cancels without a reason (older apps), and refuses an unknown one', async () => {
    const { listingId } = await hostWithHomestay('Plain Host');
    const { token } = await registerUser({ name: 'Plain Guest' });
    const id = await ask(token, listingId, 30, 31);
    const bad = await request(app).patch(`/api/bookings/${id}/cancel`).set(auth(token)).send({ reason: 'bored' });
    expect(bad.status).toBe(400);
    const long = await request(app).patch(`/api/bookings/${id}/cancel`).set(auth(token)).send({ reason: 'other', note: 'x'.repeat(201) });
    expect(long.status).toBe(400);
    const res = await request(app).patch(`/api/bookings/${id}/cancel`).set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.booking).toMatchObject({ status: 'cancelled', cancelled_by: 'guest', cancel_reason: null, cancel_late: false });
  });

  it('closing other requests when a host accepts one records them as declined (fully booked)', async () => {
    const { hostToken, listingId } = await hostWithHomestay('Busy Host');
    const { token: a } = await registerUser({ name: 'First Guest' });
    const { token: b } = await registerUser({ name: 'Second Guest' });
    // The second request is for later nights, then moved onto the first's (a live request holds
    // its nights, so a clash can only exist as an older request whose hold ran out).
    const second = await ask(b, listingId, 45, 47);
    const first = await ask(a, listingId, 40, 42);
    await db.update(schema.bookings).set({ checkIn: inDays(41), checkOut: inDays(43) }).where(eq(schema.bookings.id, second));
    const ok = await request(app).patch(`/api/bookings/${first}/confirm`).set(auth(hostToken));
    expect(ok.status).toBe(200);
    const [row] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, second));
    expect(row).toMatchObject({ status: 'cancelled', declined: true, cancelledBy: 'host', cancelReason: 'fully_booked' });
  });
});

describe('a guest withdrawing a request', () => {
  it('tells the host, whose last word was "New booking request"', async () => {
    const { hostToken, listingId } = await hostWithHomestay('Withdrawn');
    const { token } = await registerUser({ name: 'Changed Mind' });
    const id = await ask(token, listingId, 14, 16);
    const res = await request(app).patch(`/api/bookings/${id}/cancel`).set(auth(token)).send({ reason: 'plans_changed' });
    expect(res.status).toBe(200);
    const feed = await notes(hostToken);
    const n = feed.find((x) => x.kind === 'booking_withdrawn' && x.ref_id === id);
    expect(n).toBeTruthy();
    expect(n.msg).toMatchObject({ key: 'request_withdrawn', params: { place: 'Withdrawn House' } });
  });
});

describe('cancel requests on a confirmed booking', () => {
  it('guest asks, takes it back, asks again; host keeps; guest asks again; host accepts', async () => {
    const { hostToken, listingId } = await hostWithHomestay('Answering Host');
    const { token, user } = await registerUser({ name: 'Asking Guest' });
    const id = await createConfirmedBooking({ token, listingId, listingType: 'homestay', checkIn: inDays(20), checkOut: inDays(22) });

    // Only with a known guest reason.
    expect((await request(app).post(`/api/bookings/${id}/cancel-request`).set(auth(token)).send({})).body.code).toBe('reason_required');
    expect((await request(app).post(`/api/bookings/${id}/cancel-request`).set(auth(token)).send({ reason: 'fully_booked' })).body.code).toBe('bad_reason');
    // Only the guest.
    expect((await request(app).post(`/api/bookings/${id}/cancel-request`).set(auth(hostToken)).send({ reason: 'other' })).status).toBe(403);

    const asked = await request(app).post(`/api/bookings/${id}/cancel-request`).set(auth(token)).send({ reason: 'plans_changed', note: 'Flight moved' });
    expect(asked.status).toBe(200);
    expect(asked.body.booking.status).toBe('confirmed');
    expect(asked.body.booking.cancel_request).toMatchObject({ reason: 'plans_changed', note: 'Flight moved', late: false });

    const hostView = await request(app).get('/api/bookings/provider').set(auth(hostToken));
    expect(hostView.body.items[0].cancel_request).toMatchObject({ reason: 'plans_changed' });
    expect((await notes(hostToken)).some((n) => n.kind === 'cancel_request' && n.msg?.key === 'cancel_request_host')).toBe(true);

    // The guest takes it back.
    const undo = await request(app).delete(`/api/bookings/${id}/cancel-request`).set(auth(token));
    expect(undo.status).toBe(200);
    expect(undo.body.booking).toMatchObject({ cancel_request: null, cancel_request_kept: false });
    expect((await notes(hostToken)).some((n) => n.kind === 'cancel_request_withdrawn')).toBe(true);
    // Nothing open: keep and accept have nothing to answer.
    expect((await request(app).post(`/api/bookings/${id}/cancel-request/keep`).set(auth(hostToken))).body.code).toBe('no_request');
    expect((await request(app).post(`/api/bookings/${id}/cancel-request/accept`).set(auth(hostToken))).body.code).toBe('no_request');

    // Asks again; the host keeps the booking.
    await request(app).post(`/api/bookings/${id}/cancel-request`).set(auth(token)).send({ reason: 'found_other' });
    expect((await request(app).post(`/api/bookings/${id}/cancel-request/keep`).set(auth(token))).status).toBe(403);
    const kept = await request(app).post(`/api/bookings/${id}/cancel-request/keep`).set(auth(hostToken));
    expect(kept.status).toBe(200);
    expect(kept.body.booking).toMatchObject({ status: 'confirmed', cancel_request: null, cancel_request_kept: true });
    expect((await notes(token)).some((n) => n.kind === 'cancel_request_kept')).toBe(true);

    // Asks once more; the host accepts the cancellation.
    await request(app).post(`/api/bookings/${id}/cancel-request`).set(auth(token)).send({ reason: 'weather_road', note: 'Landslide' });
    const accepted = await request(app).post(`/api/bookings/${id}/cancel-request/accept`).set(auth(hostToken));
    expect(accepted.status).toBe(200);
    expect(accepted.body.booking).toMatchObject({
      status: 'cancelled', cancelled_by: 'guest', cancel_reason: 'weather_road', cancel_note: 'Landslide',
      cancel_late: false, declined: false, cancel_request: null, cancel_request_kept: false,
    });
    const guestFeed = await db.select().from(schema.notifications)
      .where(and(eq(schema.notifications.userId, user.id), eq(schema.notifications.refId, id)));
    expect(guestFeed.some((n) => (n.msg as any)?.key === 'cancel_request_accepted')).toBe(true);
    // Answering again is harmless.
    expect((await request(app).post(`/api/bookings/${id}/cancel-request/accept`).set(auth(hostToken))).status).toBe(200);
  });

  it('is only for confirmed bookings that are still ahead', async () => {
    const { listingId } = await hostWithHomestay('Early Host');
    const { token } = await registerUser({ name: 'Early Guest' });
    const pending = await ask(token, listingId, 50, 51);
    const res = await request(app).post(`/api/bookings/${pending}/cancel-request`).set(auth(token)).send({ reason: 'plans_changed' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('not_confirmed');

    const id = await createConfirmedBooking({ token, listingId, listingType: 'homestay', checkIn: inDays(60), checkOut: inDays(61) });
    await db.update(schema.bookings).set({ checkIn: '2020-01-01', checkOut: '2020-01-02' }).where(eq(schema.bookings.id, id));
    const over = await request(app).post(`/api/bookings/${id}/cancel-request`).set(auth(token)).send({ reason: 'plans_changed' });
    expect(over.status).toBe(409);
    expect(over.body.code).toBe('trip_over');
  });

  it('marks a request made under 24 hours ahead late, and the accepted cancel late too', async () => {
    const { hostToken, listingId } = await hostWithHomestay('Tomorrow Host');
    const { token } = await registerUser({ name: 'Tomorrow Guest' });
    const id = await createConfirmedBooking({ token, listingId, listingType: 'homestay', checkIn: inDays(0), checkOut: inDays(1) });
    const asked = await request(app).post(`/api/bookings/${id}/cancel-request`).set(auth(token)).send({ reason: 'other' });
    expect(asked.body.booking.cancel_request.late).toBe(true);
    const accepted = await request(app).post(`/api/bookings/${id}/cancel-request/accept`).set(auth(hostToken));
    expect(accepted.body.booking.cancel_late).toBe(true);
  });

  it('refuses strangers and unknown bookings', async () => {
    const { listingId } = await hostWithHomestay('Guarded Host');
    const { token } = await registerUser({ name: 'Real Guest' });
    const { token: stranger } = await registerUser({ name: 'Stranger' });
    const id = await createConfirmedBooking({ token, listingId, listingType: 'homestay', checkIn: inDays(70), checkOut: inDays(71) });
    expect((await request(app).post(`/api/bookings/${id}/cancel-request`).set(auth(stranger)).send({ reason: 'other' })).status).toBe(403);
    expect((await request(app).delete(`/api/bookings/${id}/cancel-request`).set(auth(stranger))).status).toBe(403);
    expect((await request(app).post(`/api/bookings/${id}/cancel-request/accept`).set(auth(stranger))).status).toBe(403);
    expect((await request(app).post(`/api/bookings/${id}/cancel-request/keep`).set(auth(stranger))).status).toBe(403);
    expect((await request(app).post('/api/bookings/nope/cancel-request').set(auth(token)).send({ reason: 'other' })).status).toBe(404);
    expect((await request(app).post('/api/bookings/nope/cancel-request')).status).toBe(401);
  });
});
