import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { eq } from 'drizzle-orm';
import { db, schema } from '../src/db';
import { registerUser, createListing, onboardActiveProvider, createConfirmedBooking, inDays } from './helpers';

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
    const listing = await createListing({ title: 'A Homestay', type: 'homestay' });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id, listing_type: 'homestay' });
    expect(res.status).toBe(400);
  });

  it('rejects a homestay booking where check-out is not after check-in', async () => {
    const { token } = await registerUser({ name: 'Bad Dates Booker' });
    const listing = await createListing({ title: 'Another Homestay', type: 'homestay' });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        listing_id: listing.id,
        listing_type: 'homestay',
        check_in: inDays(11),
        check_out: inDays(10),
      });
    expect(res.status).toBe(400);
  });

  it('accepts a valid homestay date range', async () => {
    const { token } = await registerUser({ name: 'Good Dates Booker' });
    const listing = await createListing({ title: 'Yet Another Homestay', type: 'homestay' });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        listing_id: listing.id,
        listing_type: 'homestay',
        check_in: inDays(10),
        check_out: inDays(11),
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
    const listing = await createListing({ title: 'Overlap Test Homestay', type: 'homestay' });
    await createConfirmedBooking({
      token: firstGuest,
      listingId: listing.id,
      listingType: 'homestay',
      checkIn: inDays(52),
      checkOut: inDays(57),
    });

    const { token: secondGuest } = await registerUser({ name: 'Second Guest' });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${secondGuest}`)
      .send({
        listing_id: listing.id,
        listing_type: 'homestay',
        check_in: inDays(54),
        check_out: inDays(60),
      });

    expect(res.status).toBe(409);
  });

  it('allows a homestay booking for non-overlapping dates on the same listing', async () => {
    const { token: firstGuest } = await registerUser({ name: 'Early Guest' });
    const listing = await createListing({ title: 'Non-Overlap Test Homestay', type: 'homestay' });
    await createConfirmedBooking({
      token: firstGuest,
      listingId: listing.id,
      listingType: 'homestay',
      checkIn: inDays(74),
      checkOut: inDays(78),
    });

    const { token: secondGuest } = await registerUser({ name: 'Later Guest' });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${secondGuest}`)
      .send({
        listing_id: listing.id,
        listing_type: 'homestay',
        check_in: inDays(78),
        check_out: inDays(81),
      });

    expect(res.status).toBe(200);
  });

  // This pair replaces a test that asserted overlapping pending_payment bookings were ALWAYS
  // allowed. That was the double-booking bug written down as an expectation: it let two guests
  // both open checkout for the same nights, and nothing downstream stopped them both paying.
  // The rule now is a time-boxed hold  see lib/bookingAvailability.ts.
  it('holds the dates against another guest while a checkout is still in its hold window', async () => {
    const { token: firstGuest } = await registerUser({ name: 'Unpaid Guest' });
    const listing = await createListing({ title: 'Pending Overlap Homestay', type: 'homestay' });
    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${firstGuest}`)
      .send({ listing_id: listing.id, listing_type: 'homestay', check_in: inDays(101), check_out: inDays(105) });

    const { token: secondGuest } = await registerUser({ name: 'Second Unpaid Guest' });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${secondGuest}`)
      .send({ listing_id: listing.id, listing_type: 'homestay', check_in: inDays(102), check_out: inDays(104) });

    expect(res.status).toBe(409);
  });

  it('releases the dates once an abandoned checkout falls outside the hold window', async () => {
    const { token: firstGuest } = await registerUser({ name: 'Abandoning Guest' });
    const listing = await createListing({ title: 'Expired Hold Homestay', type: 'homestay' });
    const created = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${firstGuest}`)
      .send({ listing_id: listing.id, listing_type: 'homestay', check_in: inDays(125), check_out: inDays(129) });
    expect(created.status).toBe(200);

    // Backdate the abandoned checkout past the hold window. Reaching into the DB is the point:
    // the alternative is making the suite wait BOOKING_HOLD_MINUTES in real time.
    const longAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await db.update(schema.bookings)
      .set({ createdAt: longAgo })
      .where(eq(schema.bookings.id, created.body.booking.id));

    const { token: secondGuest } = await registerUser({ name: 'Patient Guest' });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${secondGuest}`)
      .send({ listing_id: listing.id, listing_type: 'homestay', check_in: inDays(126), check_out: inDays(128) });

    expect(res.status).toBe(200);
  });

  it('does not hold dates for listing types that are not date-exclusive', async () => {
    // A driver can take two fares on one day and a café does not run out of dates  the hold
    // applies to homestays only, so this must not regress into blocking everything.
    const { token: firstGuest } = await registerUser({ name: 'First Rider' });
    const listing = await createListing({ title: 'Shared Driver' });
    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${firstGuest}`)
      .send({ listing_id: listing.id, listing_type: 'driver', check_in: inDays(147), check_out: inDays(148) });

    const { token: secondGuest } = await registerUser({ name: 'Second Rider' });
    const res = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${secondGuest}`)
      .send({ listing_id: listing.id, listing_type: 'driver', check_in: inDays(147), check_out: inDays(148) });

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
      .send({ title: 'Provider Owned Spot', type: 'homestay', description: 'x', location: 'Darjeeling', price: 1500 });
    const listing = listingRes.body.item;

    const { token: touristToken } = await registerUser({ name: 'Booking Tourist' });
    await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${touristToken}`)
      .send({ listing_id: listing.id, listing_type: 'homestay', check_in: inDays(31), check_out: inDays(33), guests: 2 });

    const res = await request(app)
      .get('/api/bookings/provider')
      .set('Authorization', `Bearer ${providerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.stats.total).toBe(1);
    expect(res.body.items[0].listing.provider_id).toBe(providerId);
    // Rate x guests x nights, for a dashboard scoped to one listing: 1500 x 2 x 2.
    expect(res.body.items[0].amount).toBe(6000);
  });
});
