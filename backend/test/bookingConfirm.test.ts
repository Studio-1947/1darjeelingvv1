import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, onboardActiveProvider, loginAdmin } from './helpers';

/**
 * Host acceptance — PATCH /api/bookings/:id/confirm.
 *
 * The rule this suite pins down: accepting is the host saying yes, and it is NOT the same thing
 * as the booking being confirmed. Payment still confirms. What acceptance buys the guest is that
 * the dates stop being available to anyone else, unconditionally — a pending booking only holds
 * them for the length of the checkout window.
 */

/** A homestay owned by a real, paid-up provider, so the ownership check has something to find. */
async function homestayWithHost(name: string) {
  const { token: hostToken, providerId } = await onboardActiveProvider({ name });
  const admin = await loginAdmin();
  const res = await request(app)
    .post('/api/listings')
    .set('Authorization', `Bearer ${admin}`)
    .send({
      title: `${name}'s Homestay`,
      type: 'homestay',
      description: 'Four rooms above the ridge',
      location: 'Lebong, Darjeeling',
      price: 1800,
      provider_id: providerId,
    });
  expect(res.status).toBe(200);
  return { hostToken, providerId, listing: res.body.item };
}

async function requestBooking(token: string, listingId: string, checkIn: string, checkOut: string) {
  const res = await request(app)
    .post('/api/bookings')
    .set('Authorization', `Bearer ${token}`)
    .send({ listing_id: listingId, listing_type: 'homestay', check_in: checkIn, check_out: checkOut });
  expect(res.status).toBe(200);
  return res.body.booking.id as string;
}

