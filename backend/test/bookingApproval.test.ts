import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, onboardActiveProvider, loginAdmin, createListing, inDays, payToSend } from './helpers';
import { eq } from 'drizzle-orm';
import { db, schema } from '../src/db';

/**
 * Board: "Book > Waiting for approval > Call/WhatsApp" (drivers, homestays) and "based on
 * availability, confirm" (guides). A request on a real host's listing cannot be confirmed - not
 * with the pass, not by paying the ₹1 fee - until the host accepts it. Listings with no host
 * account behind them (team-curated) have nobody to accept, so they still confirm straight away.
 */

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function hostListing(name: string, type: 'homestay' | 'driver' | 'guide', extras: Record<string, unknown> = {}) {
  const { token: hostToken, providerId } = await onboardActiveProvider({ name });
  const admin = await loginAdmin();
  const res = await request(app).post('/api/listings').set(auth(admin)).send({
    title: `${name} ${type}`,
    type,
    description: 'A real host listing',
    location: 'Darjeeling',
    price: 1500,
    provider_id: providerId,
    extras,
  });
  expect(res.status).toBe(200);
  return { hostToken, providerId, listing: res.body.item };
}

async function ask(token: string, listing: any, body: Record<string, unknown> = {}) {
  const res = await request(app).post('/api/bookings').set(auth(token)).send({
    listing_id: listing.id,
    listing_type: listing.type,
    ...(listing.type === 'homestay' ? { check_in: inDays(10), check_out: inDays(12) } : { check_in: inDays(10) }),
    ...body,
  });
  expect(res.status).toBe(200);
  return res.body.booking;
}

