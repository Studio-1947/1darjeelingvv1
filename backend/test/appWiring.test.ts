import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, createListing } from './helpers';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('user interests', () => {
  it('saves, dedupes and returns interests on the user', async () => {
    const { token } = await registerUser({ name: 'Vibe Picker' });
    const patch = await request(app).patch('/api/users/me').set(auth(token))
      .send({ interests: ['nature', 'food', 'nature'] });
    expect(patch.status).toBe(200);
    expect(patch.body.user.interests).toEqual(['nature', 'food']);

    const me = await request(app).get('/api/auth/me').set(auth(token));
    expect(me.body.user.interests).toEqual(['nature', 'food']);
  });

  it('defaults to an empty list', async () => {
    const { user } = await registerUser({ name: 'No Vibe' });
    expect(user.interests).toEqual([]);
  });

  it('rejects anything that is not a short list of ids', async () => {
    const { token } = await registerUser({ name: 'Bad Vibe' });
    for (const bad of ['nature', [1, 2], ['has space'], Array(21).fill('a')]) {
      const res = await request(app).patch('/api/users/me').set(auth(token)).send({ interests: bad });
      expect(res.status).toBe(400);
    }
  });
});

describe('notifications feed', () => {
  it('requires auth', async () => {
    expect((await request(app).get('/api/notifications')).status).toBe(401);
  });

  it('is empty for a new user', async () => {
    const { token } = await registerUser({ name: 'Quiet One' });
    const res = await request(app).get('/api/notifications').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ items: [], unread_count: 0 });
  });

  it('tells the guest when a host accepts, and marks read', async () => {
    const host = await registerUser({ name: 'Host H', role: 'provider' });
    const guest = await registerUser({ name: 'Guest G' });
    const listing = await createListing({ title: 'Feed Homestay' });

    const booking = await request(app).post('/api/bookings').set(auth(guest.token)).send({
      listing_id: listing.id,
      listing_type: 'homestay',
      check_in: '2031-03-10',
      check_out: '2031-03-12',
    });
    expect(booking.status).toBe(200);

    // Admin-authored test listings have no owner the host token owns, so accept as admin.
    const { loginAdmin } = await import('./helpers');
    const admin = await loginAdmin();
    const accept = await request(app).patch(`/api/bookings/${booking.body.booking.id}/confirm`)
      .set(auth(admin));
    expect(accept.status).toBe(200);

    const feed = await request(app).get('/api/notifications').set(auth(guest.token));
    expect(feed.body.unread_count).toBe(1);
    expect(feed.body.items[0]).toMatchObject({
      kind: 'booking_accepted',
      ref_id: booking.body.booking.id,
      unread: true,
    });

    // Someone else cannot touch it.
    const other = await request(app).patch(`/api/notifications/${feed.body.items[0].id}/read`).set(auth(host.token));
    expect(other.status).toBe(404);

    const read = await request(app).patch(`/api/notifications/${feed.body.items[0].id}/read`).set(auth(guest.token));
    expect(read.status).toBe(200);
    const after = await request(app).get('/api/notifications').set(auth(guest.token));
    expect(after.body.unread_count).toBe(0);
    expect(after.body.items[0].unread).toBe(false);
  });

  it('marks everything read in one call', async () => {
    const guest = await registerUser({ name: 'Many Alerts' });
    const listing = await createListing({ title: 'Many Alerts Stay' });
    const { loginAdmin } = await import('./helpers');
    const admin = await loginAdmin();
    for (const day of ['10', '15']) {
      const b = await request(app).post('/api/bookings').set(auth(guest.token)).send({
        listing_id: listing.id,
        listing_type: 'homestay',
        check_in: `2031-04-${day}`,
        check_out: `2031-04-${Number(day) + 1}`,
      });
      await request(app).patch(`/api/bookings/${b.body.booking.id}/confirm`).set(auth(admin));
    }
    const all = await request(app).post('/api/notifications/read-all').set(auth(guest.token));
    expect(all.body.updated).toBe(2);
    const feed = await request(app).get('/api/notifications').set(auth(guest.token));
    expect(feed.body.unread_count).toBe(0);
  });
});

