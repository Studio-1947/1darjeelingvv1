import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { onboardActiveProvider, registerUser } from './helpers';

/**
 * One yearly membership per listing (user decision 2026-11-25, lib/listingPlan.ts): each listing
 * pays by its own type, starts on its own free start, gets its own card number, and lapses alone.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

async function pay(token: string, flow: string, referenceId: string) {
  const order = await request(app).post('/api/payments/order').set('Authorization', `Bearer ${token}`)
    .send({ flow, reference_id: referenceId });
  if (order.status !== 200) return { order, complete: null };
  const complete = await request(app).post('/api/payments/mock/complete').set('Authorization', `Bearer ${token}`)
    .send({ order_id: order.body.order.id, flow, reference_id: referenceId });
  return { order, complete };
}

async function listingsOf(providerId: string) {
  return db.select().from(schema.listings).where(eq(schema.listings.providerId, providerId));
}

async function addListing(token: string, type: string, title: string) {
  const res = await request(app).post('/api/listings').set('Authorization', `Bearer ${token}`).send({
    title, type, description: `A ${type} listed by the same business`, location: 'Darjeeling', price: 1500,
  });
  if (res.status !== 200 && res.status !== 201) throw new Error(`add listing failed: ${res.status} ${JSON.stringify(res.body)}`);
  return (res.body.listing?.id || res.body.item?.id || res.body.id) as string;
}

async function dashboardListing(token: string, id: string) {
  const res = await request(app).get('/api/bookings/provider').set('Authorization', `Bearer ${token}`);
  return (res.body.listings as any[]).find((l) => l.id === id);
}

describe('a membership per listing', () => {
  it('gives the first listing its year and a card number when the business plan is paid', async () => {
    const { providerId } = await onboardActiveProvider({ name: 'Card Holder' });
    const [first] = await listingsOf(providerId);
    expect(first.planGrace).toBe(false);
    expect(first.memberNo).toMatch(/^AGN-\d{5}$/);
    expect(Date.parse(first.planExpiresAt!) - Date.now()).toBeGreaterThan(364 * DAY_MS);
  });

  it('puts a listing added later on its own free start, still live, priced by its own type', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Two Kinds' });
    const carId = await addListing(token, 'driver', 'Two Kinds car');
    const [car] = (await listingsOf(providerId)).filter((l) => l.id === carId);
    expect(car.planGrace).toBe(true);
    expect(car.memberNo).toBeNull();

    const plan = (await dashboardListing(token, carId)).plan;
    expect(plan).toMatchObject({ needed: true, member: false, on_free_start: true });
    expect(plan.price.total).toBe(58882);

    const feed = await request(app).get('/api/listings?type=driver');
    expect(feed.body.items.some((i: any) => i.id === carId)).toBe(true);
  });

  it('charges a cafe listing ₹99 + GST even when the business is a homestay', async () => {
    const { token } = await onboardActiveProvider({ name: 'Stay And Cafe' });
    const cafeId = await addListing(token, 'cafe', 'Stay And Cafe kitchen');
    const { order } = await pay(token, 'listing_plan', cafeId);
    expect(order.status).toBe(200);
    expect(order.body.amount).toBe(11682);
  });

  it('pays one listing at a time: its year starts, it gets the next card number, the other is untouched', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Pay Per Listing' });
    const [first] = await listingsOf(providerId);
    const carId = await addListing(token, 'driver', 'Pay Per Listing car');

    const { order, complete } = await pay(token, 'listing_plan', carId);
    expect(order.status).toBe(200);
    expect(order.body.amount).toBe(58882);
    expect(complete!.status).toBe(200);

    const rows = await listingsOf(providerId);
    const car = rows.find((l) => l.id === carId)!;
    const stay = rows.find((l) => l.id === first.id)!;
    expect(car.planGrace).toBe(false);
    expect(car.memberNo).toMatch(/^AGN-\d{5}$/);
    expect(car.memberNo).not.toBe(stay.memberNo);
    expect(Date.parse(car.planExpiresAt!) - Date.now()).toBeGreaterThan(364 * DAY_MS);
    expect(stay.planExpiresAt).toBe(first.planExpiresAt);

    // Its own Member badge and card number on its public page.
    const detail = await request(app).get(`/api/listings/${carId}`);
    expect(detail.body.item.provider_member).toBe(true);
    expect(detail.body.item.member_no).toBe(car.memberNo);
  });

  it('hides only the listing whose own year has passed', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'One Lapses' });
    const [stay] = await listingsOf(providerId);
    const carId = await addListing(token, 'driver', 'One Lapses car');
    await pay(token, 'listing_plan', carId);

    await db.update(schema.listings).set({ planExpiresAt: new Date(Date.now() - DAY_MS).toISOString() })
      .where(eq(schema.listings.id, carId));

    expect((await request(app).get(`/api/listings/${carId}`)).status).toBe(404);
    expect((await request(app).get(`/api/listings/${stay.id}`)).status).toBe(200);
    const feed = await request(app).get('/api/listings?type=homestay');
    expect(feed.body.items.some((i: any) => i.id === stay.id)).toBe(true);

    // Renewing it brings it straight back, a year from today.
    const { order, complete } = await pay(token, 'listing_renewal', carId);
    expect(order.status).toBe(200);
    expect(complete!.status).toBe(200);
    expect((await request(app).get(`/api/listings/${carId}`)).status).toBe(200);
  });

  it('refuses a second first year, an early renewal, a renewal on the free start, and a free shop', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Refusals' });
    const [stay] = await listingsOf(providerId);
    expect((await pay(token, 'listing_plan', stay.id)).order.body.code).toBe('already_paid');
    const early = await pay(token, 'listing_renewal', stay.id);
    expect(early.order.status).toBe(409);
    expect(early.order.body.detail).toMatch(/30 days/);

    const carId = await addListing(token, 'driver', 'Refusals car');
    expect((await pay(token, 'listing_renewal', carId)).order.body.code).toBe('on_grace');

    const shopId = await addListing(token, 'shop', 'Refusals shop');
    expect((await pay(token, 'listing_plan', shopId)).order.body.code).toBe('free_listing');
  });

  it("refuses to pay for someone else's listing", async () => {
    const { providerId } = await onboardActiveProvider({ name: 'Not Yours' });
    const [stay] = await listingsOf(providerId);
    const { token: other } = await registerUser({ name: 'Other Person' });
    expect((await pay(other, 'listing_plan', stay.id)).order.status).toBe(403);
  });
});
