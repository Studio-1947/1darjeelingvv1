import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, createListing } from './helpers';

/**
 * A pass order for the caller's own account: the simplest order there is, used below wherever a
 * test only needs "an order that belongs to this user". (These tests used the ₹1 booking
 * commission for that until bookings became free.)
 */
async function createPassOrder(token: string, userId: string) {
  const orderRes = await request(app)
    .post('/api/payments/order')
    .set('Authorization', `Bearer ${token}`)
    .send({ flow: 'platform_support', reference_id: userId });
  expect(orderRes.status).toBe(200);
  return orderRes.body.order.id as string;
}

async function createBooking(token: string, listingId: string) {
  const bookingRes = await request(app)
    .post('/api/bookings')
    .set('Authorization', `Bearer ${token}`)
    .send({ listing_id: listingId, listing_type: 'spot' });
  expect(bookingRes.status).toBe(200);
  return bookingRes.body.booking.id as string;
}

async function onboardUnpaid(name: string) {
  const { token, phone } = await registerUser({ name, role: 'provider' });
  const onboardRes = await request(app)
    .post('/api/providers/onboard')
    .set('Authorization', `Bearer ${token}`)
    .send({
      business_name: `${name} Co`,
      business_type: 'homestay',
      description: 'Not paid for yet',
      location: 'Darjeeling',
      contact_phone: phone,
    });
  return { token, providerId: onboardRes.body.provider.id as string };
}

