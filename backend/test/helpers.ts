import request from 'supertest';
import { app } from '../src/app';

let phoneCounter = 0;

export function nextPhone(): string {
  phoneCounter += 1;
  return `+9190000${String(phoneCounter).padStart(5, '0')}`;
}

export async function registerUser(opts: { name: string; role?: 'tourist' | 'provider'; phone?: string }) {
  const phone = opts.phone || nextPhone();
  const res = await request(app)
    .post('/api/auth/otp/verify')
    .send({ phone, otp: '123456', name: opts.name, role: opts.role || 'tourist' });
  if (res.status !== 200) {
    throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { token: res.body.token as string, user: res.body.user, phone };
}

export async function loginAdmin() {
  const res = await request(app)
    .post('/api/auth/admin/login')
    .send({ phone: 'admin', password: 'test_admin_password' });
  if (res.status !== 200) {
    throw new Error(`loginAdmin failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token as string;
}

export async function onboardActiveProvider(opts: { name: string; businessType?: string }) {
  const businessType = opts.businessType || 'homestay';
  const { token, phone } = await registerUser({ name: opts.name, role: 'provider' });

  const onboardRes = await request(app)
    .post('/api/providers/onboard')
    .set('Authorization', `Bearer ${token}`)
    .send({
      business_name: `${opts.name}'s Business`,
      business_type: businessType,
      description: 'A lovely place to stay',
      location: 'Darjeeling',
      contact_phone: phone,
    });
  if (onboardRes.status !== 200) {
    throw new Error(`onboard failed: ${onboardRes.status} ${JSON.stringify(onboardRes.body)}`);
  }
  const providerId = onboardRes.body.provider.id as string;

  const orderRes = await request(app)
    .post('/api/payments/order')
    .set('Authorization', `Bearer ${token}`)
    .send({ flow: 'provider_registration', reference_id: providerId });
  const orderId = orderRes.body.order.id as string;

  await request(app)
    .post('/api/payments/mock/complete')
    .set('Authorization', `Bearer ${token}`)
    .send({ order_id: orderId, flow: 'provider_registration', reference_id: providerId });

  return { token, providerId, phone };
}

export async function createConfirmedBooking(opts: {
  token: string;
  listingId: string;
  listingType: string;
  checkIn?: string;
  checkOut?: string;
}) {
  const bookingRes = await request(app)
    .post('/api/bookings')
    .set('Authorization', `Bearer ${opts.token}`)
    .send({
      listing_id: opts.listingId,
      listing_type: opts.listingType,
      check_in: opts.checkIn,
      check_out: opts.checkOut,
    });
  if (bookingRes.status !== 200) {
    throw new Error(`booking failed: ${bookingRes.status} ${JSON.stringify(bookingRes.body)}`);
  }
  const bookingId = bookingRes.body.booking.id as string;

  const orderRes = await request(app)
    .post('/api/payments/order')
    .set('Authorization', `Bearer ${opts.token}`)
    .send({ flow: 'booking_commission', reference_id: bookingId });
  const orderId = orderRes.body.order.id as string;

  const completeRes = await request(app)
    .post('/api/payments/mock/complete')
    .set('Authorization', `Bearer ${opts.token}`)
    .send({ order_id: orderId, flow: 'booking_commission', reference_id: bookingId });
  if (completeRes.status !== 200) {
    throw new Error(`complete failed: ${completeRes.status} ${JSON.stringify(completeRes.body)}`);
  }

  return bookingId;
}

export async function createListing(opts: { title?: string } = {}) {
  const admin = await loginAdmin();
  const res = await request(app)
    .post('/api/listings')
    .set('Authorization', `Bearer ${admin}`)
    .send({
      title: opts.title || 'Test Spot',
      type: 'spot',
      description: 'A test listing',
      location: 'Darjeeling',
      provider_id: 'admin-seed-provider',
    });
  if (res.status !== 200) {
    throw new Error(`createListing failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.item;
}
