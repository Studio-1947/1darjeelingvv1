import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { registerUser, onboardActiveProvider, loginAdmin } from './helpers';
import { MAX_SUGGESTIONS_PER_DAY } from '../src/routes/placeSuggestions';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

const good = {
  name: 'Lamahatta Eco Park',
  place: 'Darjeeling',
  area: 'Lamahatta',
  details: 'A quiet pine forest with prayer flags and a small lake. Go early, carry a jacket.',
  entry_price: 50,
  photos: ['https://cdn.test/lama-1.jpg', 'https://cdn.test/lama-2.jpg'],
};

const suggest = (token: string, body: Record<string, unknown>) =>
  request(app).post('/api/spots/suggestions').set(auth(token)).send(body);

describe('suggest a place', () => {
  it('lets anyone signed in suggest a place, and shows it in their own list as pending', async () => {
    expect((await request(app).post('/api/spots/suggestions').send(good)).status).toBe(401);

    const { token } = await registerUser({ name: 'Wandering Wangmo' });
    const res = await suggest(token, good);
    expect(res.status).toBe(201);
    expect(res.body.suggestion).toMatchObject({
      name: 'Lamahatta Eco Park',
      place: 'Lamahatta, Darjeeling',
      entry_price: 50,
      photos: good.photos,
      status: 'pending',
      listing_id: null,
    });

    // A host can suggest too, from either mode.
    const host = await onboardActiveProvider({ name: 'Suggesting Host' });
    const h = await request(app).post('/api/spots/suggestions').set(auth(host.token)).set('X-Aangan-Mode', 'business')
      .send({ ...good, name: 'Sittong Orange Orchards', entry_price: '' });
    expect(h.status).toBe(201);
    expect(h.body.suggestion.entry_price).toBeNull();

    const mine = await request(app).get('/api/spots/suggestions/mine').set(auth(token));
    expect(mine.status).toBe(200);
    expect(mine.body.suggestions).toHaveLength(1);
    expect(mine.body.suggestions[0].name).toBe('Lamahatta Eco Park');
    expect((await request(app).get('/api/spots/suggestions/mine')).status).toBe(401);
  });

  it('checks every field', async () => {
    const { token } = await registerUser({ name: 'Careful Chime' });
    const bad = async (patch: Record<string, unknown>) => (await suggest(token, { ...good, ...patch })).status;
    expect(await bad({ name: '' })).toBe(400);
    expect(await bad({ name: 'x' })).toBe(400);
    expect(await bad({ place: undefined })).toBe(400);
    expect(await bad({ details: 'Too short' })).toBe(400);
    expect(await bad({ details: 'x'.repeat(2001) })).toBe(400);
    expect(await bad({ entry_price: -5 })).toBe(400);
    expect(await bad({ entry_price: 12.5 })).toBe(400);
    expect(await bad({ photos: 'https://cdn.test/a.jpg' })).toBe(400);
    expect(await bad({ photos: ['a', 'b'] })).toBe(400);
    expect(await bad({ photos: ['javascript:alert(1)'] })).toBe(400);
    expect(await bad({ photos: Array.from({ length: 5 }, (_, i) => `https://cdn.test/${i}.jpg`) })).toBe(400);
    expect(await bad({ area: 'a'.repeat(81) })).toBe(400);
    expect((await request(app).get('/api/spots/suggestions/mine').set(auth(token))).body.suggestions).toHaveLength(0);
  });

  it(`caps one person at ${MAX_SUGGESTIONS_PER_DAY} suggestions a day`, async () => {
    const { token } = await registerUser({ name: 'Busy Bishal' });
    for (let i = 0; i < MAX_SUGGESTIONS_PER_DAY; i++) {
      expect((await suggest(token, { ...good, name: `Hidden Waterfall Number ${i}` })).status).toBe(201);
    }
    const over = await suggest(token, { ...good, name: 'One More Viewpoint' });
    expect(over.status).toBe(429);
  });
});