describe('payments ownership', () => {
  it('creates a mock order for a valid flow', async () => {
    const { token, user } = await registerUser({ name: 'Payer Priya', paySupport: false });
    const orderId = await createPassOrder(token, user.id);
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

  it('refuses new booking-commission orders now that bookings are free', async () => {
    const { token } = await registerUser({ name: 'Old Client' });
    const listing = await createListing();
    const bookingId = await createBooking(token, listing.id);

    const res = await request(app)
      .post('/api/payments/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ flow: 'booking_commission', reference_id: bookingId });

    expect(res.status).toBe(410);
    expect(res.body.detail).toMatch(/checkout/);
  });

  it('blocks a different user from completing someone else\'s mock payment', async () => {
    const a = await registerUser({ name: 'User A', paySupport: false });
    const { token: tokenB } = await registerUser({ name: 'User B' });
    const orderId = await createPassOrder(a.token, a.user.id);

    const res = await request(app)
      .post('/api/payments/mock/complete')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ order_id: orderId, flow: 'platform_support', reference_id: a.user.id });

    expect(res.status).toBe(403);
  });

  it('lets the owning user complete their own mock payment', async () => {
    const { token, user } = await registerUser({ name: 'User Owner', paySupport: false });
    const orderId = await createPassOrder(token, user.id);

    const res = await request(app)
      .post('/api/payments/mock/complete')
      .set('Authorization', `Bearer ${token}`)
      .send({ order_id: orderId, flow: 'platform_support', reference_id: user.id });

    expect(res.status).toBe(200);
    expect(res.body.record.supportExpiresAt).toBeTruthy();
  });

  it('404s completing a payment for an unknown order id', async () => {
    const { token, user } = await registerUser({ name: 'User Nobody' });
    const res = await request(app)
      .post('/api/payments/mock/complete')
      .set('Authorization', `Bearer ${token}`)
      .send({ order_id: 'mock_order_does_not_exist', flow: 'platform_support', reference_id: user.id });
    expect(res.status).toBe(404);
  });

  it('blocks creating an order against another user\'s provider registration', async () => {
    const victim = await onboardUnpaid('Prov Victim');

    const { token: attackerToken } = await registerUser({ name: 'Prov Attacker' });
    const res = await request(app)
      .post('/api/payments/order')
      .set('Authorization', `Bearer ${attackerToken}`)
      .send({ flow: 'provider_registration', reference_id: victim.providerId });

    expect(res.status).toBe(403);

    const me = await request(app).get('/api/providers/me').set('Authorization', `Bearer ${victim.token}`);
    expect(me.body.provider.status).toBe('pending_payment');
  });

  it('404s creating an order for a reference that does not exist', async () => {
    const { token } = await registerUser({ name: 'Ghost Referencer' });
    const res = await request(app)
      .post('/api/payments/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ flow: 'provider_registration', reference_id: 'no-such-provider' });
    expect(res.status).toBe(404);
  });

  it('blocks completing an order against a reference_id it was not created for', async () => {
    // Victim onboards as a provider but never pays  stays pending_payment.
    const victim = await onboardUnpaid('Victim Provider');

    // Attacker buys their own pass order...
    const attacker = await registerUser({ name: 'Reference Attacker', paySupport: false });
    const orderId = await createPassOrder(attacker.token, attacker.user.id);

    // ...then tries to redeem it against the victim's provider registration.
    const res = await request(app)
      .post('/api/payments/mock/complete')
      .set('Authorization', `Bearer ${attacker.token}`)
      .send({ order_id: orderId, flow: 'provider_registration', reference_id: victim.providerId });

    expect(res.status).toBe(400);

    const me = await request(app)
      .get('/api/providers/me')
      .set('Authorization', `Bearer ${victim.token}`);
    expect(me.body.provider.status).toBe('pending_payment');
  });

  it('blocks a different user from verifying (owning-check runs before signature check)', async () => {
    const a = await registerUser({ name: 'Verify User A', paySupport: false });
    const { token: tokenB } = await registerUser({ name: 'Verify User B' });
    const orderId = await createPassOrder(a.token, a.user.id);

    const res = await request(app)
      .post('/api/payments/verify')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({
        razorpay_order_id: orderId,
        razorpay_payment_id: 'pay_fake',
        razorpay_signature: 'sig_fake',
        flow: 'platform_support',
        reference_id: a.user.id,
      });

    expect(res.status).toBe(403);
  });
});

describe('free booking checkout', () => {
  it('confirms the guest\'s own booking with no payment', async () => {
    const { token } = await registerUser({ name: 'Checkout Guest' });
    const listing = await createListing();
    const bookingId = await createBooking(token, listing.id);

    const res = await request(app)
      .post(`/api/bookings/${bookingId}/checkout`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('confirmed');

    const mine = await request(app).get('/api/bookings/me').set('Authorization', `Bearer ${token}`);
    expect(mine.body.items.find((b: any) => b.id === bookingId).status).toBe('confirmed');
  });

  it('is idempotent: checking out twice returns the same confirmed booking', async () => {
    const { token } = await registerUser({ name: 'Double Checkout' });
    const listing = await createListing();
    const bookingId = await createBooking(token, listing.id);

    await request(app).post(`/api/bookings/${bookingId}/checkout`).set('Authorization', `Bearer ${token}`);
    const again = await request(app).post(`/api/bookings/${bookingId}/checkout`).set('Authorization', `Bearer ${token}`);

    expect(again.status).toBe(200);
    expect(again.body.booking.status).toBe('confirmed');
  });

  it('blocks another user from confirming someone else\'s booking', async () => {
    const { token: victimToken } = await registerUser({ name: 'Victim Tourist' });
    const listing = await createListing({ title: 'Shared Spot' });
    const victimBookingId = await createBooking(victimToken, listing.id);

    const { token: attackerToken } = await registerUser({ name: 'Booking Attacker' });
    const res = await request(app)
      .post(`/api/bookings/${victimBookingId}/checkout`)
      .set('Authorization', `Bearer ${attackerToken}`);

    expect(res.status).toBe(403);

    const victimBookings = await request(app)
      .get('/api/bookings/me')
      .set('Authorization', `Bearer ${victimToken}`);
    expect(victimBookings.body.items.find((b: any) => b.id === victimBookingId).status).toBe('pending_payment');
  });

  it('refuses to confirm a cancelled booking', async () => {
    const { token } = await registerUser({ name: 'Cancelled Guest' });
    const listing = await createListing();
    const bookingId = await createBooking(token, listing.id);
    await request(app).patch(`/api/bookings/${bookingId}/cancel`).set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/bookings/${bookingId}/checkout`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
  });

  it('404s a booking that does not exist', async () => {
    const { token } = await registerUser({ name: 'Ghost Checkout' });
    const res = await request(app)
      .post('/api/bookings/no-such-booking/checkout')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});
