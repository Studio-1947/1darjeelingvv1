import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';

import { app } from '../src/app';
import { db, schema } from '../src/db';
import { LIVE_CAPTURE_MAX_ACCURACY_M } from '../src/routes/providers';
import { captureLiveLocation, onboardActiveProvider, registerUser } from './helpers';

const profile = (token: string) =>
  request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${token}`).then((r) => r.body);

describe('live location capture', () => {
  it('saves the pin on the provider and every listing, marked as captured live', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Live One', businessType: 'cafe' });

    const res = await captureLiveLocation(token, { latitude: 27.0412, longitude: 88.2655, accuracy: 18.4 });
    expect(res.status).toBe(200);
    expect(res.body.location.verified).toBe(true);
    expect(res.body.location.source).toBe('live_capture');
    expect(res.body.location.accuracy_m).toBe(18);

    const [provider] = await db.select().from(schema.providers).where(eq(schema.providers.id, providerId));
    expect(provider.latitude).toBe(27.0412);
    expect((provider.extras as any).location_verification.source).toBe('live_capture');

    const listings = await db.select().from(schema.listings).where(eq(schema.listings.providerId, providerId));
    expect(listings.length).toBeGreaterThan(0);
    for (const l of listings) {
      expect(l.latitude).toBe(27.0412);
      expect((l.extras as any).location_verified.source).toBe('live_capture');
    }
  });

  it('turns the checklist row done for a cafe, and a pasted Google Maps link does not', async () => {
    const { token } = await onboardActiveProvider({ name: 'Live Row', businessType: 'shop' });
    const before = (await profile(token)).checklist.find((c: any) => c.key === 'location');
    expect(before.state).toBe('missing');
    expect(before.action).toBe('live_capture');

    await request(app).post('/api/providers/me/location/verify').set('Authorization', `Bearer ${token}`)
      .send({ maps_url: 'https://www.google.com/maps/@27.036,88.2627,17z' });
    expect((await profile(token)).checklist.find((c: any) => c.key === 'location').state).toBe('missing');

    await captureLiveLocation(token);
    expect((await profile(token)).checklist.find((c: any) => c.key === 'location').state).toBe('done');
  });

  it('refuses a reading that is too imprecise to say which building the phone is in', async () => {
    const { token } = await onboardActiveProvider({ name: 'Live Vague', businessType: 'cafe' });
    const res = await captureLiveLocation(token, { accuracy: LIVE_CAPTURE_MAX_ACCURACY_M + 1 });
    expect(res.status).toBe(400);
    expect(res.body.detail).toMatch(/within/);
    const ok = await captureLiveLocation(token, { accuracy: LIVE_CAPTURE_MAX_ACCURACY_M });
    expect(ok.status).toBe(200);
  });

  it('refuses a reading the phone says came from a mock-location app', async () => {
    const { token } = await onboardActiveProvider({ name: 'Live Mock', businessType: 'cafe' });
    const res = await request(app).post('/api/providers/me/location/live').set('Authorization', `Bearer ${token}`)
      .send({ latitude: 27.036, longitude: 88.2627, accuracy: 10, mocked: true });
    expect(res.status).toBe(400);
    expect(res.body.detail).toMatch(/mock/i);
    expect((await captureLiveLocation(token)).status).toBe(200);
  });

  it('refuses a position outside the area we serve', async () => {
    const { token } = await onboardActiveProvider({ name: 'Live Away', businessType: 'cafe' });
    const delhi = await captureLiveLocation(token, { latitude: 28.6139, longitude: 77.209 });
    expect(delhi.status).toBe(400);
    expect(delhi.body.detail).toMatch(/Darjeeling/);
  });

  it('refuses a malformed reading', async () => {
    const { token } = await onboardActiveProvider({ name: 'Live Bad', businessType: 'cafe' });
    const send = (body: Record<string, unknown>) =>
      request(app).post('/api/providers/me/location/live').set('Authorization', `Bearer ${token}`).send(body);
    expect((await send({})).status).toBe(400);
    expect((await send({ latitude: '27.03', longitude: '88.26', accuracy: 10 })).status).toBe(400);
    expect((await send({ latitude: 27.03, longitude: 88.26 })).status).toBe(400);
    expect((await send({ latitude: 27.03, longitude: 88.26, accuracy: 0 })).status).toBe(400);
    expect((await send({ latitude: 27.03, longitude: 88.26, accuracy: -5 })).status).toBe(400);
  });

  it('needs a signed-in provider', async () => {
    const anon = await request(app).post('/api/providers/me/location/live').send({ latitude: 27.03, longitude: 88.26, accuracy: 10 });
    expect(anon.status).toBe(401);

    const { token } = await registerUser({ name: 'Not A Provider' });
    const res = await captureLiveLocation(token);
    expect(res.status).toBe(404);
  });

  it('is inherited by a listing added afterwards', async () => {
    const { token } = await onboardActiveProvider({ name: 'Live Inherit', businessType: 'cafe' });
    await captureLiveLocation(token, { latitude: 27.0399, longitude: 88.2601 });
    const created = await request(app).post('/api/listings').set('Authorization', `Bearer ${token}`)
      .send({ title: 'Second Counter', type: 'cafe', description: 'A second counter on the same street', location: 'Darjeeling' });
    expect(created.status).toBe(200);
    expect(created.body.item.latitude).toBe(27.0399);
    expect(created.body.item.extras.location_verified.source).toBe('live_capture');
  });

  it('moving the captured pin by hand takes the verification with it', async () => {
    const { token } = await onboardActiveProvider({ name: 'Live Moved', businessType: 'cafe' });
    await captureLiveLocation(token);
    const mine = await request(app).get('/api/bookings/provider').set('Authorization', `Bearer ${token}`);
    const listingId = mine.body.listings[0].id as string;

    // The provider's pin and the listing's own pin were verified separately, so both have to move.
    await request(app).patch('/api/providers/me').set('Authorization', `Bearer ${token}`).send({ latitude: 27.2, longitude: 88.4 });
    expect((await profile(token)).checklist.find((c: any) => c.key === 'location').state).toBe('done');
    await request(app).patch(`/api/listings/${listingId}`).set('Authorization', `Bearer ${token}`).send({ latitude: 27.2, longitude: 88.4 });
    expect((await profile(token)).checklist.find((c: any) => c.key === 'location').state).toBe('missing');
  });
});
