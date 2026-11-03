import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, createListing } from './helpers';

/**
 * The board's booking flow: with the ₹12 aangan pass every booking confirms free; without it the
 * traveller pays a ₹1 convenience fee on each booking, and that payment is what confirms it.
 */

async function book(token: string, listingId: string) {
  const res = await request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`)
    .send({ listing_id: listingId, listing_type: 'spot' });
  expect(res.status).toBe(200);
  return res.body.booking.id as string;
}

describe('booking without the aangan pass', () => {
  it('can ask, is asked for ₹1 to confirm, and the ₹1 confirms it', async () => {
    const { token } = await registerUser({ name: 'No Pass Nima', paySupport: false });
    const listing = await createListing();
    const id = await book(token, listing.id);

    const checkout = await request(app).post(`/api/bookings/${id}/checkout`).set('Authorization', `Bearer ${token}`);
    expect(checkout.status).toBe(402);
    expect(checkout.body.code).toBe('fee_required');
    expect(checkout.body.amount).toBe(118);
    expect(checkout.body.breakup).toMatchObject({ base: 100, gst: 18, platform_fee: 0, total: 118 });
    expect(checkout.body.pass_breakup.total).toBe(1416);

    const order = await request(app).post('/api/payments/order').set('Authorization', `Bearer ${token}`)
      .send({ flow: 'booking_commission', reference_id: id, amount: 1 });
    expect(order.status).toBe(200);
    expect(order.body.amount).toBe(118);

    const paid = await request(app).post('/api/payments/mock/complete').set('Authorization', `Bearer ${token}`)
      .send({ order_id: order.body.order.id, flow: 'booking_commission', reference_id: id });
    expect(paid.status).toBe(200);

    const mine = await request(app).get('/api/bookings/me').set('Authorization', `Bearer ${token}`);
    expect(mine.body.items.find((b: { id: string }) => b.id === id)?.status).toBe('confirmed');

    // Paying twice for the same booking is refused.
    const again = await request(app).post('/api/payments/order').set('Authorization', `Bearer ${token}`)
      .send({ flow: 'booking_commission', reference_id: id });
    expect(again.status).toBe(409);
  });

  it('cannot pay the fee on someone else\'s booking', async () => {
    const owner = await registerUser({ name: 'Booker', paySupport: false });
    const other = await registerUser({ name: 'Stranger', paySupport: false });
    const listing = await createListing();
    const id = await book(owner.token, listing.id);
    const res = await request(app).post('/api/payments/order').set('Authorization', `Bearer ${other.token}`)
      .send({ flow: 'booking_commission', reference_id: id });
    expect(res.status).toBe(403);
  });
});

describe('booking with the aangan pass', () => {
  it('confirms free', async () => {
    const { token } = await registerUser({ name: 'Pass Pema' });
    const listing = await createListing();
    const id = await book(token, listing.id);
    const checkout = await request(app).post(`/api/bookings/${id}/checkout`).set('Authorization', `Bearer ${token}`);
    expect(checkout.status).toBe(200);
    expect(checkout.body.booking.status).toBe('confirmed');
  });
});
