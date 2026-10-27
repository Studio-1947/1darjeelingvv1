import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';

let phoneCounter = 0;

export function nextPhone(): string {
  phoneCounter += 1;
  return `+9190000${String(phoneCounter).padStart(5, '0')}`;
}

export async function activateSupport(token: string, userId: string) {
  const orderRes = await request(app)
    .post('/api/payments/order')
    .set('Authorization', `Bearer ${token}`)
    .send({ flow: 'platform_support', reference_id: userId });
  if (orderRes.status !== 200) {
    throw new Error(`activateSupport order failed: ${orderRes.status} ${JSON.stringify(orderRes.body)}`);
  }

  const res = await request(app)
    .post('/api/payments/mock/complete')
    .set('Authorization', `Bearer ${token}`)
    .send({ order_id: orderRes.body.order.id, flow: 'platform_support', reference_id: userId });
  if (res.status !== 200) {
    throw new Error(`activateSupport complete failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

export async function registerUser(opts: {
  name: string;
  role?: 'tourist' | 'provider';
  phone?: string;
  /** Set false to get a tourist who has NOT paid  for tests that exercise the gate itself. */
  paySupport?: boolean;
}) {
  const phone = opts.phone || nextPhone();
  const role = opts.role || 'tourist';
  const res = await request(app)
    .post('/api/auth/otp/verify')
    .send({ phone, otp: '123456', name: opts.name, role });
  if (res.status !== 200) {
    throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  const token = res.body.token as string;
  const user = res.body.user;

  // Once Task 5 mounts the gate, a bare tourist registration cannot book, favourite or review.
  // Paying here keeps all ~66 existing call sites describing what they meant to describe.
  // Providers are left alone: they become exempt only when providerPaid is true, which is what
  // onboardActiveProvider arranges.
  if (role === 'tourist' && opts.paySupport !== false) {
    await activateSupport(token, user.id);
  }

  return { token, user, phone };
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

export async function onboardActiveProvider(opts: {
  name: string;
  businessType?: string;
  /**
   * New hosts stay out of the public feed until an admin verifies their KYC. Most tests are about
   * something else and want a host who is simply live, so the helper clears the requirement
   * (as if the host pre-dated the rule). Set true to keep the real new-host behaviour.
   */
  awaitingApproval?: boolean;
}) {
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

  if (!opts.awaitingApproval) {
    await db.update(schema.providers).set({ approvalRequired: false }).where(eq(schema.providers.id, providerId));
  }

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

  // Bookings are free: checkout is what the ₹1 commission payment used to be.
  const checkoutRes = await request(app)
    .post(`/api/bookings/${bookingId}/checkout`)
    .set('Authorization', `Bearer ${opts.token}`);
  if (checkoutRes.status !== 200) {
    throw new Error(`checkout failed: ${checkoutRes.status} ${JSON.stringify(checkoutRes.body)}`);
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

// 1x1 PNG and the smallest thing the video route accepts as MP4 (a box whose type at offset 4 is
// "ftyp"). Good enough for the KYC routes, which check the type and the magic bytes, not the picture.
const TINY_PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const TINY_MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(32)]);

/**
 * Uploads every document this provider's business type currently requires, reading the list from
 * the profile checklist so a change to the matrix does not mean editing every test. Returns the
 * document types it uploaded.
 */
export async function uploadRequiredDocs(token: string): Promise<string[]> {
  const profile = await request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${token}`);
  const required = profile.body.checklist.filter((c: any) => c.kind === 'kyc' && c.required);
  for (const item of required) {
    const up =
      item.media === 'video'
        ? await request(app)
            .post(`/api/providers/me/kyc/video?doc_type=${item.key}`)
            .set('Authorization', `Bearer ${token}`)
            .set('Content-Type', 'video/mp4')
            .send(TINY_MP4)
        : await request(app)
            .post('/api/providers/me/kyc')
            .set('Authorization', `Bearer ${token}`)
            .send({ doc_type: item.key, file: TINY_PNG_DATA_URL, filename: `${item.key}.png` });
    if (up.status !== 200) throw new Error(`upload failed for ${item.key}: ${up.status} ${JSON.stringify(up.body)}`);
  }
  return required.map((c: any) => c.key as string);
}

/** A live capture from a phone standing in Darjeeling, the way a café or shop proves where it is. */
export async function captureLiveLocation(
  token: string,
  reading: { latitude?: number; longitude?: number; accuracy?: number } = {}
) {
  return request(app)
    .post('/api/providers/me/location/live')
    .set('Authorization', `Bearer ${token}`)
    .send({ latitude: 27.036, longitude: 88.2627, accuracy: 12, ...reading });
}
