import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { onboardActiveProvider } from './helpers';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('host post kinds (prototype feed.js: update, offer, event, photo)', () => {
  it('defaults to update, keeps the kind a host picks, and returns it on every read', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Kind Host', verified: true });

    const plain = await request(app).post('/api/posts').set(auth(token)).send({ body: 'Fresh snow on the peaks this morning.' });
    expect(plain.status).toBe(201);
    expect(plain.body.post.kind).toBe('update');

    const offer = await request(app).post('/api/posts').set(auth(token))
      .send({ body: 'Twenty percent off the garden room this week.', kind: 'offer' });
    expect(offer.status).toBe(201);
    expect(offer.body.post.kind).toBe('offer');

    const feed = await request(app).get('/api/posts');
    expect(feed.body.posts.map((p: any) => p.kind).sort()).toEqual(['offer', 'update']);
    expect((await request(app).get(`/api/posts?provider_id=${providerId}`)).body.posts).toHaveLength(2);
    expect((await request(app).get(`/api/posts/${offer.body.post.id}`)).body.post.kind).toBe('offer');
    const mine = await request(app).get('/api/posts/me').set(auth(token));
    expect(mine.body.posts.find((p: any) => p.id === offer.body.post.id).kind).toBe('offer');

    const edited = await request(app).patch(`/api/posts/${plain.body.post.id}`).set(auth(token)).send({ kind: 'event' });
    expect(edited.status).toBe(200);
    expect(edited.body.post.kind).toBe('event');
    expect(edited.body.post.body).toBe('Fresh snow on the peaks this morning.');
    // Editing the text alone keeps the kind.
    const text = await request(app).patch(`/api/posts/${plain.body.post.id}`).set(auth(token)).send({ body: 'Music night on Saturday.' });
    expect(text.body.post.kind).toBe('event');
  });

  it('refuses a kind that is not one of the four', async () => {
    const { token } = await onboardActiveProvider({ name: 'Odd Kind Host', verified: true });
    const bad = await request(app).post('/api/posts').set(auth(token)).send({ body: 'Something new at the cafe.', kind: 'advert' });
    expect(bad.status).toBe(400);
    expect(bad.body.detail).toMatch(/kind/);

    const ok = await request(app).post('/api/posts').set(auth(token)).send({ body: 'A view worth sharing.', kind: 'photo' });
    expect(ok.status).toBe(201);
    const patch = await request(app).patch(`/api/posts/${ok.body.post.id}`).set(auth(token)).send({ kind: 42 });
    expect(patch.status).toBe(400);
  });
});
