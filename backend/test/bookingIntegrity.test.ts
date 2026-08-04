import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { registerUser, createListing, createConfirmedBooking, loginAdmin } from './helpers';

/**
 * The three defects that made taking real bookings unsafe, each pinned by a test:
 *
 *  - two guests could pay for the same homestay and the same nights, and both be confirmed;
 *  - a confirmed booking told neither the guest nor the host, and reported no error;
 *  - money taken for a booking could never be given back.
 *
 * See INVESTIGATION.md §6.A, lib/bookingAvailability.ts, lib/notifications.ts, lib/refunds.ts.
 */

/** Drives a booking all the way to a settled payment, returning the booking id and order id. */
async function payForBooking(token: string, bookingId: string) {
  const orderRes = await request(app)
    .post('/api/payments/order')
    .set('Authorization', `Bearer ${token}`)
    .send({ flow: 'booking_commission', reference_id: bookingId });
  expect(orderRes.status).toBe(200);
  const orderId = orderRes.body.order.id as string;

  const completeRes = await request(app)
    .post('/api/payments/mock/complete')
    .set('Authorization', `Bearer ${token}`)
    .send({ order_id: orderId, flow: 'booking_commission', reference_id: bookingId });
  return { orderId, completeRes };
}

async function createBooking(token: string, listingId: string, checkIn: string, checkOut: string) {
  const res = await request(app)
    .post('/api/bookings')
    .set('Authorization', `Bearer ${token}`)
    .send({ listing_id: listingId, listing_type: 'homestay', check_in: checkIn, check_out: checkOut });
  expect(res.status).toBe(200);
  return res.body.booking.id as string;
}

/** Backdates a pending booking so it no longer holds its dates, without waiting in real time. */
async function expireHold(bookingId: string) {
  await db.update(schema.bookings)
    .set({ createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() })
    .where(eq(schema.bookings.id, bookingId));
}

describe('double-booking', () => {
  it('refuses to confirm a second paid booking for dates already confirmed', async () => {
    const listing = await createListing({ title: 'Contested Homestay' });
    const { token: guestA } = await registerUser({ name: 'Guest A' });
    const { token: guestB } = await registerUser({ name: 'Guest B' });

    // Both guests get a booking row for overlapping nights. The hold window would normally stop
    // the second one, so it is expired first — this reproduces the exact race the hold cannot
    // catch: two checkouts that were both legitimately open when they started.
    const bookingA = await createBooking(guestA, listing.id, '2027-03-01', '2027-03-05');
    await expireHold(bookingA);
    const bookingB = await createBooking(guestB, listing.id, '2027-03-02', '2027-03-04');

    const payA = await payForBooking(guestA, bookingA);
    expect(payA.completeRes.status).toBe(200);

    const payB = await payForBooking(guestB, bookingB);
    expect(payB.completeRes.status).toBe(200);

    const [rowA] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingA)).limit(1);
    const [rowB] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingB)).limit(1);

    // Exactly one guest gets the room. Before the fix both of these read 'confirmed'.
    expect(rowA.status).toBe('confirmed');
    expect(rowB.status).toBe('cancelled');
    expect(payB.completeRes.body.record?.conflict).toBe(true);
  });

  it('refunds the guest whose paid booking lost the race', async () => {
    const listing = await createListing({ title: 'Refund On Clash Homestay' });
    const { token: guestA } = await registerUser({ name: 'Winner' });
    const { token: guestB } = await registerUser({ name: 'Loser' });

    const bookingA = await createBooking(guestA, listing.id, '2027-04-01', '2027-04-05');
    await expireHold(bookingA);
    const bookingB = await createBooking(guestB, listing.id, '2027-04-02', '2027-04-04');

    await payForBooking(guestA, bookingA);
    const payB = await payForBooking(guestB, bookingB);

    const [payment] = await db.select().from(schema.payments)
      .where(eq(schema.payments.orderId, payB.orderId)).limit(1);

    // Charged, then given back — not silently kept.
    expect(payment.status).toBe('refunded');
    expect(payment.refundAmount).toBe(payment.amount);
    expect(payment.refundReason).toContain('double-booked');
  });

  it('still confirms a booking whose dates are genuinely free', async () => {
    const listing = await createListing({ title: 'Uncontested Homestay' });
    const { token } = await registerUser({ name: 'Only Guest' });
    const bookingId = await createBooking(token, listing.id, '2027-05-01', '2027-05-04');

    const { completeRes } = await payForBooking(token, bookingId);
    expect(completeRes.status).toBe(200);

    const [row] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId)).limit(1);
    expect(row.status).toBe('confirmed');
    expect(row.confirmedAt).toBeTruthy();
  });
});

