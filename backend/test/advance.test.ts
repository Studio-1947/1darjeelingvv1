import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { onboardActiveProvider, registerUser } from './helpers';
import { advanceAmount, advanceUnpaidOpen, checkAdvancePolicy } from '../src/lib/advance';

/**
 * The homestay advance (lib/advance.ts): a host asks 10-15% up front, paid by the guest straight
 * to the host's UPI after confirming. aangan only records "I've paid" and "Advance received", and
 * the UPI ID is shown only where the host's number is.
 */

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
const iso = (days: number) => new Date(Date.now() + days * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const HOUR = 3_600_000;

async function host(name: string, profile: Record<string, unknown> | null, upi?: string) {
  const h = await onboardActiveProvider({ name });
  const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.providerId, h.providerId)).limit(1);
  const body: Record<string, unknown> = { profile: { rooms: [{ name: 'Valley Room', price: 2000, occ: 2 }], ...(profile || {}) } };
  if (upi !== undefined) body.upi = upi;
  const saved = await request(app).patch('/api/providers/me').set(auth(h.token)).send(body);
  expect(saved.status).toBe(200);
  return { h, listing };
}

async function confirmedBooking(userId: string, listing: typeof schema.listings.$inferSelect, b: Partial<typeof schema.bookings.$inferInsert> = {}) {
  const id = uuidv4();
  await db.insert(schema.bookings).values({
    id, userId, listingId: listing.id, listingType: listing.type, listingTitle: listing.title,
    checkIn: iso(10), checkOut: iso(12), guests: 2, notes: '', status: 'confirmed',
    createdAt: new Date().toISOString(), confirmedAt: new Date().toISOString(),
    advancePercent: 10, advanceAmount: 400, advanceRefundDays: 7, ...b,
  } as any);
  return id;
}

describe('the advance policy', () => {
  it('takes 10 to 15 percent and a refund rule of 3, 7 or 14 days, or none', () => {
    expect(checkAdvancePolicy({ percent: 10, refund_days: 7 })).toEqual({ percent: 10, refund_days: 7 });
    expect(checkAdvancePolicy({ percent: '15', refund_days: null })).toEqual({ percent: 15, refund_days: null });
    expect(checkAdvancePolicy(null)).toBeNull();
    expect(checkAdvancePolicy({ percent: 0 })).toBeNull();
    expect(checkAdvancePolicy({ percent: 9, refund_days: 7 })).toHaveProperty('error');
    expect(checkAdvancePolicy({ percent: 16, refund_days: 7 })).toHaveProperty('error');
    expect(checkAdvancePolicy({ percent: 12.5, refund_days: 7 })).toHaveProperty('error');
    expect(checkAdvancePolicy({ percent: 10, refund_days: 5 })).toHaveProperty('error');
    expect(advanceAmount(4499, 10)).toBe(450);
  });

  it('opens the unpaid cancel only 24 hours after confirming, and never once received', () => {
    const base = { status: 'confirmed', advancePercent: 10, advanceAmount: 400, advanceRefundDays: 7, advancePaidAt: null, advanceReceivedAt: null };
    const at = new Date('2026-12-01T10:00:00Z');
    expect(advanceUnpaidOpen({ ...base, confirmedAt: new Date(at.getTime() - 23 * HOUR).toISOString() }, at)).toBe(false);
    expect(advanceUnpaidOpen({ ...base, confirmedAt: new Date(at.getTime() - 24 * HOUR).toISOString() }, at)).toBe(true);
    expect(advanceUnpaidOpen({ ...base, confirmedAt: new Date(at.getTime() - 48 * HOUR).toISOString(), advanceReceivedAt: at.toISOString() }, at)).toBe(false);
    expect(advanceUnpaidOpen({ ...base, advancePercent: null, advanceAmount: null, confirmedAt: new Date(at.getTime() - 48 * HOUR).toISOString() }, at)).toBe(false);
  });
});

