import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, createListing } from './helpers';

/**
 * The board's booking flow: with the aangan pass every booking confirms free; without it the
 * traveller pays a ₹1 convenience fee on each booking, and that payment is what confirms it.
 */

async function book(token: string, listingId: string) {
  const res = await request(app).post('/api/bookings').set('Authorization', `Bearer ${token}`)
    .send({ listing_id: listingId, listing_type: 'spot' });
  expect(res.status).toBe(200);
  return res.body.booking.id as string;
}

describe('booking without the aangan pass', () => {
  it('can ask and confirm free, with no fee to pay', async () => {
    const { token } = await registerUser({ name: 'No Pass Nima', paySupport: false });
    const listing = await createListing();
    const id = await book(token, listing.id);

    const order = await request(app).post('/api/payments/order').set('Authorization', `Bearer ${token}`)
      .send({ flow: 'booking_commission', reference_id: id, amount: 1 });
    expect(order.status).toBe(409);
    expect(order.body.code).toBe('booking_free');

    const checkout = await request(app).post(`/api/bookings/${id}/checkout`).set('Authorization', `Bearer ${token}`);
    expect(checkout.status).toBe(200);
    const mine = await request(app).get('/api/bookings/me').set('Authorization', `Bearer ${token}`);
    expect(mine.body.items.find((b: { id: string }) => b.id === id)?.status).toBe('confirmed');
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

describe('confirming once', () => {
  it('confirming twice does not tell anyone a second time', async () => {
    const { token } = await registerUser({ name: 'Once Only', paySupport: false });
    const listing = await createListing();
    const id = await book(token, listing.id);
    await request(app).post(`/api/bookings/${id}/checkout`).set('Authorization', `Bearer ${token}`);
    // A second tap (or the app retrying) confirms nothing new.
    const again = await request(app).post(`/api/bookings/${id}/checkout`).set('Authorization', `Bearer ${token}`);
    expect(again.status).toBe(200);
    const feed = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`);
    const confirmed = (feed.body.items || []).filter((n: any) => n.kind === 'booking_confirmed' && n.ref_id === id);
    expect(confirmed).toHaveLength(1);
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
