import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, createListing, loginAdmin } from './helpers';

const WEBHOOK_SECRET = 'test_webhook_secret'; // mirrors vitest.config.ts

function sign(rawBody: string): string {
  return crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex');
}

/** Posts a webhook exactly as Razorpay would: raw JSON bytes + an HMAC of those bytes. */
function deliver(payload: object, opts: { signature?: string } = {}) {
  const raw = JSON.stringify(payload);
  const req = request(app)
    .post('/api/payments/webhook')
    .set('Content-Type', 'application/json');
  if (opts.signature !== undefined) {
    req.set('X-Razorpay-Signature', opts.signature);
  } else {
    req.set('X-Razorpay-Signature', sign(raw));
  }
  return req.send(raw);
}

function paymentCaptured(orderId: string, paymentId = 'pay_test_123') {
  return {
    event: 'payment.captured',
    payload: { payment: { entity: { id: paymentId, order_id: orderId, status: 'captured' } } },
  };
}

async function createOrder(token: string, flow: string, referenceId: string) {
  const res = await request(app)
    .post('/api/payments/order')
    .set('Authorization', `Bearer ${token}`)
    .send({ flow, reference_id: referenceId });
  return res.body.order.id as string;
}

async function onboardPendingProvider(name: string) {
  const { token, phone, user } = await registerUser({ name, role: 'provider' });
  const res = await request(app)
    .post('/api/providers/onboard')
    .set('Authorization', `Bearer ${token}`)
    .send({
      business_name: `${name} Homestay`,
      business_type: 'homestay',
      description: 'Pending activation',
      location: 'Darjeeling',
      contact_phone: phone,
    });
  return { token, providerId: res.body.provider.id as string, user };
}

describe('razorpay webhook', () => {
  it('rejects a delivery with no signature header', async () => {
    const res = await request(app)
      .post('/api/payments/webhook')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(paymentCaptured('mock_order_x')));
    expect(res.status).toBe(400);
  });

  it('rejects a delivery whose signature does not match the body', async () => {
    const res = await deliver(paymentCaptured('mock_order_x'), { signature: 'deadbeef' });
    expect(res.status).toBe(400);
  });

  it('rejects a signature computed over a different body (tamper check)', async () => {
    const staleSignature = sign(JSON.stringify(paymentCaptured('mock_order_original')));
    const res = await deliver(paymentCaptured('mock_order_tampered'), { signature: staleSignature });
    expect(res.status).toBe(400);
  });

  it('acknowledges (200) events it does not handle so Razorpay stops retrying', async () => {
    const res = await deliver({ event: 'payment.failed', payload: { payment: { entity: { order_id: 'x' } } } });
    expect(res.status).toBe(200);
    expect(res.body.ignored).toBe('payment.failed');
  });

  it('acknowledges (200) a captured payment for an order it does not know', async () => {
    const res = await deliver(paymentCaptured('mock_order_never_seen'));
    expect(res.status).toBe(200);
    expect(res.body.unknown_order).toBe(true);
  });

  it('confirms a booking when the browser callback never arrives', async () => {
    const { token } = await registerUser({ name: 'Webhook Tourist' });
    const listing = await createListing({ title: 'Webhook Spot' });
    const bookingRes = await request(app)
      .post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id, listing_type: 'spot' });
    const bookingId = bookingRes.body.booking.id as string;
    const orderId = await createOrder(token, 'booking_commission', bookingId);

    // Customer pays, then closes the tab — only Razorpay reports it.
    const res = await deliver(paymentCaptured(orderId));
    expect(res.status).toBe(200);
    expect(res.body.already).toBe(false);

    const bookings = await request(app).get('/api/bookings/me').set('Authorization', `Bearer ${token}`);
    expect(bookings.body.items.find((b: any) => b.id === bookingId).status).toBe('confirmed');
  });

  it('activates a provider on payment.captured', async () => {
    const { token, providerId } = await onboardPendingProvider('Webhook Provider');
    const orderId = await createOrder(token, 'provider_registration', providerId);

    const res = await deliver(paymentCaptured(orderId));
    expect(res.status).toBe(200);

    const me = await request(app).get('/api/providers/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.provider.status).toBe('active');
  });

  it('is idempotent across repeated deliveries — no duplicate listing', async () => {
    const { token, providerId } = await onboardPendingProvider('Duplicate Provider');
    const orderId = await createOrder(token, 'provider_registration', providerId);

    const first = await deliver(paymentCaptured(orderId));
    const second = await deliver(paymentCaptured(orderId));
    const third = await deliver(paymentCaptured(orderId));

    expect(first.body.already).toBe(false);
    expect(second.body.already).toBe(true);
    expect(third.body.already).toBe(true);

    // provider_registration publishes a listing as a side effect; it must exist exactly once.
    const admin = await loginAdmin();
    const listings = await request(app).get('/api/admin/listings').set('Authorization', `Bearer ${admin}`);
    const mine = listings.body.items.filter((l: any) => l.providerId === providerId);
    expect(mine).toHaveLength(1);
  });

  it('does not double-settle when the webhook and the browser callback race', async () => {
    const { token, providerId } = await onboardPendingProvider('Racing Provider');
    const orderId = await createOrder(token, 'provider_registration', providerId);

    // Browser callback (mock flow) and the webhook both report the same order.
    const viaBrowser = await request(app)
      .post('/api/payments/mock/complete')
      .set('Authorization', `Bearer ${token}`)
      .send({ order_id: orderId, flow: 'provider_registration', reference_id: providerId });
    const viaWebhook = await deliver(paymentCaptured(orderId));

    expect(viaBrowser.status).toBe(200);
    expect(viaWebhook.status).toBe(200);
    expect(viaWebhook.body.already).toBe(true);

    const admin = await loginAdmin();
    const listings = await request(app).get('/api/admin/listings').set('Authorization', `Bearer ${admin}`);
    expect(listings.body.items.filter((l: any) => l.providerId === providerId)).toHaveLength(1);
  });

  it('settles on order.paid as well as payment.captured', async () => {
    const { token, providerId } = await onboardPendingProvider('OrderPaid Provider');
    const orderId = await createOrder(token, 'provider_registration', providerId);

    const res = await deliver({
      event: 'order.paid',
      payload: { order: { entity: { id: orderId, status: 'paid' } } },
    });
    expect(res.status).toBe(200);

    const me = await request(app).get('/api/providers/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.provider.status).toBe('active');
  });
});
