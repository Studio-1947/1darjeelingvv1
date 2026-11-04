import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { onboardActiveProvider, registerUser } from './helpers';
import { slugify } from '../src/lib/providerSlug';
import { isOngoing, isUpcoming, routeEnds } from '../src/lib/hostStats';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const iso = (days: number) => new Date(Date.now() + days * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

async function firstListing(providerId: string) {
  const [l] = await db.select().from(schema.listings).where(eq(schema.listings.providerId, providerId)).limit(1);
  return l;
}

async function addBooking(userId: string, listing: { id: string; type: string; title: string }, b: Partial<typeof schema.bookings.$inferInsert>) {
  await db.insert(schema.bookings).values({
    id: uuidv4(), userId, listingId: listing.id, listingType: listing.type, listingTitle: listing.title,
    checkIn: null, checkOut: null, guests: 2, notes: '', status: 'confirmed', createdAt: new Date().toISOString(), ...b,
  } as any);
}

describe('host public page (aanganerp.in/<type>/<slug>)', () => {
  it('gives each host a unique address and serves the page with both badges', async () => {
    expect(slugify("Norbu's Hill-top Stay!")).toBe('norbus-hill-top-stay');
    const a = await onboardActiveProvider({ name: 'Same Name' });
    const b = await onboardActiveProvider({ name: 'Same Name' });
    const me = (t: string) => request(app).get('/api/providers/me').set(auth(t));
    const pa = (await me(a.token)).body.provider;
    const pb = (await me(b.token)).body.provider;
    expect(pa.slug).toBe('same-names-business');
    expect(pb.slug).toBe('same-names-business-2');
    expect(pa.page_path).toBe('/homestay/same-names-business');
    expect(pa.badges).toEqual({ member: true, verified: false });

    const page = await request(app).get(`/api/providers/page/homestay/${pa.slug}`);
    expect(page.status).toBe(200);
    expect(page.body.page).toMatchObject({ name: "Same Name's Business", member: true, verified: false, type: 'homestay' });
    expect(page.body.page.joinedAt).toBeTruthy();
    // A homestay's number stays locked for a signed-out visitor.
    expect(page.body.contact.locked).toBe(true);
    expect(page.body.listings.length).toBeGreaterThan(0);

    const wrongType = await request(app).get(`/api/providers/page/driver/${pa.slug}`);
    expect(wrongType.status).toBe(404);
    expect(wrongType.body.path).toBe('/homestay/same-names-business');
  });

  it('hides a host awaiting approval from everyone but the host', async () => {
    const h = await onboardActiveProvider({ name: 'Hidden Host', awaitingApproval: true });
    const { slug } = (await request(app).get('/api/providers/me').set(auth(h.token))).body.provider;
    expect((await request(app).get(`/api/providers/page/homestay/${slug}`)).status).toBe(404);
    const own = await request(app).get(`/api/providers/page/homestay/${slug}`).set(auth(h.token));
    expect(own.status).toBe(200);
    expect(own.body.not_live).toBe(true);
  });

  it('a renamed business gets a new address', async () => {
    const h = await onboardActiveProvider({ name: 'Renamer' });
    const res = await request(app).patch('/api/providers/me').set(auth(h.token)).send({ business_name: 'Cloud Nine Stay' });
    expect(res.status).toBe(200);
    expect(res.body.provider.slug).toBe('cloud-nine-stay');
  });
});

describe('host dashboard figures', () => {
  it('knows ongoing and upcoming, and reads routes', () => {
    expect(isOngoing({ status: 'confirmed', checkIn: iso(-1), checkOut: iso(1) })).toBe(true);
    expect(isOngoing({ status: 'confirmed', checkIn: iso(2), checkOut: iso(4) })).toBe(false);
    expect(isUpcoming({ status: 'confirmed', checkIn: iso(3) })).toBe(true);
    expect(routeEnds('NJP Railway Station -> Darjeeling Town')).toEqual(['NJP Railway Station', 'Darjeeling Town']);
    expect(routeEnds('Bagdogra to Mirik')).toEqual(['Bagdogra', 'Mirik']);
    expect(routeEnds('Sight-seeing')).toBeNull();
  });

  it('counts km and places for a driver, ongoing guests, reviews and points', async () => {
    const d = await onboardActiveProvider({ name: 'Km Driver', businessType: 'driver' });
    const listing = await firstListing(d.providerId);
    const { user } = await registerUser({ name: 'Rider' });
    await addBooking(user.id, listing, { checkIn: iso(-10), routeName: 'NJP Railway Station -> Darjeeling Town' });
    await addBooking(user.id, listing, { checkIn: iso(-5), routeName: 'Darjeeling -> Ghum' });
    await addBooking(user.id, listing, { checkIn: iso(-3) });
    await addBooking(user.id, listing, { checkIn: iso(0), checkOut: iso(0), guests: 3 });
    await addBooking(user.id, listing, { checkIn: iso(5), guests: 4 });
    await db.insert(schema.reviews).values({ id: uuidv4(), userId: user.id, listingId: listing.id, rating: 5, comment: 'Great', photos: [], authorName: 'Rider', createdAt: new Date().toISOString() } as any);

    const stats = (await request(app).get('/api/providers/me/stats').set(auth(d.token))).body;
    expect(stats.completed).toBe(3);
    expect(stats.km_covered).toBe(71 + 7);
    expect(stats.locations_covered).toEqual(['Darjeeling', 'Darjeeling Town', 'Ghum', 'NJP Railway Station']);
    expect(stats.unknown_route_trips).toBe(1);
    expect(stats.ongoing).toBe(1);
    expect(stats.ongoing_guests).toBe(3);
    expect(stats.upcoming_guests).toBe(4);
    expect(stats.average_rating).toBe(5);
    expect(stats.recent_reviews[0]).toMatchObject({ rating: 5, comment: 'Great' });
    expect(stats.points).toBe(3 * 50 + 20);
    expect(stats.points_rules).toEqual({ completedBooking: 50, review: 10, fiveStarReview: 20, verified: 100, profileComplete: 50 });
  });
});

describe('after a trip', () => {
  it('marks it completed, lets the traveller review without a pass, and links the suggestion', async () => {
    const h = await onboardActiveProvider({ name: 'Review Host' });
    const listing = await firstListing(h.providerId);
    const t = await registerUser({ name: 'No Pass Reviewer', paySupport: false });
    const bookingId = uuidv4();
    await addBooking(t.user.id, listing, { id: bookingId, checkIn: iso(-4), checkOut: iso(-2) } as any);

    const before = (await request(app).get('/api/bookings/me').set(auth(t.token))).body.items[0];
    expect(before).toMatchObject({ completed: true, reviewed: false });

    const review = await request(app).post('/api/reviews').set(auth(t.token)).send({ listing_id: listing.id, rating: 4, comment: 'Lovely view' });
    expect(review.status).toBe(200);
    expect((await request(app).get('/api/bookings/me').set(auth(t.token))).body.items[0].reviewed).toBe(true);

    const s = await request(app).post('/api/feedback/aangan').set(auth(t.token)).send({ message: 'Add a map of homestays', booking_id: bookingId });
    expect(s.status).toBe(201);
    const other = await registerUser({ name: 'Other Person' });
    expect((await request(app).post('/api/feedback/aangan').set(auth(other.token)).send({ message: 'Not my trip', booking_id: bookingId })).status).toBe(400);
  });

  it('still needs the pass to review a place you have not finished a trip with', async () => {
    const h = await onboardActiveProvider({ name: 'Unvisited Host' });
    const listing = await firstListing(h.providerId);
    const t = await registerUser({ name: 'Drive-by Reviewer', paySupport: false });
    expect((await request(app).post('/api/reviews').set(auth(t.token)).send({ listing_id: listing.id, rating: 1 })).status).toBe(402);
  });
});

describe('home delivery requests', () => {
  it('goes open -> accepted -> delivered, and only to places with home delivery', async () => {
    const cafe = await onboardActiveProvider({ name: 'Momo Cafe', businessType: 'cafe' });
    const listing = await firstListing(cafe.providerId);
    const t = await registerUser({ name: 'Hungry Hari' });
    const ask = () => request(app).post('/api/deliveries').set(auth(t.token))
      .send({ listing_id: listing.id, items: [{ name: 'Veg momo', qty: 2 }], address: 'Room 4, Hill Cart Road, Darjeeling' });

    expect((await ask()).status).toBe(400);
    await db.update(schema.listings).set({ extras: { ...(listing.extras || {}), home_delivery: true } }).where(eq(schema.listings.id, listing.id));
    const made = await ask();
    expect(made.status).toBe(201);
    const id = made.body.request.id;

    const hostList = await request(app).get('/api/deliveries/host').set(auth(cafe.token));
    expect(hostList.body.items[0]).toMatchObject({ id, status: 'open', customer: { name: 'Hungry Hari' } });
    expect((await request(app).patch(`/api/deliveries/${id}`).set(auth(t.token)).send({ status: 'accepted' })).status).toBe(404);
    expect((await request(app).patch(`/api/deliveries/${id}`).set(auth(cafe.token)).send({ status: 'delivered' })).status).toBe(409);
    expect((await request(app).patch(`/api/deliveries/${id}`).set(auth(cafe.token)).send({ status: 'accepted', host_note: '30 minutes' })).status).toBe(200);
    expect((await request(app).patch(`/api/deliveries/${id}`).set(auth(cafe.token)).send({ status: 'delivered' })).status).toBe(200);
    const mine = await request(app).get('/api/deliveries/mine').set(auth(t.token));
    expect(mine.body.items[0]).toMatchObject({ status: 'delivered', host_note: '30 minutes', listing_title: listing.title });
    const notes = await request(app).get('/api/notifications').set(auth(t.token));
    expect(JSON.stringify(notes.body)).toContain('delivered');
  });
});