describe('a host asking for an advance (PATCH /providers/me)', () => {
  it('needs a UPI ID, and goes onto the listing without the UPI ID', async () => {
    const h = await onboardActiveProvider({ name: 'No UPI Host' });
    const refused = await request(app).patch('/api/providers/me').set(auth(h.token))
      .send({ profile: { advance: { percent: 10, refund_days: 7 } } });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('upi_required');

    const ok = await request(app).patch('/api/providers/me').set(auth(h.token))
      .send({ upi: 'nohost@okaxis', profile: { advance: { percent: 12, refund_days: null } } });
    expect(ok.status).toBe(200);
    const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.providerId, h.providerId)).limit(1);
    expect(listing.extras.advance).toEqual({ percent: 12, refund_days: null });

    // Travellers read the rule on the listing; the UPI ID is not there.
    const g = await registerUser({ name: 'Curious Guest' });
    const seen = await request(app).get(`/api/listings/${listing.id}`).set(auth(g.token));
    expect(seen.status).toBe(200);
    const page = JSON.stringify(seen.body);
    expect(page).not.toContain('nohost@okaxis');
    expect(seen.body.item.extras.advance).toEqual({ percent: 12, refund_days: null });

    // Clearing the UPI ID while the advance is on is refused.
    const clear = await request(app).patch('/api/providers/me').set(auth(h.token)).send({ upi: '' });
    expect(clear.status).toBe(400);
    expect(clear.body.code).toBe('upi_required');
  });

  it('refuses a percent outside 10 to 15', async () => {
    const h = await onboardActiveProvider({ name: 'Greedy Host' });
    const res = await request(app).patch('/api/providers/me').set(auth(h.token))
      .send({ upi: 'greedy@okaxis', profile: { advance: { percent: 30, refund_days: 7 } } });
    expect(res.status).toBe(400);
  });
});