describe('push tokens', () => {
  const token = 'ExponentPushToken[abcdefghijklmnop]';

  it('registers, moves to a new account, and can be removed', async () => {
    const a = await registerUser({ name: 'Phone Owner' });
    const b = await registerUser({ name: 'Phone Borrower' });

    const reg = await request(app).post('/api/users/me/push-token').set(auth(a.token)).send({ token, platform: 'android' });
    expect(reg.status).toBe(200);
    // Same device, different account: it moves rather than duplicating.
    const again = await request(app).post('/api/users/me/push-token').set(auth(b.token)).send({ token, platform: 'android' });
    expect(again.status).toBe(200);

    // The previous owner can no longer remove it, the new one can.
    await request(app).delete('/api/users/me/push-token').set(auth(a.token)).send({ token });
    const del = await request(app).delete('/api/users/me/push-token').set(auth(b.token)).send({ token });
    expect(del.status).toBe(200);
  });

  it('validates input', async () => {
    const { token: t } = await registerUser({ name: 'Bad Token' });
    expect((await request(app).post('/api/users/me/push-token').set(auth(t)).send({ token: 'x', platform: 'ios' })).status).toBe(400);
    expect((await request(app).post('/api/users/me/push-token').set(auth(t)).send({ token, platform: 'palm' })).status).toBe(400);
  });
});

describe('PATCH /providers/me', () => {
  const onboard = async (name: string) => {
    const u = await registerUser({ name, role: 'provider' });
    const res = await request(app).post('/api/providers/onboard').set(auth(u.token)).send({
      business_name: `${name} Stay`,
      business_type: 'homestay',
      description: 'A quiet place',
      location: 'Darjeeling',
      contact_phone: '+919876543210',
    });
    expect(res.status).toBe(200);
    return u;
  };

  it('edits details and stores the UPI id in extras', async () => {
    const u = await onboard('Editable');
    const res = await request(app).patch('/api/providers/me').set(auth(u.token)).send({
      business_name: 'Renamed Stay',
      price_from: 1800,
      upi: 'norbu@okaxis',
    });
    expect(res.status).toBe(200);
    expect(res.body.provider.business_name).toBe('Renamed Stay');
    expect(res.body.provider.price_from).toBe(1800);
    expect(res.body.provider.extras.upi).toBe('norbu@okaxis');

    const cleared = await request(app).patch('/api/providers/me').set(auth(u.token)).send({ upi: '' });
    expect(cleared.body.provider.extras.upi).toBeUndefined();
  });

  it('refuses bad values and does not let type or status change', async () => {
    const u = await onboard('Strict');
    const bad = [
      { business_name: '  ' },
      { contact_phone: 'not-a-phone' },
      { price_from: -5 },
      { upi: 'nope' },
      {},
    ];
    for (const body of bad) {
      expect((await request(app).patch('/api/providers/me').set(auth(u.token)).send(body)).status).toBe(400);
    }
    const res = await request(app).patch('/api/providers/me').set(auth(u.token))
      .send({ business_type: 'driver', status: 'active', location: 'Kalimpong' });
    expect(res.body.provider.business_type).toBe('homestay');
    expect(res.body.provider.status).toBe('pending_payment');
    expect(res.body.provider.location).toBe('Kalimpong');
  });

  it('404s for someone who never onboarded', async () => {
    const { token } = await registerUser({ name: 'Never Hosted' });
    expect((await request(app).patch('/api/providers/me').set(auth(token)).send({ location: 'x' })).status).toBe(404);
  });
});

describe('GET /listings/:id/availability', () => {
  it('shows taken and held nights for a homestay, and nothing else', async () => {
    const { loginAdmin } = await import('./helpers');
    const admin = await loginAdmin();
    const made = await request(app).post('/api/listings').set(auth(admin)).send({
      title: 'Calendar Homestay', type: 'homestay', description: 'd', location: 'Darjeeling',
      provider_id: 'admin-seed-provider',
    });
    expect(made.status).toBe(200);
    const id = made.body.item.id as string;

    const guest = await registerUser({ name: 'Calendar Guest' });
    const book = (ci: string, co: string) => request(app).post('/api/bookings').set(auth(guest.token))
      .send({ listing_id: id, listing_type: 'homestay', check_in: ci, check_out: co });

    const held = await book('2031-06-10', '2031-06-12');
    expect(held.status).toBe(200);
    const accepted = await book('2031-06-20', '2031-06-22');
    await request(app).patch(`/api/bookings/${accepted.body.booking.id}/confirm`).set(auth(admin));

    const res = await request(app).get(`/api/listings/${id}/availability?from=2031-06-01&to=2031-06-30`);
    expect(res.status).toBe(200);
    expect(res.body.ranges).toEqual([
      { check_in: '2031-06-10', check_out: '2031-06-12', state: 'hold' },
      { check_in: '2031-06-20', check_out: '2031-06-22', state: 'booked' },
    ]);
    // Dates and state only: nothing that identifies the guest or the booking.
    expect(JSON.stringify(res.body)).not.toContain(held.body.booking.id);

    // A window that does not touch them is empty, and back-to-back turnover is not a clash.
    const clear = await request(app).get(`/api/listings/${id}/availability?from=2031-06-12&to=2031-06-20`);
    expect(clear.body.ranges).toEqual([]);
  });

  it('is empty for a non-homestay, 404s unknown ids, and rejects bad windows', async () => {
    const spot = await createListing({ title: 'Always Open' });
    expect((await request(app).get(`/api/listings/${spot.id}/availability`)).body.ranges).toEqual([]);
    expect((await request(app).get('/api/listings/nope/availability')).status).toBe(404);
    for (const q of ['from=nope', 'from=2031-06-10&to=2031-06-01', 'from=2031-01-01&to=2033-01-01']) {
      expect((await request(app).get(`/api/listings/${spot.id}/availability?${q}`)).status).toBe(400);
    }
  });
});