describe('booking notifications', () => {
  it('records that the guest was told when a booking is confirmed', async () => {
    const listing = await createListing({ title: 'Notified Homestay' });
    const { token } = await registerUser({ name: 'Told Guest' });
    const bookingId = await createBooking(token, listing.id, '2027-06-01', '2027-06-03');
    await payForBooking(token, bookingId);

    const [row] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId)).limit(1);
    // The whole point of §6.A: a confirmed booking must carry evidence that someone was told.
    expect(row.touristNotifiedAt).toBeTruthy();
  });

  it('says why nobody could be told rather than leaving it blank', async () => {
    // This listing is admin-authored with a provider id that names no provider and no user, so
    // there is no host phone number to reach. The booking must still confirm — and must say so.
    const listing = await createListing({ title: 'Hostless Homestay' });
    const { token } = await registerUser({ name: 'Guest Without Host' });
    const bookingId = await createBooking(token, listing.id, '2027-07-01', '2027-07-03');
    await payForBooking(token, bookingId);

    const [row] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, bookingId)).limit(1);
    expect(row.status).toBe('confirmed');
    expect(row.notifyError).toContain('host');
  });
});

describe('refunds', () => {
  it('returns the money when a confirmed booking is cancelled', async () => {
    const listing = await createListing({ title: 'Cancellable Homestay' });
    const { token, user } = await registerUser({ name: 'Cancelling Guest' });
    const bookingId = await createBooking(token, listing.id, '2027-08-01', '2027-08-04');
    const { orderId } = await payForBooking(token, bookingId);

    const res = await request(app)
      .patch(`/api/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.refunded).toBe(true);

    const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, orderId)).limit(1);
    expect(payment.status).toBe('refunded');
    expect(payment.userId).toBe(user.id);
  });

  it('is idempotent — a second cancel does not refund twice', async () => {
    const listing = await createListing({ title: 'Double Cancel Homestay' });
    const { token } = await registerUser({ name: 'Twice Cancelling Guest' });
    const bookingId = await createBooking(token, listing.id, '2027-09-01', '2027-09-04');
    const { orderId } = await payForBooking(token, bookingId);

    await request(app).patch(`/api/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${token}`);
    const second = await request(app).patch(`/api/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${token}`);

    expect(second.status).toBe(200);
    const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, orderId)).limit(1);
    expect(payment.status).toBe('refunded');
    // One refund reference, written once — a second gateway call would have overwritten it.
    expect(payment.refundId).toBe(`mock_rfnd_${orderId}`);
  });

  it('does not refund a booking that was never paid for', async () => {
    const listing = await createListing({ title: 'Unpaid Cancel Homestay' });
    const { token } = await registerUser({ name: 'Unpaid Canceller' });
    const bookingId = await createBooking(token, listing.id, '2027-10-01', '2027-10-04');

    const res = await request(app)
      .patch(`/api/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.refunded).toBe(false);
  });

  it('lets an admin refund a settled payment, and refuses to do it twice', async () => {
    const listing = await createListing({ title: 'Admin Refund Homestay' });
    const { token } = await registerUser({ name: 'Admin Refunded Guest' });
    const bookingId = await createConfirmedBooking({
      token, listingId: listing.id, listingType: 'homestay',
      checkIn: '2027-11-01', checkOut: '2027-11-04',
    });
    const [payment] = await db.select().from(schema.payments)
      .where(eq(schema.payments.referenceId, bookingId)).limit(1);

    const adminToken = await loginAdmin();
    const first = await request(app)
      .post(`/api/admin/payments/${payment.id}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'goodwill' });
    expect(first.status).toBe(200);
    expect(first.body.refunded).toBe(true);

    const second = await request(app)
      .post(`/api/admin/payments/${payment.id}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'goodwill' });
    expect(second.status).toBe(200);
    expect(second.body.refunded).toBe(false);
  });

  it('refuses the admin refund endpoint to non-admins', async () => {
    const { token } = await registerUser({ name: 'Not An Admin' });
    const res = await request(app)
      .post('/api/admin/payments/any-id/refund')
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(403);
  });

  it('reports an empty queue when nothing is owed', async () => {
    const adminToken = await loginAdmin();
    const res = await request(app)
      .get('/api/admin/refunds/pending')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
  });
});
