import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { registerUser, createListing, createConfirmedBooking } from './helpers';

async function giveVoucher(userId: string) {
  const id = uuidv4();
  await db.insert(schema.vouchers).values({
    id,
    userId,
    discountPercentage: 10,
    tier: 1,
    status: 'available',
    createdAt: new Date().toISOString(),
  });
  return id;
}

async function voucherRow(id: string) {
  const [row] = await db.select().from(schema.vouchers).where(eq(schema.vouchers.id, id)).limit(1);
  return row;
}

async function bookWithVoucher(token: string, listingId: string, voucherId: string) {
  const res = await request(app)
    .post('/api/bookings')
    .set('Authorization', `Bearer ${token}`)
    .send({ listing_id: listingId, listing_type: 'spot', voucher_id: voucherId });
  expect(res.status).toBe(200);
  return res.body.booking.id as string;
}

describe('voucher on a booking that does not take effect', () => {
  it('is burned when the request is made', async () => {
    const { token, user } = await registerUser({ name: 'Voucher Spender' });
    const listing = await createListing();
    const voucherId = await giveVoucher(user.id);

    const bookingId = await bookWithVoucher(token, listing.id, voucherId);

    const row = await voucherRow(voucherId);
    expect(row.status).toBe('used');
    expect(row.usedOnBookingId).toBe(bookingId);
  });

  it('goes back to the guest when they cancel before it is confirmed', async () => {
    const { token, user } = await registerUser({ name: 'Voucher Canceller' });
    const listing = await createListing();
    const voucherId = await giveVoucher(user.id);
    const bookingId = await bookWithVoucher(token, listing.id, voucherId);

    const res = await request(app)
      .patch(`/api/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const row = await voucherRow(voucherId);
    expect(row.status).toBe('available');
    expect(row.usedAt).toBeNull();
    expect(row.usedOnBookingId).toBeNull();

    // And it is spendable again.
    const mine = await request(app).get('/api/users/me/vouchers').set('Authorization', `Bearer ${token}`);
    expect(mine.body.some((v: any) => v.id === voucherId)).toBe(true);
  });

  it('stays spent when a confirmed booking is cancelled', async () => {
    const { token, user } = await registerUser({ name: 'Voucher Keeper' });
    const listing = await createListing();
    const voucherId = await giveVoucher(user.id);
    const bookingId = await bookWithVoucher(token, listing.id, voucherId);

    const checkout = await request(app)
      .post(`/api/bookings/${bookingId}/checkout`)
      .set('Authorization', `Bearer ${token}`);
    expect(checkout.status).toBe(200);

    await request(app).patch(`/api/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${token}`);

    const row = await voucherRow(voucherId);
    expect(row.status).toBe('used');
  });

  it('is a no-op for a booking that carried no voucher', async () => {
    const { token } = await registerUser({ name: 'No Voucher' });
    const listing = await createListing();
    const bookingId = await createConfirmedBooking({ token, listingId: listing.id, listingType: 'spot' });
    const res = await request(app)
      .patch(`/api/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('voucher claimed by two bookings at once', () => {
  it('lets exactly one succeed and leaves no booking behind for the other', async () => {
    const { token, user } = await registerUser({ name: 'Voucher Racer' });
    const listing = await createListing();
    const voucherId = await giveVoucher(user.id);

    const attempt = () =>
      request(app)
        .post('/api/bookings')
        .set('Authorization', `Bearer ${token}`)
        .send({ listing_id: listing.id, listing_type: 'spot', voucher_id: voucherId });
    const results = await Promise.all([attempt(), attempt(), attempt()]);

    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(2);

    const rows = await db.select().from(schema.bookings).where(eq(schema.bookings.userId, user.id));
    expect(rows.filter((b) => b.voucherId === voucherId)).toHaveLength(1);
    expect((await voucherRow(voucherId)).status).toBe('used');
  });
});