describe('the advance on a booking', () => {
  it('is copied onto a new request from the stay amount', async () => {
    const { listing } = await host('Advance Copy Host', { advance: { percent: 10, refund_days: 7 } }, 'copyhost@okaxis');
    const g = await registerUser({ name: 'Copy Guest' });
    const res = await request(app).post('/api/bookings').set(auth(g.token))
      .send({ listing_id: listing.id, check_in: iso(20), check_out: iso(22), guests: 2, room: 'Valley Room' });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, res.body.booking?.id ?? res.body.id)).limit(1);
    // Two nights of a ₹2000 room is ₹4000; 10% of it is ₹400.
    expect(row).toMatchObject({ advancePercent: 10, advanceAmount: 400, advanceRefundDays: 7 });
  });

  it('is not asked when the host has none', async () => {
    const { listing } = await host('No Advance Host', null);
    const g = await registerUser({ name: 'Plain Guest' });
    const res = await request(app).post('/api/bookings').set(auth(g.token))
      .send({ listing_id: listing.id, check_in: iso(20), check_out: iso(21), guests: 2, room: 'Valley Room' });
    expect(res.status).toBe(200);
    const [row] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, res.body.booking?.id ?? res.body.id)).limit(1);
    expect(row.advancePercent).toBeNull();
  });

  it('shows the UPI ID to the guest only once the booking is confirmed', async () => {
    const { listing } = await host('UPI Gate Host', { advance: { percent: 10, refund_days: 7 } }, 'gatehost@okaxis');
    const g = await registerUser({ name: 'Gate Guest' });
    const id = await confirmedBooking(g.user.id, listing, { status: 'accepted', confirmedAt: null });
    const mine = async () => ((await request(app).get('/api/bookings/me').set(auth(g.token))).body.items as any[]).find((b) => b.id === id);

    const accepted = await mine();
    expect(accepted.advance).toMatchObject({ percent: 10, amount: 400, refund_days: 7 });
    expect(JSON.stringify(accepted)).not.toContain('gatehost@okaxis');

    await db.update(schema.bookings).set({ status: 'confirmed', confirmedAt: new Date().toISOString() }).where(eq(schema.bookings.id, id));
    const confirmed = await mine();
    expect(confirmed.host_contact.upi).toBe('gatehost@okaxis');
  });

  it('records the guest paying and the host receiving it, and tells the other side', async () => {
    const { h, listing } = await host('Paid Host', { advance: { percent: 10, refund_days: 7 } }, 'paidhost@okaxis');
    const g = await registerUser({ name: 'Paying Guest' });
    const other = await registerUser({ name: 'Other Guest' });
    const id = await confirmedBooking(g.user.id, listing);

    expect((await request(app).post(`/api/bookings/${id}/advance/paid`).set(auth(other.token))).status).toBe(403);
    expect((await request(app).post(`/api/bookings/${id}/advance/received`).set(auth(g.token))).status).toBe(403);

    const paid = await request(app).post(`/api/bookings/${id}/advance/paid`).set(auth(g.token));
    expect(paid.status).toBe(200);
    expect(paid.body.booking.advance.paid_at).toBeTruthy();
    const hostFeed = (await request(app).get('/api/notifications').set(auth(h.token))).body.items as any[];
    expect(hostFeed.some((n) => n.kind === 'advance_paid' && n.ref_id === id)).toBe(true);

    const got = await request(app).post(`/api/bookings/${id}/advance/received`).set(auth(h.token));
    expect(got.status).toBe(200);
    expect(got.body.booking.advance.received_at).toBeTruthy();
    const guestFeed = (await request(app).get('/api/notifications').set(auth(g.token))).body.items as any[];
    expect(guestFeed.some((n) => n.kind === 'advance_received' && n.ref_id === id)).toBe(true);

    // Safe to repeat.
    expect((await request(app).post(`/api/bookings/${id}/advance/received`).set(auth(h.token))).status).toBe(200);
  });

  it('is refused on a booking without an advance or not yet confirmed', async () => {
    const { listing } = await host('Refuse Host', null);
    const g = await registerUser({ name: 'Refused Guest' });
    const none = await confirmedBooking(g.user.id, listing, { advancePercent: null, advanceAmount: null });
    const accepted = await confirmedBooking(g.user.id, listing, { status: 'accepted', confirmedAt: null });
    const a = await request(app).post(`/api/bookings/${none}/advance/paid`).set(auth(g.token));
    expect(a.status).toBe(409);
    expect(a.body.code).toBe('no_advance');
    const b = await request(app).post(`/api/bookings/${accepted}/advance/paid`).set(auth(g.token));
    expect(b.status).toBe(409);
    expect(b.body.code).toBe('not_confirmed');
  });

  it('lets the host cancel once it is 24 hours late, keeping the ₹1', async () => {
    const { h, listing } = await host('Unpaid Host', { advance: { percent: 10, refund_days: 7 } }, 'unpaidhost@okaxis');
    const g = await registerUser({ name: 'Unpaid Guest' });
    const fresh = await confirmedBooking(g.user.id, listing);
    const late = await confirmedBooking(g.user.id, listing, { confirmedAt: new Date(Date.now() - 25 * HOUR).toISOString() });
    const received = await confirmedBooking(g.user.id, listing, {
      confirmedAt: new Date(Date.now() - 25 * HOUR).toISOString(), advanceReceivedAt: new Date().toISOString(),
    });
    const orderId = `mock_order_adv_${uuidv4().replace(/-/g, '').slice(0, 12)}`;
    await db.insert(schema.payments).values({
      id: uuidv4(), userId: g.user.id, flow: 'booking_commission', referenceId: late, amount: 100,
      orderId, status: 'paid', mock: true, createdAt: new Date().toISOString(), paidAt: new Date().toISOString(),
    } as any);

    const items = (await request(app).get('/api/bookings/provider').set(auth(h.token))).body.items as any[];
    expect(items.find((b) => b.id === fresh).advance_unpaid_open).toBe(false);
    expect(items.find((b) => b.id === late).advance_unpaid_open).toBe(true);
    expect(items.find((b) => b.id === received).advance_unpaid_open).toBe(false);

    expect((await request(app).post(`/api/bookings/${fresh}/advance/unpaid`).set(auth(h.token))).body.code).toBe('not_open');
    expect((await request(app).post(`/api/bookings/${received}/advance/unpaid`).set(auth(h.token))).body.code).toBe('not_open');
    expect((await request(app).post(`/api/bookings/${late}/advance/unpaid`).set(auth(g.token))).status).toBe(403);

    const res = await request(app).post(`/api/bookings/${late}/advance/unpaid`).set(auth(h.token));
    expect(res.status).toBe(200);
    expect(res.body.booking).toMatchObject({ status: 'cancelled', cancel_reason: 'advance_unpaid', cancelled_by: 'host' });
    const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.orderId, orderId)).limit(1);
    expect(payment.status).toBe('paid');
    const feed = (await request(app).get('/api/notifications').set(auth(g.token))).body.items as any[];
    expect(feed.some((n) => n.kind === 'booking_cancelled' && n.ref_id === late)).toBe(true);
  });
});
