import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { inDays, onboardActiveProvider, registerUser } from './helpers';

// The Feed: anyone can read, react, comment and share. Posting needs a verified person: a
// traveller with the aangan pass (Verified traveller), or a business with the Verified tick.
// A traveller posts only trip plans; a verified business posts trip plans and its own posts.

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const business = (token: string) => ({ ...auth(token), 'X-Aangan-Mode': 'business' });
const plan = (over: Record<string, unknown> = {}) => ({
  title: 'Three nights in Lava and Rishyap', stops: ['Lava', 'Rishyap'], start_date: inDays(15), nights: 3, seats: 3, ...over,
});

describe('feed: who may post', () => {
  it('lets a traveller without the pass plan a trip for themselves, but not post it in the Feed', async () => {
    const { token } = await registerUser({ name: 'No Pass Traveller', paySupport: false });
    expect((await request(app).get('/api/plans/rights').set(auth(token))).body)
      .toEqual({ can_post: false, pass_active: false, verified_business: false });

    const pub = await request(app).post('/api/plans').set(auth(token)).send(plan());
    expect(pub.status).toBe(403);
    expect(pub.body.code).toBe('not_verified');

    const priv = await request(app).post('/api/plans').set(auth(token)).send(plan({ visibility: 'private' }));
    expect(priv.status).toBe(201);
    const id = priv.body.plan.id;
    const toFeed = await request(app).patch(`/api/plans/${id}`).set(auth(token)).send({ visibility: 'public' });
    expect(toFeed.status).toBe(403);
    expect(toFeed.body.code).toBe('not_verified');
    // Other edits to their own plan are fine.
    expect((await request(app).patch(`/api/plans/${id}`).set(auth(token)).send({ seats: 4 })).status).toBe(200);
  });

  it('lets a traveller with the pass post a trip plan, and nothing else', async () => {
    const { token } = await registerUser({ name: 'Pass Traveller' });
    expect((await request(app).get('/api/plans/rights').set(auth(token))).body).toMatchObject({ can_post: true, pass_active: true });
    expect((await request(app).post('/api/plans').set(auth(token)).send(plan())).status).toBe(201);
    const p = await request(app).post('/api/posts').set(auth(token)).send({ body: 'Lovely morning in Lava today' });
    expect(p.status).toBe(403);
    expect(p.body.code).toBe('not_a_host');
  });

  it('lets anyone signed in react to and comment on a post, verified or not', async () => {
    const { token: host } = await onboardActiveProvider({ name: 'Verified Poster', verified: true });
    const made = await request(app).post('/api/posts').set(auth(host)).send({ body: 'Fresh momos at the stall from 4 pm' });
    expect(made.status).toBe(201);
    const { token: reader } = await registerUser({ name: 'Unverified Reader', paySupport: false });
    expect((await request(app).post(`/api/posts/${made.body.post.id}/like`).set(auth(reader)).send({ kind: 'yum' })).status).toBe(200);
    expect((await request(app).post(`/api/posts/${made.body.post.id}/comments`).set(auth(reader)).send({ body: 'See you there this evening' })).status).toBe(201);
  });

  it('lets a verified business post trip plans from the business side; an unverified one only keeps them', async () => {
    const { token: verified } = await onboardActiveProvider({ name: 'Trip Host', verified: true });
    expect((await request(app).get('/api/plans/rights').set(auth(verified))).body).toMatchObject({ can_post: true, verified_business: true });
    expect((await request(app).post('/api/plans').set(business(verified)).send(plan())).status).toBe(201);

    const { token: unverified } = await onboardActiveProvider({ name: 'New Host' });
    const r = await request(app).post('/api/plans').set(business(unverified)).send(plan());
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('not_verified');
    expect((await request(app).post('/api/plans').set(business(unverified)).send(plan({ visibility: 'private' }))).status).toBe(201);
    const p = await request(app).post('/api/posts').set(auth(unverified)).send({ body: 'Rooms open for the winter' });
    expect(p.status).toBe(403);
    expect(p.body.code).toBe('not_verified');
  });
});
