import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { onboardActiveProvider } from './helpers';

/** Board: a homestay's photos show the rooms, the outside and the front. Hosts label each photo. */
describe('homestay photo kinds', () => {
  const auth = (t: string) => ({ Authorization: `Bearer ${t}` });
  const a = 'https://example.com/front.jpg';
  const b = 'https://example.com/room.jpg';

  it('saves which photo shows what, and copies it to the listing', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kinds Host', businessType: 'homestay' });
    const res = await request(app).patch('/api/providers/me').set(auth(token))
      .send({ profile: { images: [a, b], photo_kinds: { [a]: 'front', [b]: 'room' } } });
    expect(res.status).toBe(200);
    expect(res.body.provider.extras.photo_kinds).toEqual({ [a]: 'front', [b]: 'room' });
  });

  it('refuses an unknown kind or a label on something that is not a photo', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kinds Host Two', businessType: 'homestay' });
    const bad = await request(app).patch('/api/providers/me').set(auth(token)).send({ profile: { photo_kinds: { [a]: 'garage' } } });
    expect(bad.status).toBe(400);
    const notUrl = await request(app).patch('/api/providers/me').set(auth(token)).send({ profile: { photo_kinds: { 'x': 'room' } } });
    expect(notUrl.status).toBe(400);
  });
});
