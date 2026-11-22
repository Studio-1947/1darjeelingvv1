import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { OTP_MAX_ATTEMPTS, ACCEPTED_HOLD_HOURS } from '../src/config';
import { hashOtp } from '../src/lib/otpHash';
import { expireStaleRequests } from '../src/lib/requestExpiry';
import { DELETED_ACCOUNT_ID } from '../src/lib/accountCleanup';
import { createListing, inDays, nextPhone, onboardActiveProvider, registerUser } from './helpers';

// Regression tests for the QA and security report of 2026-11-21 (BUG-01 to BUG-08). Each one
// failed before its fix.

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const book = (token: string, body: Record<string, unknown>) =>
  request(app).post('/api/bookings').set(auth(token)).send(body);

/** Stores a known code for a phone, the way /otp/send would. */
async function plantOtp(phone: string, otp: string) {
  const now = new Date();
  await db.insert(schema.otps).values({
    id: `qa-${Math.random().toString(36).slice(2)}`,
    phone,
    otpHash: await hashOtp(otp),
    channel: 'whatsapp',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 10 * 60_000).toISOString(),
    attempts: 0,
  });
}

async function homestayWithRooms() {
  const { token: host } = await onboardActiveProvider({ name: 'QA Room Host' });
  const created = await request(app).post('/api/listings').set(auth(host)).send({
    title: 'QA Three Rooms', type: 'homestay', description: 'x', location: 'Darjeeling', price: 1000,
    extras: { rooms: [
      { name: 'Room 1', price: 2000, unit: 'night', occ: 2 },
      { name: 'Room 2', price: 2000, unit: 'night', occ: 2 },
      { name: 'Room 3', price: 2000, unit: 'night', occ: 2 },
    ] },
  });
  expect(created.status).toBe(200);
  return { host, listing: created.body.item };
}

describe('BUG-01: OTP guesses fired in parallel', () => {
  it('compares at most OTP_MAX_ATTEMPTS guesses, then refuses even the right code', async () => {
    const phone = nextPhone();
    const right = '482913';
    await plantOtp(phone, right);

    const guesses = Array.from({ length: 20 }, (_, i) => String(100000 + i));
    const res = await Promise.all(guesses.map((otp) =>
      request(app).post('/api/auth/otp/verify').send({ phone, otp })));
    const compared = res.filter((r) => r.status === 400).length;
    expect(compared).toBeLessThanOrEqual(OTP_MAX_ATTEMPTS);
    expect(res.filter((r) => r.status === 429).length).toBe(guesses.length - compared);

    const late = await request(app).post('/api/auth/otp/verify').send({ phone, otp: right, name: 'Too Late' });
    expect(late.status).toBe(429);
    const [rec] = await db.select().from(schema.otps)
      .where(and(eq(schema.otps.phone, phone), isNull(schema.otps.consumedAt)))
      .orderBy(desc(schema.otps.createdAt)).limit(1);
    expect(rec.attempts).toBe(OTP_MAX_ATTEMPTS);
  });
});

