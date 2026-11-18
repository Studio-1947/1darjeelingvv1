import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { isHostPlanLive } from '../src/lib/hostPlan';
import { isOnGrace, sweepGraceEnded } from '../src/lib/hostGrace';
import { createConfirmedBooking, inDays, loginAdmin, onboardActiveProvider, registerUser } from './helpers';

/**
 * The free start (user decisions 2026-11-07 and -08): a new host goes live without paying, and pays
 * the first year after 3 completed bookings - confirmed, and the stay, ride or tour has taken place
 * (delivered orders count for cafes and shops). After that, new bookings pause until they pay; the
 * listing stays up and waiting requests can still be taken.
 */

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function signUpHost(name: string, businessType = 'homestay') {
  const { token, phone } = await registerUser({ name, role: 'provider' });
  const onboard = await request(app).post('/api/providers/onboard').set(auth(token)).send({
    business_name: `${name} Stay`,
    business_type: businessType,
    description: 'A warm family home with a view of the hills',
    location: 'Ghoom',
    contact_phone: phone,
    price_from: 1500,
  });
  expect(onboard.status).toBe(200);
  expect(onboard.body.provider.status).toBe('pending_payment');
  return { token, phone, providerId: onboard.body.provider.id as string };
}

/** Signs up, starts free and (unless asked not to) clears approval, as a verified host would be. */
async function freeHost(name: string, businessType = 'homestay', { approved = true } = {}) {
  const host = await signUpHost(name, businessType);
  const res = await request(app).post('/api/providers/me/start-free').set(auth(host.token));
  expect(res.status).toBe(200);
  if (approved) {
    await db.update(schema.providers).set({ approvalRequired: false }).where(eq(schema.providers.id, host.providerId));
  }
  const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.providerId, host.providerId));
  return { ...host, listing };
}

const me = async (token: string) => (await request(app).get('/api/providers/me').set(auth(token))).body.provider;

async function requestStay(token: string, listingId: string, from: number) {
  return request(app).post('/api/bookings').set(auth(token))
    .send({ listing_id: listingId, listing_type: 'homestay', check_in: inDays(from), check_out: inDays(from + 1) });
}

/**
 * The guests have been and gone: moves the listing's confirmed bookings into the past, each on its
 * own day, so they count as completed (bookings cannot be made for past dates).
 */
async function finishStays(listingId: string) {
  const rows = await db.select().from(schema.bookings)
    .where(and(eq(schema.bookings.listingId, listingId), eq(schema.bookings.status, 'confirmed')));
  let back = 30;
  for (const b of rows) {
    await db.update(schema.bookings).set({ checkIn: inDays(-back), checkOut: inDays(-back + 1) }).where(eq(schema.bookings.id, b.id));
    back += 3;
  }
}

const graceNotes = async (providerId: string) => {
  const [hostRow] = await db.select().from(schema.providers).where(eq(schema.providers.id, providerId));
  return db.select().from(schema.notifications)
    .where(and(eq(schema.notifications.userId, hostRow.userId), eq(schema.notifications.kind, 'host_grace_ended')));
};

async function payRegistration(token: string, providerId: string) {
  const order = await request(app).post('/api/payments/order').set(auth(token))
    .send({ flow: 'provider_registration', reference_id: providerId });
  if (order.status !== 200) return order;
  return request(app).post('/api/payments/mock/complete').set(auth(token))
    .send({ order_id: order.body.order.id, flow: 'provider_registration', reference_id: providerId });
}

describe('plan rules with the free start', () => {
  it('a host on the free start is live without a paid year; suspended is not', () => {
    expect(isHostPlanLive({ status: 'active', planExpiresAt: null, grace: true })).toBe(true);
    expect(isHostPlanLive({ status: 'suspended', planExpiresAt: null, grace: true })).toBe(false);
    expect(isHostPlanLive({ status: 'active', planExpiresAt: null, grace: false })).toBe(false);
    expect(isOnGrace({ status: 'active', grace: true })).toBe(true);
    expect(isOnGrace({ status: 'pending_payment', grace: true })).toBe(false);
    expect(isOnGrace(null)).toBe(false);
  });
});

