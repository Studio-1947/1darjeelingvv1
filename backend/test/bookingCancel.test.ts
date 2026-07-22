import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, createListing, onboardActiveProvider } from './helpers';

async function createBooking(token: string, listingId: string) {
  const res = await request(app).post('/api/bookings')
    .set('Authorization', `Bearer ${token}`)
    .send({ listing_id: listingId, listing_type: 'spot' });
  expect(res.status).toBe(200);
  return res.body.booking.id as string;
}

describe('booking cancellation', () => {
  it('404s cancelling an unknown booking', async () => {
    const { token } = await registerUser({ name: 'Cancel Ghost' });
    const res = await request(app).patch('/api/bookings/does-not-exist/cancel').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  it('lets the traveller cancel their own booking', async () => {
    const { token } = await registerUser({ name: 'Self Canceller' });
    const listing = await createListing();
    const bookingId = await createBooking(token, listing.id);

    const res = await request(app).patch(`/api/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('cancelled');

    const mine = await request(app).get('/api/bookings/me').set('Authorization', `Bearer ${token}`);
    expect(mine.body.items.find((b: any) => b.id === bookingId).status).toBe('cancelled');
  });

  it('forbids a different traveller from cancelling someone else\'s booking', async () => {
    const { token: owner } = await registerUser({ name: 'Booking Maker' });
    const { token: stranger } = await registerUser({ name: 'Nosy Stranger' });
    const listing = await createListing();
    const bookingId = await createBooking(owner, listing.id);

    const res = await request(app).patch(`/api/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${stranger}`);
    expect(res.status).toBe(403);
  });

  it('lets the provider who owns the listing cancel (decline) a booking on it', async () => {
    const { token: providerToken } = await onboardActiveProvider({ name: 'Declining Provider' });
    const listingRes = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ title: 'Provider Spot For Cancel', type: 'spot', description: 'x', location: 'y' });
    const listingId = listingRes.body.item.id;

    const { token: tourist } = await registerUser({ name: 'Booked Tourist' });
    const bookingId = await createBooking(tourist, listingId);

    const res = await request(app).patch(`/api/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${providerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('cancelled');
  });

  it('is idempotent — cancelling an already-cancelled booking succeeds', async () => {
    const { token } = await registerUser({ name: 'Double Canceller' });
    const listing = await createListing();
    const bookingId = await createBooking(token, listing.id);

    await request(app).patch(`/api/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${token}`);
    const second = await request(app).patch(`/api/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${token}`);
    expect(second.status).toBe(200);
    expect(second.body.booking.status).toBe('cancelled');
  });
});
