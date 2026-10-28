import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, createListing, loginAdmin } from './helpers';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function review(token: string, listingId: string, comment: string) {
  const res = await request(app).post('/api/reviews').set(auth(token)).send({ listing_id: listingId, rating: 4, comment });
  expect(res.status).toBe(200);
  return res.body.review as { id: string; user_id: string };
}

describe('reports', () => {
  it('needs a signed-in reporter', async () => {
    const listing = await createListing();
    const res = await request(app).post('/api/reports').send({ target_type: 'listing', target_id: listing.id, reason: 'fake' });
    expect(res.status).toBe(401);
  });

  it('refuses an unknown reason or target type', async () => {
    const { token } = await registerUser({ name: 'Picky Reporter' });
    const listing = await createListing();
    const badReason = await request(app).post('/api/reports').set(auth(token))
      .send({ target_type: 'listing', target_id: listing.id, reason: 'boring' });
    expect(badReason.status).toBe(400);
    const badType = await request(app).post('/api/reports').set(auth(token))
      .send({ target_type: 'user', target_id: listing.id, reason: 'spam' });
    expect(badType.status).toBe(400);
  });

  it('404s a report of something that does not exist', async () => {
    const { token } = await registerUser({ name: 'Ghost Reporter' });
    const res = await request(app).post('/api/reports').set(auth(token))
      .send({ target_type: 'review', target_id: 'nope', reason: 'spam' });
    expect(res.status).toBe(404);
  });

  it('records a report once, and an admin can see and resolve it', async () => {
    const { token } = await registerUser({ name: 'Careful Guest' });
    const listing = await createListing({ title: 'Too Good To Be True' });

    const first = await request(app).post('/api/reports').set(auth(token))
      .send({ target_type: 'listing', target_id: listing.id, reason: 'fake', details: 'Photos are from another hotel' });
    expect(first.status).toBe(201);
    const again = await request(app).post('/api/reports').set(auth(token))
      .send({ target_type: 'listing', target_id: listing.id, reason: 'fake' });
    expect(again.status).toBe(200);

    const admin = await loginAdmin();
    const open = await request(app).get('/api/admin/reports').set(auth(admin));
    expect(open.status).toBe(200);
    const mine = open.body.reports.filter((r: { target_id: string }) => r.target_id === listing.id);
    expect(mine).toHaveLength(1);
    expect(mine[0].details).toBe('Photos are from another hotel');

    const resolve = await request(app).post(`/api/admin/reports/${mine[0].id}/resolve`).set(auth(admin));
    expect(resolve.status).toBe(200);
    const stillOpen = await request(app).get('/api/admin/reports').set(auth(admin));
    expect(stillOpen.body.reports.some((r: { id: string }) => r.id === mine[0].id)).toBe(false);
  });

  it('keeps the report list from non-admins', async () => {
    const { token } = await registerUser({ name: 'Nosy Guest' });
    const res = await request(app).get('/api/admin/reports').set(auth(token));
    expect(res.status).toBe(403);
  });
});

describe('blocks', () => {
  it('hides a blocked person’s reviews from the blocker only, and unblocking brings them back', async () => {
    const listing = await createListing({ title: 'Blocked Review Listing' });
    const { token: troll } = await registerUser({ name: 'Troll' });
    const { token: kind } = await registerUser({ name: 'Kind Guest' });
    const { token: reader } = await registerUser({ name: 'Reader' });
    const bad = await review(troll, listing.id, 'Rude words');
    await review(kind, listing.id, 'Lovely place');

    const block = await request(app).post('/api/users/me/blocks').set(auth(reader)).send({ user_id: bad.user_id });
    expect(block.status).toBe(201);
    const ids = await request(app).get('/api/users/me/blocks').set(auth(reader));
    expect(ids.body.user_ids).toEqual([bad.user_id]);

    const seen = await request(app).get(`/api/reviews/listing/${listing.id}`).set(auth(reader));
    expect(seen.body.reviews.map((r: { comment: string }) => r.comment)).toEqual(['Lovely place']);
    expect(seen.body.summary.count).toBe(1);

    // Someone else, and an anonymous reader, still see both.
    const anon = await request(app).get(`/api/reviews/listing/${listing.id}`);
    expect(anon.body.summary.count).toBe(2);

    const unblock = await request(app).delete(`/api/users/me/blocks/${bad.user_id}`).set(auth(reader));
    expect(unblock.status).toBe(200);
    const back = await request(app).get(`/api/reviews/listing/${listing.id}`).set(auth(reader));
    expect(back.body.summary.count).toBe(2);
  });

  it('will not block yourself or someone who does not exist', async () => {
    const { token, user } = await registerUser({ name: 'Self Blocker' });
    const self = await request(app).post('/api/users/me/blocks').set(auth(token)).send({ user_id: user.id });
    expect(self.status).toBe(400);
    const ghost = await request(app).post('/api/users/me/blocks').set(auth(token)).send({ user_id: 'nobody' });
    expect(ghost.status).toBe(404);
  });
});

describe('app version', () => {
  it('answers without sign-in, with a version floor and a store link', async () => {
    const res = await request(app).get('/api/app/version');
    expect(res.status).toBe(200);
    expect(res.body.min_version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(res.body.latest_version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(res.body.android_url).toContain('io.aangan.app');
  });
});