describe('POST /providers/me/start-free', () => {
  it('makes the sign-up an active host on the free start, with one listing and no payment', async () => {
    const host = await signUpHost('Pema');
    const res = await request(app).post('/api/providers/me/start-free').set(auth(host.token));
    expect(res.status).toBe(200);
    expect(res.body.provider).toMatchObject({ status: 'active', grace: true, plan_active: true, plan_expires_at: null });
    expect(res.body.provider.badges.member).toBe(false);
    expect(res.body.grace).toEqual({ used: 0, limit: 2, paused: false });

    const listings = await db.select().from(schema.listings).where(eq(schema.listings.providerId, host.providerId));
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({ title: 'Pema Stay', type: 'homestay', price: 1500 });
    const payments = await db.select().from(schema.payments).where(eq(schema.payments.referenceId, host.providerId));
    expect(payments).toHaveLength(0);

    const mine = await me(host.token);
    expect(mine).toMatchObject({ status: 'active', plan_active: true, grace: { used: 0, limit: 2, paused: false } });
  });

  it('is safe to call twice: still one listing', async () => {
    const host = await signUpHost('Dorjee');
    const [a, b] = await Promise.all([
      request(app).post('/api/providers/me/start-free').set(auth(host.token)),
      request(app).post('/api/providers/me/start-free').set(auth(host.token)),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const again = await request(app).post('/api/providers/me/start-free').set(auth(host.token));
    expect(again.status).toBe(200);
    const listings = await db.select().from(schema.listings).where(eq(schema.listings.providerId, host.providerId));
    expect(listings).toHaveLength(1);
  });

  it('refuses someone with no sign-up, a host who has paid, and a suspended one', async () => {
    const nobody = await registerUser({ name: 'No Business', role: 'provider' });
    expect((await request(app).post('/api/providers/me/start-free').set(auth(nobody.token))).status).toBe(404);

    const paid = await onboardActiveProvider({ name: 'Paid Host' });
    const r = await request(app).post('/api/providers/me/start-free').set(auth(paid.token));
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('already_registered');

    const host = await signUpHost('Suspended Sonam');
    await db.update(schema.providers).set({ status: 'suspended' }).where(eq(schema.providers.id, host.providerId));
    expect((await request(app).post('/api/providers/me/start-free').set(auth(host.token))).status).toBe(403);
  });

  it('needs a signed-in user', async () => {
    expect((await request(app).post('/api/providers/me/start-free')).status).toBe(401);
  });

  it('keeps the listing hidden until the documents are approved, as for every new host', async () => {
    const host = await freeHost('Waiting Wangdi', 'homestay', { approved: false });
    const traveller = await registerUser({ name: 'Curious Traveller' });
    const feed = await request(app).get('/api/listings?limit=100');
    expect(feed.body.items.some((i: any) => i.id === host.listing.id)).toBe(false);
    expect((await request(app).get(`/api/listings/${host.listing.id}`).set(auth(traveller.token))).status).toBe(404);
    expect((await requestStay(traveller.token, host.listing.id, 5)).status).toBe(409);

    await db.update(schema.providers).set({ kycStatus: 'verified' }).where(eq(schema.providers.id, host.providerId));
    const after = await request(app).get(`/api/listings/${host.listing.id}`);
    expect(after.status).toBe(200);
    expect(after.body.item.bookings_paused).toBe(false);
  });
});

describe('the 2-booking limit', () => {
  it('pauses new bookings once the 2nd booking is completed, keeps the listing up, and tells the host once', async () => {
    const host = await freeHost('Busy Bhutia');
    const traveller = await registerUser({ name: 'Frequent Traveller' });

    for (const from of [10, 20]) {
      await createConfirmedBooking({
        token: traveller.token, listingId: host.listing.id, listingType: 'homestay',
        checkIn: inDays(from), checkOut: inDays(from + 1),
      });
    }
    // Confirmed but not yet stayed: nothing used, still taking bookings.
    expect((await me(host.token)).grace).toEqual({ used: 0, limit: 2, paused: false });
    await sweepGraceEnded();
    expect(await graceNotes(host.providerId)).toHaveLength(0);

    await finishStays(host.listing.id);
    expect((await me(host.token)).grace).toEqual({ used: 2, limit: 2, paused: true });
    // The sweep tells the host; running it again does not repeat the note.
    await sweepGraceEnded();
    await sweepGraceEnded();

    const blocked = await requestStay(traveller.token, host.listing.id, 40);
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe('host_plan_required');

    // Still on the site, with booking turned off.
    const detail = await request(app).get(`/api/listings/${host.listing.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.item.bookings_paused).toBe(true);
    const feed = await request(app).get('/api/listings?limit=100');
    expect(feed.body.items.some((i: any) => i.id === host.listing.id)).toBe(true);

    const notes = await graceNotes(host.providerId);
    expect(notes).toHaveLength(1);
    expect(notes[0].body).toMatch(/2 guests have now completed their bookings/);
  });

  it('counts a booking from the day after its last day; a check-out today is not complete yet', async () => {
    const host = await freeHost('Careful Chettri');
    const traveller = await registerUser({ name: 'Weekend Traveller' });
    await createConfirmedBooking({ token: traveller.token, listingId: host.listing.id, listingType: 'homestay', checkIn: inDays(5), checkOut: inDays(6) });
    const [b] = await db.select().from(schema.bookings).where(eq(schema.bookings.listingId, host.listing.id));

    await db.update(schema.bookings).set({ checkIn: inDays(-1), checkOut: inDays(0) }).where(eq(schema.bookings.id, b.id));
    expect((await me(host.token)).grace.used).toBe(0);
    await db.update(schema.bookings).set({ checkIn: inDays(-2), checkOut: inDays(-1) }).where(eq(schema.bookings.id, b.id));
    expect((await me(host.token)).grace.used).toBe(1);

    // A cancelled booking never counts, even once its dates have passed.
    await db.update(schema.bookings).set({ status: 'cancelled' }).where(eq(schema.bookings.id, b.id));
    expect((await me(host.token)).grace.used).toBe(0);
  });

  it('counts only completed bookings, not requests still waiting', async () => {
    const host = await freeHost('Patient Pradhan');
    const traveller = await registerUser({ name: 'Undecided Traveller' });
    for (const from of [10, 20, 30, 40]) {
      expect((await requestStay(traveller.token, host.listing.id, from)).status).toBe(200);
    }
    expect((await me(host.token)).grace).toEqual({ used: 0, limit: 2, paused: false });
  });

  it('lets a request made before the limit still be accepted and confirmed after it', async () => {
    const host = await freeHost('Fair Gurung');
    const first = await registerUser({ name: 'First Guest' });
    const late = await registerUser({ name: 'Late Guest' });

    await createConfirmedBooking({ token: first.token, listingId: host.listing.id, listingType: 'homestay', checkIn: inDays(10), checkOut: inDays(11) });
    // Asked while the host still had a free booking left.
    const waiting = await requestStay(late.token, host.listing.id, 50);
    expect(waiting.status).toBe(200);
    await createConfirmedBooking({ token: first.token, listingId: host.listing.id, listingType: 'homestay', checkIn: inDays(30), checkOut: inDays(31) });
    await finishStays(host.listing.id);
    expect((await me(host.token)).grace.paused).toBe(true);

    const accept = await request(app).patch(`/api/bookings/${waiting.body.booking.id}/confirm`).set(auth(host.token));
    expect(accept.status).toBe(200);
    const checkout = await request(app).post(`/api/bookings/${waiting.body.booking.id}/checkout`).set(auth(late.token));
    expect(checkout.status).toBe(200);
    // Confirmed, but the stay is still ahead: it counts once it has happened.
    expect((await me(host.token)).grace.used).toBe(2);
  });

  it('never limits a host who paid at sign-up', async () => {
    const paid = await onboardActiveProvider({ name: 'Paid Pradhan' });
    const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.providerId, paid.providerId));
    const traveller = await registerUser({ name: 'Loyal Traveller' });
    for (const from of [10, 20, 30, 40]) {
      await createConfirmedBooking({ token: traveller.token, listingId: listing.id, listingType: 'homestay', checkIn: inDays(from), checkOut: inDays(from + 1) });
    }
    await finishStays(listing.id);
    expect((await me(paid.token)).grace).toBeNull();
    expect((await requestStay(traveller.token, listing.id, 50)).status).toBe(200);
  });
});

describe('paying ends the free start', () => {
  it('starts the paid year from today, keeps the one listing, and lifts the pause', async () => {
    const host = await freeHost('Paying Pemba');
    const traveller = await registerUser({ name: 'Return Guest' });
    for (const from of [10, 20, 30]) {
      await createConfirmedBooking({ token: traveller.token, listingId: host.listing.id, listingType: 'homestay', checkIn: inDays(from), checkOut: inDays(from + 1) });
    }
    await finishStays(host.listing.id);
    expect((await requestStay(traveller.token, host.listing.id, 40)).status).toBe(409);

    const paid = await payRegistration(host.token, host.providerId);
    expect(paid.status).toBe(200);

    const mine = await me(host.token);
    expect(mine.grace).toBeNull();
    expect(mine.plan_active).toBe(true);
    expect(mine.badges.member).toBe(true);
    const daysLeft = (Date.parse(mine.plan_expires_at) - Date.now()) / 86_400_000;
    expect(daysLeft).toBeGreaterThan(364);
    expect(daysLeft).toBeLessThanOrEqual(365);

    const listings = await db.select().from(schema.listings).where(eq(schema.listings.providerId, host.providerId));
    expect(listings).toHaveLength(1);
    expect((await requestStay(traveller.token, host.listing.id, 40)).status).toBe(200);
    expect((await request(app).get(`/api/listings/${host.listing.id}`)).body.item.bookings_paused).toBe(false);
  });

  it('can be paid early, before any booking', async () => {
    const host = await freeHost('Early Ezra');
    expect((await payRegistration(host.token, host.providerId)).status).toBe(200);
    expect((await me(host.token)).grace).toBeNull();
    // Paid once: a second registration is refused, as before.
    const again = await request(app).post('/api/payments/order').set(auth(host.token))
      .send({ flow: 'provider_registration', reference_id: host.providerId });
    expect(again.status).toBe(409);
  });

  it('does not offer a renewal before the first year is paid', async () => {
    const host = await freeHost('Renewing Rai');
    const renew = await request(app).post('/api/payments/order').set(auth(host.token))
      .send({ flow: 'provider_renewal', reference_id: host.providerId });
    expect(renew.status).toBe(409);
    expect(renew.body.code).toBe('on_grace');
  });

  it('refuses a registration payment from a suspended host', async () => {
    const host = await freeHost('Barred Bhujel');
    await db.update(schema.providers).set({ status: 'suspended' }).where(eq(schema.providers.id, host.providerId));
    const order = await request(app).post('/api/payments/order').set(auth(host.token))
      .send({ flow: 'provider_registration', reference_id: host.providerId });
    expect(order.status).toBe(403);
  });
});

describe('cafes and shops: delivered orders count', () => {
  it('pauses new delivery requests after 2 delivered orders; accepted ones do not count', async () => {
    const cafe = await freeHost('Momo Corner', 'cafe');
    await db.update(schema.listings).set({ extras: { ...(cafe.listing.extras || {}), home_delivery: true } })
      .where(eq(schema.listings.id, cafe.listing.id));
    const traveller = await registerUser({ name: 'Hungry Traveller' });
    const order = () => request(app).post('/api/deliveries').set(auth(traveller.token))
      .send({ listing_id: cafe.listing.id, items: [{ name: 'Thukpa', qty: 1 }], address: 'Near the clock tower, Darjeeling' });
    const answer = (id: string, status: string) =>
      request(app).patch(`/api/deliveries/${id}`).set(auth(cafe.token)).send({ status });

    for (let i = 0; i < 2; i++) {
      const made = await order();
      expect(made.status).toBe(201);
      expect((await answer(made.body.request.id, 'accepted')).status).toBe(200);
      if (i < 1) expect((await answer(made.body.request.id, 'delivered')).status).toBe(200);
    }
    expect((await me(cafe.token)).grace).toEqual({ used: 1, limit: 2, paused: false });

    const [third] = await db.select().from(schema.deliveryRequests)
      .where(and(eq(schema.deliveryRequests.providerId, cafe.providerId), eq(schema.deliveryRequests.status, 'accepted')));
    expect((await answer(third.id, 'delivered')).status).toBe(200);
    expect((await me(cafe.token)).grace.paused).toBe(true);

    const refused = await order();
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe('host_plan_required');
  });
});

describe('admin and help number', () => {
  it('shows the admin which waiting hosts are on the free start', async () => {
    const host = await freeHost('Listed Lepcha', 'homestay', { approved: false });
    const unpaid = await signUpHost('Unstarted Usha');
    const admin = await loginAdmin();
    const res = await request(app).get('/api/admin/hosts/waiting').set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.hosts.find((h: any) => h.provider_id === host.providerId)?.on_free_start).toBe(true);
    expect(res.body.hosts.find((h: any) => h.provider_id === unpaid.providerId)?.on_free_start).toBe(false);
  });

  it('tells the sign-up screens the help number (null when unset) and the free bookings', async () => {
    const res = await request(app).get('/api/app/host-signup');
    expect(res.status).toBe(200);
    // live_hosts / recent_hosts (the home card's "N are in") are covered in businessTheme.test.ts.
    expect(res.body).toMatchObject({ support_phone: null, grace_bookings: 2 });
  });
});
