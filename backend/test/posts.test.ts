import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { registerUser, onboardActiveProvider, createListing, loginAdmin } from './helpers';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function post(token: string, body: Record<string, unknown>) {
  return request(app).post('/api/posts').set(auth(token)).send(body);
}

describe('host feed', () => {
  it('lets a live host post, and shows it to everyone with the host and listing', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Norbu' });
    const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.providerId, providerId)).limit(1);

    const res = await post(token, {
      body: 'Rhododendrons are out on the ridge behind us this week.',
      photos: ['https://cdn.example/1.jpg'],
      listing_id: listing?.id,
    });
    expect(res.status).toBe(201);
    expect(res.body.post.host.name).toBe("Norbu's Business");

    const feed = await request(app).get('/api/posts');
    expect(feed.status).toBe(200);
    expect(feed.body.posts).toHaveLength(1);
    expect(feed.body.posts[0].body).toContain('Rhododendrons');
    expect(feed.body.posts[0].photos).toEqual(['https://cdn.example/1.jpg']);
    if (listing) expect(feed.body.posts[0].listing.id).toBe(listing.id);
    expect(feed.body.posts[0]).not.toHaveProperty('hidden');
  });

  it('refuses travellers, hosts awaiting approval, and hosts whose plan lapsed', async () => {
    const { token: traveller } = await registerUser({ name: 'Just Visiting' });
    expect((await post(traveller, { body: 'hello' })).status).toBe(403);

    const { token: pending } = await onboardActiveProvider({ name: 'Pending Host', awaitingApproval: true });
    const p = await post(pending, { body: 'hello' });
    expect(p.status).toBe(403);
    expect(p.body.code).toBe('not_verified');

    const { token: lapsed, providerId } = await onboardActiveProvider({ name: 'Lapsed Host' });
    await db.update(schema.providers).set({ planExpiresAt: new Date(Date.now() - 1000).toISOString() }).where(eq(schema.providers.id, providerId));
    const l = await post(lapsed, { body: 'hello' });
    expect(l.status).toBe(403);
    expect(l.body.code).toBe('plan_not_live');
  });

  it('drops a host’s posts from the feed while their plan has lapsed', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Fading Host' });
    expect((await post(token, { body: 'Fresh momos today' })).status).toBe(201);
    await db.update(schema.providers).set({ planExpiresAt: new Date(Date.now() - 1000).toISOString() }).where(eq(schema.providers.id, providerId));
    expect((await request(app).get('/api/posts')).body.posts).toHaveLength(0);
  });

  it('validates the text, the photos and the linked listing', async () => {
    const { token } = await onboardActiveProvider({ name: 'Careful Host' });
    expect((await post(token, { body: '   ' })).status).toBe(400);
    expect((await post(token, { body: 'x'.repeat(1001) })).status).toBe(400);
    expect((await post(token, { body: 'ok', photos: ['a', 'b', 'c', 'd', 'e'] })).status).toBe(400);
    expect((await post(token, { body: 'ok', photos: ['ftp://x'] })).status).toBe(400);
    const someoneElses = await createListing({ title: 'Not Yours' });
    expect((await post(token, { body: 'ok', listing_id: someoneElses.id })).status).toBe(400);
  });

  it('pages newest first', async () => {
    const { token } = await onboardActiveProvider({ name: 'Chatty Host' });
    for (const n of [1, 2, 3]) {
      expect((await post(token, { body: `Post ${n}` })).status).toBe(201);
      await new Promise((r) => setTimeout(r, 5));
    }
    const first = await request(app).get('/api/posts?limit=2');
    expect(first.body.posts.map((p: { body: string }) => p.body)).toEqual(['Post 3', 'Post 2']);
    expect(first.body.next_before).toBeTruthy();
    const second = await request(app).get(`/api/posts?limit=2&before=${encodeURIComponent(first.body.next_before)}`);
    expect(second.body.posts.map((p: { body: string }) => p.body)).toEqual(['Post 1']);
    expect(second.body.next_before).toBeNull();
  });

  it('lets only the author edit or delete, and an admin hide', async () => {
    const { token } = await onboardActiveProvider({ name: 'Owner Host' });
    const { token: other } = await onboardActiveProvider({ name: 'Other Host' });
    const id = (await post(token, { body: 'Original' })).body.post.id;

    expect((await request(app).patch(`/api/posts/${id}`).set(auth(other)).send({ body: 'Hijacked' })).status).toBe(404);
    const edited = await request(app).patch(`/api/posts/${id}`).set(auth(token)).send({ body: 'Edited' });
    expect(edited.status).toBe(200);
    expect(edited.body.post.body).toBe('Edited');

    const admin = await loginAdmin();
    expect((await request(app).post(`/api/posts/${id}/hide`).set(auth(admin)).send({ reason: 'Reported' })).status).toBe(200);
    expect((await request(app).get('/api/posts')).body.posts).toHaveLength(0);
    // The host still sees it, marked hidden.
    const mine = await request(app).get('/api/posts/me').set(auth(token));
    expect(mine.body.can_post).toBe(true);
    expect(mine.body.posts[0].hidden).toBe(true);
    expect((await request(app).post(`/api/posts/${id}/unhide`).set(auth(admin))).status).toBe(200);
    expect((await request(app).get('/api/posts')).body.posts).toHaveLength(1);

    expect((await request(app).delete(`/api/posts/${id}`).set(auth(other))).status).toBe(404);
    expect((await request(app).delete(`/api/posts/${id}`).set(auth(token))).status).toBe(200);
    expect((await request(app).get(`/api/posts/${id}`)).status).toBe(404);
  });

  it('can be reported, and a blocked host’s posts are hidden from the blocker', async () => {
    const { token: host } = await onboardActiveProvider({ name: 'Spammy Host' });
    const created = (await post(host, { body: 'Buy now!!!' })).body.post;
    const { token: reader } = await registerUser({ name: 'Reader' });

    const report = await request(app).post('/api/reports').set(auth(reader)).send({ target_type: 'post', target_id: created.id, reason: 'spam' });
    expect(report.status).toBe(201);

    await request(app).post('/api/users/me/blocks').set(auth(reader)).send({ user_id: created.author_user_id });
    expect((await request(app).get('/api/posts').set(auth(reader))).body.posts).toHaveLength(0);
    expect((await request(app).get('/api/posts')).body.posts).toHaveLength(1);
  });

  it('tells a traveller they are not a host', async () => {
    const { token } = await registerUser({ name: 'Curious' });
    const res = await request(app).get('/api/posts/me').set(auth(token));
    expect(res.body).toMatchObject({ can_post: false, reason: 'not_a_host' });
  });
});
