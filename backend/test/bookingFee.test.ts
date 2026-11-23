import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { registerUser, createListing, payToSend, activateSupport, inDays } from './helpers';

/**
 * The booking fee: with the aangan pass a request goes to the host free. Without it the request is
 * saved (`awaiting_fee`) and goes out only once the ₹1 fee is paid, or the pass is taken. The fee
 * comes back if the request never gets the traveller the host's number. Confirming is free.
 */

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function ask(token: string, listingId: string, body: Record<string, unknown> = {}) {
  const res = await request(app).post('/api/bookings').set(auth(token))
    .send({ listing_id: listingId, listing_type: 'spot', ...body });
  expect(res.status).toBe(200);
  return res.body as { booking: { id: string; status: string }; fee_due?: boolean };
}

describe('booking without the aangan pass', () => {
  it('saves the request unsent until the ₹1 fee is paid', async () => {
    const { token } = await registerUser({ name: 'No Pass Nima', paySupport: false });
    const listing = await createListing();
    const { booking, fee_due } = await ask(token, listing.id);
    expect(fee_due).toBe(true);
    expect(booking.status).toBe('awaiting_fee');

    // Not sent, so there is nothing to confirm yet.
    const early = await request(app).post(`/api/bookings/${booking.id}/checkout`).set(auth(token));
    expect(early.status).toBe(409);
    expect(early.body.code).toBe('not_sent');

    await payToSend(token, booking.id);
    const sent = await request(app).post(`/api/bookings/${booking.id}/send`).set(auth(token));
    expect(sent.status).toBe(200);
    expect(sent.body.booking.status).toBe('pending_payment');

    // A second fee is refused: the request has gone.
    const again = await request(app).post('/api/payments/order').set(auth(token))
      .send({ flow: 'booking_commission', reference_id: booking.id });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('booking_free');

    const checkout = await request(app).post(`/api/bookings/${booking.id}/checkout`).set(auth(token));
    expect(checkout.status).toBe(200);
    const mine = await request(app).get('/api/bookings/me').set(auth(token));
    expect(mine.body.items.find((b: { id: string }) => b.id === booking.id)?.status).toBe('confirmed');
  });

  it('sends free once the traveller takes the pass instead', async () => {
    const { token, user } = await registerUser({ name: 'Late Pass Lhamu', paySupport: false });
    const listing = await createListing();
    const { booking } = await ask(token, listing.id);
    await activateSupport(token, user.id);
    const sent = await request(app).post(`/api/bookings/${booking.id}/send`).set(auth(token));
    expect(sent.status).toBe(200);
    expect(sent.body.booking.status).toBe('pending_payment');
  });

  it('pressing Send again replaces the unsent request instead of piling them up', async () => {
    const { token } = await registerUser({ name: 'Double Tap Dawa', paySupport: false });
    const listing = await createListing();
    const first = await ask(token, listing.id);
    const second = await ask(token, listing.id);
    const [old] = await db.select().from(schema.bookings).where(eq(schema.bookings.id, first.booking.id)).limit(1);
    expect(old.status).toBe('cancelled');
    expect(second.booking.status).toBe('awaiting_fee');
  });

  it('keeps the app convenience fee whether the guest withdraws before confirming or cancels after', async () => {
    const { token } = await registerUser({ name: 'Withdrawing Wangmo', paySupport: false });
    const listing = await createListing();
    const a = (await ask(token, listing.id)).booking.id;
    await payToSend(token, a);
    const withdrawn = await request(app).patch(`/api/bookings/${a}/cancel`).set(auth(token));
    expect(withdrawn.body.refunded).toBe(false);

    // Confirmed means the guest has had the host's number: dropping it keeps the fee paid.
    const listing2 = await createListing();
    // Dated in the future: a booking with no date counts as completed once confirmed, and a
    // completed trip cannot be cancelled at all.
    const b = (await ask(token, listing2.id, { check_in: inDays(20) })).booking.id;
    await payToSend(token, b);
    await request(app).post(`/api/bookings/${b}/checkout`).set(auth(token)).expect(200);
    const dropped = await request(app).patch(`/api/bookings/${b}/cancel`).set(auth(token));
    expect(dropped.status).toBe(200);
    expect(dropped.body.refunded).toBe(false);
    const [payment] = await db.select().from(schema.payments).where(eq(schema.payments.referenceId, b)).limit(1);
    expect(payment.status).toBe('paid');
  });

  it('cannot pay the fee on someone else\'s booking', async () => {
    const owner = await registerUser({ name: 'Booker', paySupport: false });
    const other = await registerUser({ name: 'Stranger', paySupport: false });
    const listing = await createListing();
    const { booking } = await ask(owner.token, listing.id);
    const res = await request(app).post('/api/payments/order').set(auth(other.token))
      .send({ flow: 'booking_commission', reference_id: booking.id });
    expect(res.status).toBe(403);
    const send = await request(app).post(`/api/bookings/${booking.id}/send`).set(auth(other.token));
    expect(send.status).toBe(403);
  });
});

describe('confirming once', () => {
  it('confirming twice does not tell anyone a second time', async () => {
    const { token } = await registerUser({ name: 'Once Only', paySupport: false });
    const listing = await createListing();
    const { booking } = await ask(token, listing.id);
    const id = booking.id;
    await payToSend(token, id);
    await request(app).post(`/api/bookings/${id}/checkout`).set(auth(token));
    // A second tap (or the app retrying) confirms nothing new.
    const again = await request(app).post(`/api/bookings/${id}/checkout`).set(auth(token));
    expect(again.status).toBe(200);
    const feed = await request(app).get('/api/notifications').set(auth(token));
    const confirmed = (feed.body.items || []).filter((n: any) => n.kind === 'booking_confirmed' && n.ref_id === id);
    expect(confirmed).toHaveLength(1);
  });
});

describe('booking with the aangan pass', () => {
  it('sends and confirms free', async () => {
    const { token } = await registerUser({ name: 'Pass Pema' });
    const listing = await createListing();
    const { booking, fee_due } = await ask(token, listing.id);
    expect(fee_due).toBeUndefined();
    expect(booking.status).toBe('pending_payment');
    const checkout = await request(app).post(`/api/bookings/${booking.id}/checkout`).set(auth(token));
    expect(checkout.status).toBe(200);
    expect(checkout.body.booking.status).toBe('confirmed');
  });
});
