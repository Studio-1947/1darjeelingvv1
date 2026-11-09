import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { reviewEligibility } from '../src/lib/reviewRules';
import { createConfirmedBooking, createListing, inDays, registerUser } from './helpers';

/**
 * Audit 2026-11-08: with the pass at ₹1, any pass holder could post a review on any homestay
 * without ever staying there. Homestays, drivers and guides now need a completed booking; cafes,
 * shops and public places stay open to pass holders, since people walk into those.
 */
async function review(token: string, listingId: string, rating = 4) {
  return request(app).post('/api/reviews').set('Authorization', `Bearer ${token}`).send({ listing_id: listingId, rating, comment: 'test' });
}

describe('reviewEligibility', () => {
  it('lets anyone review after a completed booking, even without the pass', () => {
    expect(reviewEligibility({ listingType: 'homestay', hasCompletedBooking: true, hasPass: false })).toEqual({ allowed: true });
  });
  it('needs a completed booking for homestays, drivers and guides, pass or not', () => {
    for (const listingType of ['homestay', 'driver', 'guide']) {
      expect(reviewEligibility({ listingType, hasCompletedBooking: false, hasPass: true })).toMatchObject({ allowed: false, code: 'stay_required' });
    }
  });
  it('lets pass holders review cafes, shops and places', () => {
    for (const listingType of ['cafe', 'shop', 'spot', 'event', 'biodiversity']) {
      expect(reviewEligibility({ listingType, hasCompletedBooking: false, hasPass: true })).toEqual({ allowed: true });
      expect(reviewEligibility({ listingType, hasCompletedBooking: false, hasPass: false })).toMatchObject({ allowed: false, code: 'support_required' });
    }
  });
});

describe('POST /reviews: who may review', () => {
  it('refuses a pass holder who never stayed at a homestay (403 stay_required)', async () => {
    const { token } = await registerUser({ name: 'Never Stayed' });
    const listing = await createListing({ title: 'Eligibility Homestay', type: 'homestay' });
    const res = await review(token, listing.id, 1);
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('stay_required');
    const list = await request(app).get(`/api/reviews/listing/${listing.id}`);
    expect(list.body.summary.count).toBe(0);
  });

  it('refuses a driver review without a completed ride', async () => {
    const { token } = await registerUser({ name: 'No Ride' });
    const listing = await createListing({ title: 'Eligibility Driver', type: 'driver' });
    expect((await review(token, listing.id)).body.code).toBe('stay_required');
  });

  it('refuses a booking that is confirmed but not over yet', async () => {
    const { token } = await registerUser({ name: 'Upcoming Guest' });
    const listing = await createListing({ title: 'Eligibility Upcoming', type: 'homestay' });
    await createConfirmedBooking({ token, listingId: listing.id, listingType: 'homestay', checkIn: inDays(5), checkOut: inDays(6) });
    expect((await review(token, listing.id)).status).toBe(403);
  });

  it('accepts a review after a completed stay', async () => {
    const { token, user } = await registerUser({ name: 'Real Guest', paySupport: false });
    const listing = await createListing({ title: 'Eligibility Stayed', type: 'homestay' });
    // Booking needs the pass or the fee; a fresh paid user books, then the stay is moved into the past.
    const payer = await registerUser({ name: 'Booker' });
    const bookingId = await createConfirmedBooking({ token: payer.token, listingId: listing.id, listingType: 'homestay', checkIn: inDays(5), checkOut: inDays(6) });
    await db.update(schema.bookings)
      .set({ userId: user.id, checkIn: inDays(-3), checkOut: inDays(-2) })
      .where(eq(schema.bookings.id, bookingId));
    const res = await review(token, listing.id, 5);
    expect(res.status).toBe(200);
    expect(res.body.review.rating).toBe(5);
  });

  it('still lets a pass holder review a cafe they walked into', async () => {
    const { token } = await registerUser({ name: 'Cafe Visitor' });
    const listing = await createListing({ title: 'Eligibility Cafe', type: 'cafe' });
    expect((await review(token, listing.id)).status).toBe(200);
  });

  it('still asks for the pass on a place when there is none (402)', async () => {
    const { token } = await registerUser({ name: 'No Pass', paySupport: false });
    const listing = await createListing({ title: 'Eligibility Spot' });
    const res = await review(token, listing.id);
    expect(res.status).toBe(402);
    expect(res.body.code).toBe('support_required');
  });
});

describe('GET /reviews/listing/:id says whether the reader may review', () => {
  it('is null when signed out', async () => {
    const listing = await createListing({ title: 'Eligibility Read', type: 'homestay' });
    const res = await request(app).get(`/api/reviews/listing/${listing.id}`);
    expect(res.body.can_review).toBeNull();
  });

  it('says stay_required for a homestay never stayed at, and allowed for a cafe', async () => {
    const { token } = await registerUser({ name: 'Reader' });
    const homestay = await createListing({ title: 'Eligibility Read Homestay', type: 'homestay' });
    const cafe = await createListing({ title: 'Eligibility Read Cafe', type: 'cafe' });
    const h = await request(app).get(`/api/reviews/listing/${homestay.id}`).set('Authorization', `Bearer ${token}`);
    expect(h.body.can_review).toEqual({ allowed: false, code: 'stay_required' });
    const c = await request(app).get(`/api/reviews/listing/${cafe.id}`).set('Authorization', `Bearer ${token}`);
    expect(c.body.can_review).toEqual({ allowed: true });
  });
});