describe('host acceptance of a booking request', () => {
  it('404s on an unknown booking', async () => {
    const { hostToken } = await homestayWithHost('Ghost Host');
    const res = await request(app)
      .patch('/api/bookings/does-not-exist/confirm')
      .set('Authorization', `Bearer ${hostToken}`);
    expect(res.status).toBe(404);
  });

  it('lets the host accept a request, without confirming it', async () => {
    const { hostToken, listing } = await homestayWithHost('Accepting Host');
    const { token: guest } = await registerUser({ name: 'Hopeful Guest' });
    const bookingId = await requestBooking(guest, listing.id, '2030-01-10', '2030-01-12');

    const res = await request(app)
      .patch(`/api/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${hostToken}`);

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('accepted');
    expect(res.body.booking.accepted_at).toBeTruthy();
    // The distinction the whole feature rests on: accepted is not confirmed.
    expect(res.body.booking.confirmed_at).toBeNull();
  });

  it('refuses a guest trying to accept their own request', async () => {
    const { listing } = await homestayWithHost('Unamused Host');
    const { token: guest } = await registerUser({ name: 'Self Approver' });
    const bookingId = await requestBooking(guest, listing.id, '2030-02-10', '2030-02-12');

    const res = await request(app)
      .patch(`/api/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${guest}`);
    expect(res.status).toBe(403);
  });

  it('refuses an unrelated provider', async () => {
    const { listing } = await homestayWithHost('Rightful Host');
    const { token: otherHost } = await onboardActiveProvider({ name: 'Other Host' });
    const { token: guest } = await registerUser({ name: 'Guest Three' });
    const bookingId = await requestBooking(guest, listing.id, '2030-03-10', '2030-03-12');

    const res = await request(app)
      .patch(`/api/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${otherHost}`);
    expect(res.status).toBe(403);
  });

  it('lets an admin accept on a host\'s behalf', async () => {
    const { listing } = await homestayWithHost('Absent Host');
    const { token: guest } = await registerUser({ name: 'Guest Four' });
    const bookingId = await requestBooking(guest, listing.id, '2030-04-10', '2030-04-12');

    const admin = await loginAdmin();
    const res = await request(app)
      .patch(`/api/bookings/${bookingId}/confirm`)
      .set('Authorization', `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('accepted');
  });

  it('is idempotent — accepting twice is not an error', async () => {
    const { hostToken, listing } = await homestayWithHost('Twice Host');
    const { token: guest } = await registerUser({ name: 'Guest Five' });
    const bookingId = await requestBooking(guest, listing.id, '2030-05-10', '2030-05-12');

    const first = await request(app).patch(`/api/bookings/${bookingId}/confirm`).set('Authorization', `Bearer ${hostToken}`);
    const second = await request(app).patch(`/api/bookings/${bookingId}/confirm`).set('Authorization', `Bearer ${hostToken}`);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.booking.accepted_at).toBe(first.body.booking.accepted_at);
  });

  it('409s on a cancelled booking', async () => {
    const { hostToken, listing } = await homestayWithHost('Too Late Host');
    const { token: guest } = await registerUser({ name: 'Guest Six' });
    const bookingId = await requestBooking(guest, listing.id, '2030-06-10', '2030-06-12');

    await request(app).patch(`/api/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${guest}`);

    const res = await request(app).patch(`/api/bookings/${bookingId}/confirm`).set('Authorization', `Bearer ${hostToken}`);
    expect(res.status).toBe(409);
  });

  it('treats an already-confirmed booking as a success, not a race to lose', async () => {
    const { hostToken, listing } = await homestayWithHost('Fast Guest Host');
    const { token: guest } = await registerUser({ name: 'Guest Seven' });
    const bookingId = await requestBooking(guest, listing.id, '2030-07-10', '2030-07-12');

    // The guest pays before the host gets to the request — normal on an instant-confirm rate.
    const order = await request(app).post('/api/payments/order')
      .set('Authorization', `Bearer ${guest}`)
      .send({ flow: 'booking_commission', reference_id: bookingId });
    await request(app).post('/api/payments/mock/complete')
      .set('Authorization', `Bearer ${guest}`)
      .send({ order_id: order.body.order.id, flow: 'booking_commission', reference_id: bookingId });

    const res = await request(app).patch(`/api/bookings/${bookingId}/confirm`).set('Authorization', `Bearer ${hostToken}`);
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('confirmed');
  });

  it('holds the dates against another guest once accepted', async () => {
    const { hostToken, listing } = await homestayWithHost('Exclusive Host');
    const { token: first } = await registerUser({ name: 'First Guest' });
    const { token: second } = await registerUser({ name: 'Second Guest' });

    const bookingId = await requestBooking(first, listing.id, '2030-08-10', '2030-08-12');
    const accept = await request(app).patch(`/api/bookings/${bookingId}/confirm`).set('Authorization', `Bearer ${hostToken}`);
    expect(accept.status).toBe(200);

    const clash = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${second}`)
      .send({ listing_id: listing.id, listing_type: 'homestay', check_in: '2030-08-11', check_out: '2030-08-13' });
    expect(clash.status).toBe(409);
  });

  it('still allows a back-to-back booking that starts the day the accepted one ends', async () => {
    const { hostToken, listing } = await homestayWithHost('Turnover Host');
    const { token: first } = await registerUser({ name: 'Leaving Guest' });
    const { token: second } = await registerUser({ name: 'Arriving Guest' });

    const bookingId = await requestBooking(first, listing.id, '2030-09-10', '2030-09-12');
    await request(app).patch(`/api/bookings/${bookingId}/confirm`).set('Authorization', `Bearer ${hostToken}`);

    const next = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${second}`)
      .send({ listing_id: listing.id, listing_type: 'homestay', check_in: '2030-09-12', check_out: '2030-09-14' });
    expect(next.status).toBe(200);
  });

  it('confirms normally once the accepted booking is paid for', async () => {
    const { hostToken, listing } = await homestayWithHost('Paid Host');
    const { token: guest } = await registerUser({ name: 'Paying Guest' });
    const bookingId = await requestBooking(guest, listing.id, '2030-10-10', '2030-10-12');

    await request(app).patch(`/api/bookings/${bookingId}/confirm`).set('Authorization', `Bearer ${hostToken}`);

    const order = await request(app).post('/api/payments/order')
      .set('Authorization', `Bearer ${guest}`)
      .send({ flow: 'booking_commission', reference_id: bookingId });
    const done = await request(app).post('/api/payments/mock/complete')
      .set('Authorization', `Bearer ${guest}`)
      .send({ order_id: order.body.order.id, flow: 'booking_commission', reference_id: bookingId });
    expect(done.status).toBe(200);

    const mine = await request(app).get('/api/bookings/me').set('Authorization', `Bearer ${guest}`);
    const row = mine.body.items.find((b: any) => b.id === bookingId);
    expect(row.status).toBe('confirmed');
    // The acceptance is still on the record after payment — it is history, not a transient flag.
    expect(row.accepted_at).toBeTruthy();
  });

  it('lets the host decline instead, which cancels', async () => {
    const { hostToken, listing } = await homestayWithHost('Declining Host');
    const { token: guest } = await registerUser({ name: 'Rejected Guest' });
    const bookingId = await requestBooking(guest, listing.id, '2030-11-10', '2030-11-12');

    const res = await request(app).patch(`/api/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${hostToken}`);
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('cancelled');
  });

  it('counts accepted separately from pending in the provider inbox', async () => {
    const { hostToken, listing } = await homestayWithHost('Counting Host');
    const { token: guest } = await registerUser({ name: 'Counted Guest' });

    const accepted = await requestBooking(guest, listing.id, '2030-12-01', '2030-12-03');
    await requestBooking(guest, listing.id, '2030-12-20', '2030-12-22');
    await request(app).patch(`/api/bookings/${accepted}/confirm`).set('Authorization', `Bearer ${hostToken}`);

    const inbox = await request(app).get('/api/bookings/provider').set('Authorization', `Bearer ${hostToken}`);
    expect(inbox.status).toBe(200);
    expect(inbox.body.stats.accepted).toBe(1);
    expect(inbox.body.stats.pending).toBe(1);
    expect(inbox.body.items.find((b: any) => b.id === accepted).accepted_at).toBeTruthy();
  });
});
