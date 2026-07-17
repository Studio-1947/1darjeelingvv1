import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, createListing } from './helpers';

async function createBookingOrder(userToken: string, listingId: string) {
  const bookingRes = await request(app)
    .post('/api/bookings')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ listing_id: listingId, listing_type: 'spot' });
  const bookingId = bookingRes.body.booking.id as string;

  const orderRes = await request(app)
    .post('/api/payments/order')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ flow: 'booking_commission', reference_id: bookingId });

  return { bookingId, orderId: orderRes.body.order.id as string };
}

describe('payments ownership', () => {
  it('creates a mock order for a valid flow', async () => {
    const { token } = await registerUser({ name: 'Payer Priya' });
    const listing = await createListing();
    const { orderId } = await createBookingOrder(token, listing.id);
    expect(orderId).toMatch(/^mock_order_/);
  });

  it('rejects unknown payment flows', async () => {
    const { token } = await registerUser({ name: 'Payer Priya 2' });
    const res = await request(app)
      .post('/api/payments/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ flow: 'not_a_real_flow', reference_id: 'whatever' });
    expect(res.status).toBe(400);
  });

  it('blocks a different user from completing someone else\'s mock payment', async () => {
    const { token: tokenA } = await registerUser({ name: 'User A' });
    const { token: tokenB } = await registerUser({ name: 'User B' });
    const listing = await createListing();
    const { bookingId, orderId } = await createBookingOrder(tokenA, listing.id);

    const res = await request(app)
      .post('/api/payments/mock/complete')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ order_id: orderId, flow: 'booking_commission', reference_id: bookingId });

    expect(res.status).toBe(403);
  });

  it('lets the owning user complete their own mock payment and confirms the booking', async () => {
    const { token } = await registerUser({ name: 'User Owner' });
    const listing = await createListing();
    const { bookingId, orderId } = await createBookingOrder(token, listing.id);

    const res = await request(app)
      .post('/api/payments/mock/complete')
      .set('Authorization', `Bearer ${token}`)
      .send({ order_id: orderId, flow: 'booking_commission', reference_id: bookingId });

    expect(res.status).toBe(200);
    expect(res.body.record.status).toBe('confirmed');

    const bookingsRes = await request(app)
      .get('/api/bookings/me')
      .set('Authorization', `Bearer ${token}`);
    expect(bookingsRes.body.items.find((b: any) => b.id === bookingId).status).toBe('confirmed');
  });

  it('404s completing a payment for an unknown order id', async () => {
    const { token } = await registerUser({ name: 'User Nobody' });
    const res = await request(app)
      .post('/api/payments/mock/complete')
      .set('Authorization', `Bearer ${token}`)
      .send({ order_id: 'mock_order_does_not_exist', flow: 'booking_commission', reference_id: 'x' });
    expect(res.status).toBe(404);
  });

  it('blocks completing an order against a reference_id it was not created for', async () => {
    // Victim onboards as a provider but never pays — stays pending_payment.
    const { token: victimToken, phone } = await registerUser({ name: 'Victim Provider', role: 'provider' });
    const onboardRes = await request(app)
      .post('/api/providers/onboard')
      .set('Authorization', `Bearer ${victimToken}`)
      .send({
        business_name: 'Victim Homestay',
        business_type: 'homestay',
        description: 'Not paid for yet',
        location: 'Darjeeling',
        contact_phone: phone,
      });
    const victimProviderId = onboardRes.body.provider.id as string;

    // Attacker buys their own 100-paise booking_commission order...
    const { token: attackerToken } = await registerUser({ name: 'Reference Attacker' });
    const listing = await createListing({ title: 'Attacker Spot' });
    const { orderId } = await createBookingOrder(attackerToken, listing.id);

    // ...then redeems it against the victim's 9900-paise provider registration.
    const res = await request(app)
      .post('/api/payments/mock/complete')
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({ order_id: orderId, flow: 'provider_registration', reference_id: victimProviderId });

    expect(res.status).toBe(400);

    const me = await request(app)
      .get('/api/providers/me')
      .set('Authorization', `Bearer ${victimToken}`);
    expect(me.body.provider.status).toBe('pending_payment');
  });

  it('blocks completing an order against another user\'s booking', async () => {
    const { token: victimToken } = await registerUser({ name: 'Victim Tourist' });
    const listing = await createListing({ title: 'Shared Spot' });
    const { bookingId: victimBookingId } = await createBookingOrder(victimToken, listing.id);

    const { token: attackerToken } = await registerUser({ name: 'Booking Attacker' });
    const { orderId } = await createBookingOrder(attackerToken, listing.id);

    const res = await request(app)
      .post('/api/payments/mock/complete')
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({ order_id: orderId, flow: 'booking_commission', reference_id: victimBookingId });

    expect(res.status).toBe(400);

    const victimBookings = await request(app)
      .get('/api/bookings/me')
      .set('Authorization', `Bearer ${victimToken}`);
    expect(victimBookings.body.items.find((b: any) => b.id === victimBookingId).status).toBe('pending_payment');
  });

  it('blocks a different user from verifying (owning-check runs before signature check)', async () => {
    const { token: tokenA } = await registerUser({ name: 'Verify User A' });
    const { token: tokenB } = await registerUser({ name: 'Verify User B' });
    const listing = await createListing();
    const { bookingId, orderId } = await createBookingOrder(tokenA, listing.id);

    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        razorpay_order_id: orderId,
        razorpay_payment_id: 'pay_fake',
        razorpay_signature: 'sig_fake',
        flow: 'booking_commission',
        reference_id: bookingId,
      });

    expect(res.status).toBe(403);
  });
});
