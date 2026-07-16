import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, createListing, onboardActiveProvider, createConfirmedBooking } from './helpers';

describe('bookings', () => {
  it('creates a non-homestay booking without dates', async () => {
    const { token } = await registerUser({ name: 'Spot Booker' });
    const listing = await createListing();
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id, listing_type: 'spot' });
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('pending_payment');
  });

  it('requires check-in/check-out dates for homestay bookings', async () => {
    const { token } = await registerUser({ name: 'Homestay Booker' });
    const listing = await createListing({ title: 'A Homestay' });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id, listing_type: 'homestay' });
    expect(res.status).toBe(400);
  });

  it('rejects a homestay booking where check-out is not after check-in', async () => {
    const { token } = await registerUser({ name: 'Bad Dates Booker' });
    const listing = await createListing({ title: 'Another Homestay' });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        listing_id: listing.id,
        listing_type: 'homestay',
        check_in: '2026-08-10',
        check_out: '2026-08-09',
      });
    expect(res.status).toBe(400);
  });

  it('accepts a valid homestay date range', async () => {
    const { token } = await registerUser({ name: 'Good Dates Booker' });
    const listing = await createListing({ title: 'Yet Another Homestay' });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        listing_id: listing.id,
        listing_type: 'homestay',
        check_in: '2026-08-09',
        check_out: '2026-08-10',
      });
    expect(res.status).toBe(200);
  });

  it('404s booking an unknown listing', async () => {
    const { token } = await registerUser({ name: 'Ghost Booker' });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: 'does-not-exist', listing_type: 'spot' });
    expect(res.status).toBe(404);
  });

  it('rejects a homestay booking that overlaps an existing confirmed booking', async () => {
    const { token: firstGuest } = await registerUser({ name: 'First Guest' });
    const listing = await createListing({ title: 'Overlap Test Homestay' });
    await createConfirmedBooking({
      token: firstGuest,
      listingId: listing.id,
      listingType: 'homestay',
      checkIn: '2026-10-10',
      checkOut: '2026-10-15',
    });

    const { token: secondGuest } = await registerUser({ name: 'Second Guest' });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${secondGuest}`)
      .send({
        listing_id: listing.id,
        listing_type: 'homestay',
        check_in: '2026-10-12',
        check_out: '2026-10-18',
      });

    expect(res.status).toBe(409);
  });

  it('allows a homestay booking for non-overlapping dates on the same listing', async () => {
    const { token: firstGuest } = await registerUser({ name: 'Early Guest' });
    const listing = await createListing({ title: 'Non-Overlap Test Homestay' });
    await createConfirmedBooking({
      token: firstGuest,
      listingId: listing.id,
      listingType: 'homestay',
      checkIn: '2026-11-01',
      checkOut: '2026-11-05',
    });

    const { token: secondGuest } = await registerUser({ name: 'Later Guest' });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${secondGuest}`)
      .send({
        listing_id: listing.id,
        listing_type: 'homestay',
        check_in: '2026-11-05',
        check_out: '2026-11-08',
      });

    expect(res.status).toBe(200);
  });

  it('does not block overlapping dates when the existing booking is only pending_payment (not yet confirmed)', async () => {
    const { token: firstGuest } = await registerUser({ name: 'Unpaid Guest' });
    const listing = await createListing({ title: 'Pending Overlap Homestay' });
    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${firstGuest}`)
      .send({ listing_id: listing.id, listing_type: 'homestay', check_in: '2026-12-01', check_out: '2026-12-05' });

    const { token: secondGuest } = await registerUser({ name: 'Second Unpaid Guest' });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${secondGuest}`)
      .send({ listing_id: listing.id, listing_type: 'homestay', check_in: '2026-12-02', check_out: '2026-12-04' });

    expect(res.status).toBe(200);
  });

  it('returns only the caller\'s own bookings from /bookings/me', async () => {
    const { token: tokenA } = await registerUser({ name: 'Own Bookings A' });
    const { token: tokenB } = await registerUser({ name: 'Own Bookings B' });
    const listing = await createListing();

    await request(app).post('/api/bookings').set('Authorization', `Bearer ${tokenA}`)
      .send({ listing_id: listing.id, listing_type: 'spot' });

    const resA = await request(app).get('/api/bookings/me').set('Authorization', `Bearer ${tokenA}`);
    const resB = await request(app).get('/api/bookings/me').set('Authorization', `Bearer ${tokenB}`);

    expect(resA.body.items.length).toBe(1);
    expect(resB.body.items.length).toBe(0);
  });

  it('shows a provider their received bookings with stats', async () => {
    const { token: providerToken, providerId } = await onboardActiveProvider({ name: 'Booked Provider' });
    const listingRes = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${providerToken}`)
      .send({ title: 'Provider Owned Spot', type: 'homestay', description: 'x', location: 'y' });
    const listing = listingRes.body.item;

    const { token: touristToken } = await registerUser({ name: 'Booking Tourist' });
    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${touristToken}`)
      .send({ listing_id: listing.id, listing_type: 'homestay', check_in: '2026-09-01', check_out: '2026-09-02' });

    const res = await request(app)
      .get('/api/bookings/provider')
      .set('Authorization', `Bearer ${providerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.stats.total).toBe(1);
    expect(res.body.items[0].listing.provider_id).toBe(providerId);
  });
});