describe('reviewing place suggestions (admin)', () => {
  it('lists pending suggestions for admins only', async () => {
    const { token } = await registerUser({ name: 'Nosy Norgay' });
    await suggest(token, good);
    expect((await request(app).get('/api/admin/spots/suggestions').set(auth(token))).status).toBe(403);

    const admin = await loginAdmin();
    const list = await request(app).get('/api/admin/spots/suggestions').set(auth(admin));
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0].user.name).toBe('Nosy Norgay');
    expect(list.body.counts).toEqual({ pending: 1, approved: 0, rejected: 0 });
    expect((await request(app).get('/api/admin/spots/suggestions?status=nope').set(auth(admin))).status).toBe(400);
  });

  it('approving creates an unpublished spot and tells the sender', async () => {
    const { token, user } = await registerUser({ name: 'Pema Approves' });
    const s = (await suggest(token, good)).body.suggestion;
    const admin = await loginAdmin();

    expect((await request(app).post(`/api/admin/spots/suggestions/${s.id}/approve`).set(auth(token))).status).toBe(403);

    const res = await request(app).post(`/api/admin/spots/suggestions/${s.id}/approve`).set(auth(admin))
      .send({ note: 'Lovely find' });
    expect(res.status).toBe(200);
    expect(res.body.suggestion.status).toBe('approved');
    expect(res.body.suggestion.review_note).toBe('Lovely find');
    expect(res.body.spot).toMatchObject({
      title: 'Lamahatta Eco Park',
      type: 'spot',
      location: 'Lamahatta, Darjeeling',
      price: 50,
      image: good.photos[0],
      published: false,
    });
    expect(res.body.spot.extras.images).toEqual(good.photos);
    expect(res.body.suggestion.listing_id).toBe(res.body.spot.id);

    // Unpublished: travellers do not see it until the team publishes it.
    const pub = await request(app).get('/api/listings?type=spot').set('User-Agent', 'Mozilla/5.0 Chrome/140');
    expect(pub.status).toBe(200);
    expect(pub.body.items.some((l: any) => l.id === res.body.spot.id)).toBe(false);

    const [note] = await db.select().from(schema.notifications)
      .where(and(eq(schema.notifications.userId, user.id), eq(schema.notifications.kind, 'place_suggestion_approved')));
    expect(note).toBeTruthy();
    expect(note.msg).toEqual({ key: 'place_suggestion_approved', params: { place: 'Lamahatta Eco Park' } });
    expect(note.refId).toBe(s.id);

    const mine = await request(app).get('/api/spots/suggestions/mine').set(auth(token));
    expect(mine.body.suggestions[0].status).toBe('approved');

    // A decision is final.
    expect((await request(app).post(`/api/admin/spots/suggestions/${s.id}/reject`).set(auth(admin))).status).toBe(409);
    expect((await request(app).post(`/api/admin/spots/suggestions/${s.id}/approve`).set(auth(admin))).status).toBe(409);
  });

  it('lets the admin correct the title, and refuses a spot that already exists', async () => {
    const { token } = await registerUser({ name: 'Dup Dorjee' });
    const a = (await suggest(token, good)).body.suggestion;
    const b = (await suggest(token, { ...good, details: 'Same park, written again by me with more words.' })).body.suggestion;
    const admin = await loginAdmin();

    const ok = await request(app).post(`/api/admin/spots/suggestions/${a.id}/approve`).set(auth(admin))
      .send({ title: 'Lamahatta Park' });
    expect(ok.status).toBe(200);
    expect(ok.body.spot.title).toBe('Lamahatta Park');

    const dup = await request(app).post(`/api/admin/spots/suggestions/${b.id}/approve`).set(auth(admin))
      .send({ title: 'Lamahatta Park' });
    expect(dup.status).toBe(409);
    // Still pending, so the team can reject it instead.
    const [row] = await db.select().from(schema.placeSuggestions).where(eq(schema.placeSuggestions.id, b.id));
    expect(row.status).toBe('pending');
  });

  it('rejecting keeps the note and tells the sender', async () => {
    const { token, user } = await registerUser({ name: 'Rejected Rinzing' });
    const s = (await suggest(token, good)).body.suggestion;
    const admin = await loginAdmin();

    expect((await request(app).post(`/api/admin/spots/suggestions/${s.id}/reject`).set(auth(admin)).send({ note: 5 })).status).toBe(400);
    const res = await request(app).post(`/api/admin/spots/suggestions/${s.id}/reject`).set(auth(admin))
      .send({ note: 'This is private land.' });
    expect(res.status).toBe(200);
    expect(res.body.suggestion).toMatchObject({ status: 'rejected', review_note: 'This is private land.', listing_id: null });

    const [note] = await db.select().from(schema.notifications)
      .where(and(eq(schema.notifications.userId, user.id), eq(schema.notifications.kind, 'place_suggestion_rejected')));
    expect(note.body).toContain('This is private land.');
    expect(note.msg).toEqual({ key: 'place_suggestion_rejected_note', params: { place: 'Lamahatta Eco Park', note: 'This is private land.' } });

    expect((await request(app).post('/api/admin/spots/suggestions/nope/reject').set(auth(admin))).status).toBe(404);
  });
});
