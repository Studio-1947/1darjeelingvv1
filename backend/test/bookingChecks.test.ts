import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { createConfirmedBooking, createListing, inDays, loginAdmin, registerUser } from './helpers';

// The audit of 6 Nov 2026: POST /bookings trusted the client's listing_type, and took any dates
// and any guest count. Each case below is one way that was used.
const book = (token: string, body: Record<string, unknown>) =>
  request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`).send(body);

describe('booking checks', () => {
  it('cannot dodge the clash check by calling a homestay a driver', async () => {
    const listing = await createListing({ title: 'Clash Homestay', type: 'homestay' });
    const first = await registerUser({ name: 'First Guest' });
    await createConfirmedBooking({ token: first.token, listingId: listing.id, listingType: 'homestay', checkIn: inDays(10), checkOut: inDays(12) });

    const second = await registerUser({ name: 'Second Guest' });
    for (const claimed of ['driver', 'guide', 'spot', undefined]) {
      const res = await book(second.token, { listing_id: listing.id, listing_type: claimed, check_in: inDays(10), check_out: inDays(12) });
      expect(res.status, `claimed ${claimed}`).toBe(409);
      expect(res.body.code).toBe('dates_taken');
    }
  });

  it('still needs homestay dates when the request claims another type', async () => {
    const listing = await createListing({ title: 'Dateless Homestay', type: 'homestay' });
    const { token } = await registerUser({ name: 'No Dates' });
    const res = await book(token, { listing_id: listing.id, listing_type: 'driver' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('dates_required');
  });

  it("saves the listing's own type, whatever the request said", async () => {
    const listing = await createListing({ title: 'Typed Homestay', type: 'homestay' });
    const { token } = await registerUser({ name: 'Type Saver' });
    const res = await book(token, { listing_id: listing.id, listing_type: 'driver', check_in: inDays(20), check_out: inDays(21) });
    expect(res.status).toBe(200);
    expect(res.body.booking.listing_type).toBe('homestay');
    const [row] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, res.body.booking.id));
    expect(row.listingType).toBe('homestay');
  });

  it.each([
    [{ check_in: '2020-01-01', check_out: '2020-01-03' }, 'date_in_past'],
    [{ check_in: 'abc', check_out: 'def' }, 'bad_date'],
    [{ check_in: '2026-02-30', check_out: '2026-03-02' }, 'bad_date'],
    [{ check_in: inDays(400), check_out: inDays(401) }, 'too_far_ahead'],
    [{ check_in: inDays(5), check_out: inDays(40) }, 'stay_too_long'],
  ])('refuses homestay dates %j', async (dates, code) => {
    const listing = await createListing({ title: 'Date Rules Homestay', type: 'homestay' });
    const { token } = await registerUser({ name: 'Date Tester' });
    const res = await book(token, { listing_id: listing.id, ...dates });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(code);
  });

  it.each([-5, 0, 9999, 'lots'])('refuses %j guests', async (guests) => {
    const listing = await createListing({ title: 'Small Homestay', type: 'homestay', extras: { capacity: 4 } });
    const { token } = await registerUser({ name: 'Guest Counter' });
    const res = await book(token, { listing_id: listing.id, check_in: inDays(3), check_out: inDays(4), guests });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('bad_guests');
  });

  it('takes up to the listing capacity and sends max_guests on the listing', async () => {
    const listing = await createListing({ title: 'Four Guest Homestay', type: 'homestay', extras: { capacity: 4 } });
    const got = await request(app).get(`/api/listings/${listing.id}`);
    expect((got.body.item ?? got.body).max_guests).toBe(4);
    const { token } = await registerUser({ name: 'Full House' });
    const res = await book(token, { listing_id: listing.id, check_in: inDays(3), check_out: inDays(4), guests: 4 });
    expect(res.status).toBe(200);
    expect(res.body.booking.guests).toBe(4);
  });

  it('tells a traveller their own request already holds the dates', async () => {
    const listing = await createListing({ title: 'Asked Twice Homestay', type: 'homestay' });
    const { token } = await registerUser({ name: 'Asks Twice' });
    const first = await book(token, { listing_id: listing.id, check_in: inDays(30), check_out: inDays(32) });
    expect(first.status).toBe(200);
    const again = await book(token, { listing_id: listing.id, check_in: inDays(30), check_out: inDays(32) });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('already_requested');
    expect(again.body.booking_id).toBe(first.body.booking.id);
  });

  it('will not accept or confirm a request saved earlier with a date that has passed', async () => {
    const listing = await createListing({ title: 'Old Request Homestay', type: 'homestay' });
    const { token } = await registerUser({ name: 'Old Request' });
    const made = await book(token, { listing_id: listing.id, check_in: inDays(50), check_out: inDays(51) });
    expect(made.status).toBe(200);
    // What a request saved before the date checks looks like.
    await db.update(schema.bookings).set({ checkIn: '2020-01-01', checkOut: '2020-01-02' })
      .where(eq(schema.bookings.id, made.body.booking.id));

    const checkout = await request(app).post(`/api/bookings/${made.body.booking.id}/checkout`).set('Authorization', `Bearer ${token}`);
    expect(checkout.status).toBe(409);
    expect(checkout.body.code).toBe('date_in_past');

    const admin = await loginAdmin();
    const accept = await request(app).patch(`/api/bookings/${made.body.booking.id}/confirm`).set('Authorization', `Bearer ${admin}`);
    expect(accept.status).toBe(409);
    expect(accept.body.code).toBe('date_in_past');
  });

  it('refuses notes that are not text', async () => {
    const listing = await createListing({ title: 'Notes Spot' });
    const { token } = await registerUser({ name: 'Note Writer' });
    const res = await book(token, { listing_id: listing.id, notes: { evil: true } });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('bad_notes');
  });
});

describe('availability marks the viewer\'s own nights', () => {
  it('says "mine" only to the person who asked for them', async () => {
    const listing = await createListing({ title: 'Mine Homestay', type: 'homestay' });
    const asker = await registerUser({ name: 'Asker' });
    const other = await registerUser({ name: 'Other Person' });
    const made = await book(asker.token, { listing_id: listing.id, check_in: inDays(80), check_out: inDays(81) });
    expect(made.status).toBe(200);
    const q = `/api/listings/${listing.id}/availability?from=${inDays(79)}&to=${inDays(82)}`;
    const mine = await request(app).get(q).set('Authorization', `Bearer ${asker.token}`);
    expect(mine.body.ranges).toEqual([expect.objectContaining({ check_in: inDays(80), mine: true })]);
    const theirs = await request(app).get(q).set('Authorization', `Bearer ${other.token}`);
    expect(theirs.body.ranges[0].mine).toBeUndefined();
    const anon = await request(app).get(q);
    expect(anon.body.ranges[0].mine).toBeUndefined();
  });
});