describe('promotions', () => {
  it('serves the seeded cards publicly, in order', async () => {
    const res = await request(app).get('/api/promotions');
    expect(res.status).toBe(200);
    expect(res.body.items.map((p: any) => p.title)).toEqual([
      'Monsoon escapes', 'Sunrise at Tiger Hill', 'Tea garden tours',
    ]);
  });

  it('is admin-only to change, validates, and hides inactive cards', async () => {
    const { loginAdmin } = await import('./helpers');
    const admin = await loginAdmin();
    const user = await registerUser({ name: 'Not Admin' });
    const card = { tag: 'NEW', title: 'Festival', subtitle: 'Dates inside', image: 'https://example.com/a.jpg', link: '/category/event' };

    expect((await request(app).post('/api/promotions').send(card)).status).toBe(401);
    expect((await request(app).post('/api/promotions').set(auth(user.token)).send(card)).status).toBe(403);

    for (const bad of [
      { ...card, link: 'https://evil.example' },
      { ...card, link: '//evil.example' },
      { ...card, image: 'http://insecure.example/a.jpg' },
      { ...card, title: '' },
    ]) {
      expect((await request(app).post('/api/promotions').set(auth(admin)).send(bad)).status).toBe(400);
    }

    const made = await request(app).post('/api/promotions').set(auth(admin)).send({ ...card, sort_order: -1 });
    expect(made.status).toBe(200);
    const id = made.body.item.id as string;
    expect((await request(app).get('/api/promotions')).body.items[0].title).toBe('Festival');

    await request(app).patch(`/api/promotions/${id}`).set(auth(admin)).send({ active: false });
    expect((await request(app).get('/api/promotions')).body.items.some((p: any) => p.id === id)).toBe(false);

    expect((await request(app).delete(`/api/promotions/${id}`).set(auth(admin))).status).toBe(200);
    expect((await request(app).delete(`/api/promotions/${id}`).set(auth(admin))).status).toBe(404);
  });
});

describe('GET /providers/me/stats', () => {
  it('is all zero for someone with no listings', async () => {
    const { token } = await registerUser({ name: 'No Listings' });
    const res = await request(app).get('/api/providers/me/stats').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ listings: 0, review_count: 0, average_rating: 0 });
    expect((await request(app).get('/api/providers/me/stats')).status).toBe(401);
  });

  it('counts the host\'s own listings, reviews and bookings only', async () => {
    const { onboardActiveProvider } = await import('./helpers');
    const host = await onboardActiveProvider({ name: 'Stats Host' });
    // The helper may already give the host a listing, so measure what this test adds.
    const before = (await request(app).get('/api/providers/me/stats').set(auth(host.token))).body.listings as number;
    const mine = await request(app).post('/api/listings').set(auth(host.token)).send({
      title: 'My Stay', type: 'homestay', description: 'd', location: 'Darjeeling',
    });
    expect(mine.status).toBe(200);
    const other = await createListing({ title: 'Someone Elses' });

    const guest = await registerUser({ name: 'Reviewer' });
    for (const [id, rating] of [[mine.body.item.id, 5], [mine.body.item.id, 4]] as const) {
      // One review per guest per listing, so use two guests.
      const g = rating === 5 ? guest : await registerUser({ name: 'Reviewer Two' });
      await request(app).post('/api/reviews').set(auth(g.token)).send({ listing_id: id, rating });
    }
    await request(app).post('/api/reviews').set(auth(guest.token)).send({ listing_id: other.id, rating: 1 });
    await request(app).post('/api/bookings').set(auth(guest.token)).send({
      listing_id: mine.body.item.id, listing_type: 'homestay', check_in: '2031-08-01', check_out: '2031-08-03',
    });

    const res = await request(app).get('/api/providers/me/stats').set(auth(host.token));
    expect(res.body.listings).toBe(before + 1);
    expect(res.body.review_count).toBe(2);
    expect(res.body.average_rating).toBe(4.5);
    expect(res.body.bookings).toMatchObject({ total: 1, pending: 1, confirmed: 0 });
  });
});
