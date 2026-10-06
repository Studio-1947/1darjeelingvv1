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