describe('BUG-06: one phone typed two ways', () => {
  it('signs in to the same account, not a new empty one', async () => {
    const digits = nextPhone().replace(/\D/g, '').slice(-10).replace(/^./, '9');
    const first = await request(app).post('/api/auth/otp/verify').send({ phone: digits, otp: '123456', name: 'Two Ways' });
    expect(first.status).toBe(200);

    const spaced = `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
    const second = await request(app).post('/api/auth/otp/verify').send({ phone: spaced, otp: '123456' });
    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(first.body.user.id);
  });
});

describe('BUG-02: an accepted request the guest never confirms', () => {
  it('stops holding the dates after ACCEPTED_HOLD_HOURS and is closed by the sweep', async () => {
    const listing = await createListing({ title: 'QA Lapsing Homestay', type: 'homestay' });
    const { token: a } = await registerUser({ name: 'Guest A' });
    const { token: b } = await registerUser({ name: 'Guest B' });
    const dates = { check_in: inDays(30), check_out: inDays(32) };

    const made = await book(a, { listing_id: listing.id, ...dates });
    expect(made.status).toBe(200);
    const id = made.body.booking.id;
    // Accepted long ago, never confirmed.
    const longAgo = new Date(Date.now() - (ACCEPTED_HOLD_HOURS + 1) * 3600_000).toISOString();
    await db.update(schema.bookings).set({ status: 'accepted', acceptedAt: longAgo, createdAt: longAgo })
      .where(eq(schema.bookings.id, id));

    const other = await book(b, { listing_id: listing.id, ...dates });
    expect(other.status).toBe(200);

    await expireStaleRequests();
    const [row] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, id));
    expect(row.status).toBe('cancelled');
    expect(row.cancelReason).toBe('not_confirmed');
  });

  it('still holds the dates while inside the window', async () => {
    const listing = await createListing({ title: 'QA Fresh Accept', type: 'homestay' });
    const { token: a } = await registerUser({ name: 'Guest C' });
    const { token: b } = await registerUser({ name: 'Guest D' });
    const dates = { check_in: inDays(34), check_out: inDays(35) };
    const made = await book(a, { listing_id: listing.id, ...dates });
    await db.update(schema.bookings).set({ status: 'accepted', acceptedAt: new Date().toISOString() })
      .where(eq(schema.bookings.id, made.body.booking.id));
    const other = await book(b, { listing_id: listing.id, ...dates });
    expect(other.status).toBe(409);
    expect(other.body.code).toBe('dates_taken');
  });
});

describe('BUG-04: rooms of one homestay', () => {
  it('two guests in two rooms both get the same nights; the same room clashes', async () => {
    const { host, listing } = await homestayWithRooms();
    const { token: a } = await registerUser({ name: 'Room Guest A' });
    const { token: b } = await registerUser({ name: 'Room Guest B' });
    const { token: c } = await registerUser({ name: 'Room Guest C' });
    const dates = { check_in: inDays(40), check_out: inDays(42), guests: 2 };

    const one = await book(a, { listing_id: listing.id, room: 'Room 1', ...dates });
    expect(one.status).toBe(200);
    const two = await book(b, { listing_id: listing.id, room: 'Room 2', ...dates });
    expect(two.status).toBe(200);
    const same = await book(c, { listing_id: listing.id, room: 'Room 1', ...dates });
    expect(same.status).toBe(409);

    // Accepting Room 1 leaves the Room 2 request open.
    expect((await request(app).patch(`/api/bookings/${one.body.booking.id}/confirm`).set(auth(host))).status).toBe(200);
    const [r2] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, two.body.booking.id));
    expect(r2.status).toBe('pending_payment');
    expect((await request(app).patch(`/api/bookings/${two.body.booking.id}/confirm`).set(auth(host))).status).toBe(200);
  });

  it('a whole-house request clashes with any room booked on those nights', async () => {
    const { listing } = await homestayWithRooms();
    const { token: a } = await registerUser({ name: 'Room Guest E' });
    const { token: b } = await registerUser({ name: 'House Guest F' });
    const dates = { check_in: inDays(44), check_out: inDays(45), guests: 2 };
    expect((await book(a, { listing_id: listing.id, room: 'Room 3', ...dates })).status).toBe(200);
    expect((await book(b, { listing_id: listing.id, ...dates })).status).toBe(409);
  });
});

describe('BUG-07: price fixed at booking', () => {
  it('a homestay booked without a room keeps its amount when the host changes the price', async () => {
    const { token: host, providerId } = await onboardActiveProvider({ name: 'QA Price Host' });
    const created = await request(app).post('/api/listings').set(auth(host)).send({
      title: 'QA Price House', type: 'homestay', description: 'x', location: 'Darjeeling', price: 1500, provider_id: providerId,
    });
    const listingId = created.body.item.id;
    const { token } = await registerUser({ name: 'Price Guest' });
    const made = await book(token, { listing_id: listingId, check_in: inDays(50), check_out: inDays(52), guests: 1 });
    expect(made.status).toBe(200);
    expect(made.body.booking.amount).toBe(3000);

    expect((await request(app).patch(`/api/listings/${listingId}`).set(auth(host)).send({ price: 2500 })).status).toBe(200);
    const mine = await request(app).get('/api/bookings/me').set(auth(token));
    const item = mine.body.items.find((b: any) => b.id === made.body.booking.id);
    expect(item.amount).toBe(3000);
  });
});

describe('BUG-03: deletes that would take other people\'s bookings', () => {
  it('a listing with an upcoming booking cannot be deleted, and the booking survives', async () => {
    const { token: host, providerId } = await onboardActiveProvider({ name: 'QA Delete Host' });
    const created = await request(app).post('/api/listings').set(auth(host)).send({
      title: 'QA Delete House', type: 'homestay', description: 'x', location: 'Darjeeling', price: 1000, provider_id: providerId,
    });
    const listingId = created.body.item.id;
    const { token } = await registerUser({ name: 'Delete Guest' });
    const made = await book(token, { listing_id: listingId, check_in: inDays(60), check_out: inDays(61) });
    expect(made.status).toBe(200);

    const del = await request(app).delete(`/api/listings/${listingId}`).set(auth(host));
    expect(del.status).toBe(409);
    expect(del.body.code).toBe('open_bookings');
    const [row] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, made.body.booking.id));
    expect(row).toBeTruthy();
  });

  it('an account with an open request cannot be deleted; once closed, its payment records are kept', async () => {
    const listing = await createListing({ title: 'QA Account Delete', type: 'homestay' });
    const { token, user } = await registerUser({ name: 'Leaving Guest' });
    const made = await book(token, { listing_id: listing.id, check_in: inDays(62), check_out: inDays(63) });
    expect(made.status).toBe(200);

    const refused = await request(app).delete('/api/users/me').set(auth(token));
    expect(refused.status).toBe(409);

    await db.update(schema.bookings).set({ status: 'cancelled' }).where(eq(schema.bookings.id, made.body.booking.id));
    const paymentId = `qa-pay-${Math.random().toString(36).slice(2)}`;
    await db.insert(schema.payments).values({
      id: paymentId, userId: user.id, flow: 'support', referenceId: user.id, amount: 100,
      orderId: `order_${paymentId}`, status: 'paid', createdAt: new Date().toISOString(),
    });

    const gone = await request(app).delete('/api/users/me').set(auth(token));
    expect(gone.status).toBe(200);
    expect(await db.select().from(schema.users).where(eq(schema.users.id, user.id))).toHaveLength(0);
    const [pay] = await db.select().from(schema.payments).where(eq(schema.payments.id, paymentId));
    expect(pay.userId).toBe(DELETED_ACCOUNT_ID);
  });
});

describe('BUG-08: co-owners and the owner\'s ID documents', () => {
  it('a co-owner cannot open, upload or delete the business\'s KYC documents', async () => {
    const { token: owner } = await onboardActiveProvider({ name: 'QA KYC Owner' });
    const coPhone = nextPhone();
    const added = await request(app).post('/api/providers/me/owners').set(auth(owner)).send({ phone: coPhone, name: 'Co Owner' });
    expect([200, 201]).toContain(added.status);
    const co = await request(app).post('/api/auth/otp/verify').send({ phone: coPhone, otp: '123456', name: 'Co Owner' });
    expect(co.status).toBe(200);
    const coToken = co.body.token;

    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8ffbf1e0005fe02fea7d6a4b00000000049454e44ae426082', 'hex');
    const file = `data:image/png;base64,${png.toString('base64')}`;
    const up = await request(app).post('/api/providers/me/kyc').set(auth(owner)).send({ doc_type: 'photo_id', file, filename: 'id.png' });
    const docId = up.body?.document?.id;

    expect((await request(app).post('/api/providers/me/kyc').set(auth(coToken)).send({ doc_type: 'photo_id', file, filename: 'id.png' })).status).toBe(403);
    expect((await request(app).delete('/api/providers/me/kyc/photo_id').set(auth(coToken))).status).toBe(403);
    if (docId) {
      expect((await request(app).get(`/api/providers/kyc/${docId}/file`).set(auth(coToken))).status).toBe(403);
    }
  });
});