describe('host approval before a booking can be confirmed', () => {
  for (const type of ['homestay', 'driver', 'guide'] as const) {
    it(`a ${type} request waits for the host, then confirms once accepted`, async () => {
      const { hostToken, listing } = await hostListing(`Approve ${type}`, type);
      const { token: guest } = await registerUser({ name: `Guest ${type}` }); // has the pass

      const booking = await ask(guest, listing);
      expect(booking.status).toBe('pending_payment');
      expect(booking.awaiting_host).toBe(true);

      // Even with the pass, checkout is refused while the host has not said yes.
      const early = await request(app).post(`/api/bookings/${booking.id}/checkout`).set(auth(guest));
      expect(early.status).toBe(409);
      expect(early.body.code).toBe('awaiting_host');

      const mine = await request(app).get('/api/bookings/me').set(auth(guest));
      expect(mine.body.items.find((b: any) => b.id === booking.id).awaiting_host).toBe(true);

      const hostView = await request(app).get('/api/bookings/provider').set(auth(hostToken));
      expect(hostView.body.items.find((b: any) => b.id === booking.id).awaiting_host).toBe(true);

      const accepted = await request(app).patch(`/api/bookings/${booking.id}/confirm`).set(auth(hostToken));
      expect(accepted.status).toBe(200);
      expect(accepted.body.booking.status).toBe('accepted');

      const after = await request(app).get('/api/bookings/me').set(auth(guest));
      expect(after.body.items.find((b: any) => b.id === booking.id).awaiting_host).toBe(false);

      const done = await request(app).post(`/api/bookings/${booking.id}/checkout`).set(auth(guest));
      expect(done.status).toBe(200);
      expect(done.body.booking.status).toBe('confirmed');
    });
  }

  it('without the pass: the request reaches the host only after the ₹1 fee, then confirms free', async () => {
    const { hostToken, listing } = await hostListing('Fee Gate', 'homestay');
    const { token: guest } = await registerUser({ name: 'No Pass Guest', paySupport: false });

    const res = await request(app).post('/api/bookings').set(auth(guest))
      .send({ listing_id: listing.id, check_in: inDays(10), check_out: inDays(12) });
    expect(res.status).toBe(200);
    expect(res.body.fee_due).toBe(true);
    expect(res.body.amount).toBeGreaterThan(0);
    const booking = res.body.booking;
    expect(booking.status).toBe('awaiting_fee');

    // Not sent: the host does not see it, cannot accept it, and it is not in My Trips.
    const hostBefore = await request(app).get('/api/bookings/provider').set(auth(hostToken));
    expect(hostBefore.body.items.find((b: any) => b.id === booking.id)).toBeUndefined();
    const early = await request(app).patch(`/api/bookings/${booking.id}/confirm`).set(auth(hostToken));
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('not_sent');
    const mine = await request(app).get('/api/bookings/me').set(auth(guest));
    expect(mine.body.items.find((b: any) => b.id === booking.id)).toBeUndefined();
    const send = await request(app).post(`/api/bookings/${booking.id}/send`).set(auth(guest));
    expect(send.status).toBe(402);
    expect(send.body.code).toBe('fee_required');

    await payToSend(guest, booking.id);
    const sent = await request(app).post(`/api/bookings/${booking.id}/send`).set(auth(guest));
    expect(sent.status).toBe(200);
    expect(sent.body.booking.status).toBe('pending_payment');
    expect(sent.body.booking.awaiting_host).toBe(true);
    const hostAfter = await request(app).get('/api/bookings/provider').set(auth(hostToken));
    expect(hostAfter.body.items.find((b: any) => b.id === booking.id)).toBeDefined();

    await request(app).patch(`/api/bookings/${booking.id}/confirm`).set(auth(hostToken)).expect(200);
    // The fee was for sending; confirming costs nothing more.
    const fee = await request(app).post('/api/payments/order').set(auth(guest))
      .send({ flow: 'booking_commission', reference_id: booking.id });
    expect(fee.status).toBe(409);
    expect(fee.body.code).toBe('booking_free');
    const checkout = await request(app).post(`/api/bookings/${booking.id}/checkout`).set(auth(guest));
    expect(checkout.status).toBe(200);
    expect(checkout.body.booking.status).toBe('confirmed');
  });

  it('keeps the ₹1.18 app convenience fee when the host declines', async () => {
    const { hostToken, listing } = await hostListing('Fee Decline', 'driver');
    const { token: guest } = await registerUser({ name: 'Declined Payer', paySupport: false });
    const res = await request(app).post('/api/bookings').set(auth(guest)).send({ listing_id: listing.id, check_in: inDays(10) });
    const id = res.body.booking.id;
    await payToSend(guest, id);
    const declined = await request(app).patch(`/api/bookings/${id}/cancel`).set(auth(hostToken)).send({ as: 'host' });
    expect(declined.status).toBe(200);
    expect(declined.body.refunded).toBe(false);
    const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.referenceId, id)).limit(1);
    expect(payment.status).toBe('paid');
  });

  it('lets the host decline a request instead', async () => {
    const { hostToken, listing } = await hostListing('Decline Host', 'driver');
    const { token: guest } = await registerUser({ name: 'Declined Guest' });
    const booking = await ask(guest, listing);

    const declined = await request(app).patch(`/api/bookings/${booking.id}/cancel`).set(auth(hostToken));
    expect(declined.status).toBe(200);
    expect(declined.body.booking.status).toBe('cancelled');
    const checkout = await request(app).post(`/api/bookings/${booking.id}/checkout`).set(auth(guest));
    expect(checkout.status).toBe(409);
  });

  it('keeps instant confirmation for listings with no host account', async () => {
    const listing = await createListing({ title: 'Curated Spot' });
    const { token: guest } = await registerUser({ name: 'Spot Guest' });
    const booking = await ask(guest, listing);
    expect(booking.awaiting_host).toBe(false);
    const checkout = await request(app).post(`/api/bookings/${booking.id}/checkout`).set(auth(guest));
    expect(checkout.status).toBe(200);
    expect(checkout.body.booking.status).toBe('confirmed');
  });

  it('lets an admin accept on behalf of a host', async () => {
    const { listing } = await hostListing('Away Host', 'homestay');
    const { token: guest } = await registerUser({ name: 'Admin Helped Guest' });
    const booking = await ask(guest, listing);
    const admin = await loginAdmin();
    const res = await request(app).patch(`/api/bookings/${booking.id}/confirm`).set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.booking.status).toBe('accepted');
  });

  it('tells the listing page when booking is a request, so the button says "Request to book"', async () => {
    const { listing } = await hostListing('Label Host', 'homestay');
    const hosted = await request(app).get(`/api/listings/${listing.id}`);
    expect(hosted.status).toBe(200);
    expect(hosted.body.item.request_to_book).toBe(true);

    // A team-run homestay (no host account) still confirms at once, so it keeps "Reserve".
    const admin = await loginAdmin();
    const team = await request(app).post('/api/listings').set(auth(admin)).send({
      title: 'Team Homestay', type: 'homestay', description: 'Run by the team', location: 'Darjeeling',
      price: 1500, provider_id: 'admin-seed-provider',
    });
    expect(team.status).toBe(200);
    const teamView = await request(app).get(`/api/listings/${team.body.item.id}`);
    expect(teamView.body.item.request_to_book).toBe(false);
  });

  it('accepting one request closes the other requests for the same nights, and tells those guests', async () => {
    const { hostToken, listing } = await hostListing('Busy Host', 'homestay');
    const { token: first } = await registerUser({ name: 'First Asker' });
    const { token: second } = await registerUser({ name: 'Second Asker' });
    const { token: later } = await registerUser({ name: 'Other Week Asker' });
    const a = await ask(first, listing, { check_in: inDays(32), check_out: inDays(35) });
    // A request holds its nights only for the short checkout window; after that, others can ask.
    await db.update(schema.bookings).set({ createdAt: new Date(Date.now() - 3600_000).toISOString() }).where(eq(schema.bookings.id, a.id));
    const b = await ask(second, listing, { check_in: inDays(34), check_out: inDays(36) }); // overlaps a
    const c = await ask(later, listing, { check_in: inDays(41), check_out: inDays(43) }); // does not

    const ok = await request(app).patch(`/api/bookings/${a.id}/confirm`).set(auth(hostToken));
    expect(ok.body.booking.status).toBe('accepted');

    const mineB = (await request(app).get('/api/bookings/me').set(auth(second))).body.items.find((x: any) => x.id === b.id);
    expect(mineB.status).toBe('cancelled');
    const feedB = (await request(app).get('/api/notifications').set(auth(second))).body.items;
    expect(feedB.some((n: any) => n.ref_id === b.id || n.refId === b.id)).toBe(true);

    const mineC = (await request(app).get('/api/bookings/me').set(auth(later))).body.items.find((x: any) => x.id === c.id);
    expect(mineC.status).toBe('pending_payment');
  });
});
