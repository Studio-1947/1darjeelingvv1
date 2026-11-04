import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, onboardActiveProvider, loginAdmin, createListing } from './helpers';

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
    ...(listing.type === 'homestay' ? { check_in: '2031-03-01', check_out: '2031-03-03' } : { check_in: '2031-03-01' }),
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

  it('will not take the ₹1 fee for a request the host has not accepted', async () => {
    const { hostToken, listing } = await hostListing('Fee Gate', 'homestay');
    const { token: guest } = await registerUser({ name: 'No Pass Guest', paySupport: false });
    const booking = await ask(guest, listing);

    const order = await request(app).post('/api/payments/order').set(auth(guest))
      .send({ flow: 'booking_commission', reference_id: booking.id });
    expect(order.status).toBe(409);
    expect(order.body.code).toBe('awaiting_host');

    await request(app).patch(`/api/bookings/${booking.id}/confirm`).set(auth(hostToken)).expect(200);

    // Once accepted, the traveller without a pass is asked for the fee as before.
    const checkout = await request(app).post(`/api/bookings/${booking.id}/checkout`).set(auth(guest));
    expect(checkout.status).toBe(402);
    expect(checkout.body.code).toBe('fee_required');
    const paid = await request(app).post('/api/payments/order').set(auth(guest))
      .send({ flow: 'booking_commission', reference_id: booking.id });
    expect(paid.status).toBe(200);
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
});
