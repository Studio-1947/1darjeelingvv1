import { describe, it, expect } from 'vitest';
import request from 'supertest';

import { app } from '../src/app';
import { db, schema } from '../src/db';
import { eq } from 'drizzle-orm';
import { onboardActiveProvider, registerUser } from './helpers';

const IN_DARJEELING = 'https://www.google.com/maps/place/Norbu/@27.036,88.2627,17z/data=!3d27.036!4d88.2627';

const verify = (token: string, maps_url: unknown) =>
  request(app).post('/api/providers/me/location/verify').set('Authorization', `Bearer ${token}`).send({ maps_url });

describe('provider location verification', () => {
  it('saves the pin on the provider and every listing, flagged verified', async () => {
    const { token } = await onboardActiveProvider({ name: 'Loc One', businessType: 'homestay' });
    const res = await verify(token, IN_DARJEELING);
    expect(res.status).toBe(200);
    expect(res.body.location).toMatchObject({ verified: true, latitude: 27.036, longitude: 88.2627, source: 'google_maps_link' });

    const me = await request(app).get('/api/providers/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.provider.latitude).toBe(27.036);
    expect(me.body.provider.extras.location_verification.verified_at).toBeTruthy();

    const rows = await db.select().from(schema.listings);
    const mine = rows.filter((l) => l.providerId === me.body.provider.id);
    for (const l of mine) {
      expect(l.latitude).toBe(27.036);
      expect((l.extras as any).location_verified.source).toBe('google_maps_link');
    }
  });

  it('rejects a pin outside the service area, and a link that is not Google Maps', async () => {
    const { token } = await onboardActiveProvider({ name: 'Loc Two', businessType: 'homestay' });
    const delhi = await verify(token, 'https://www.google.com/maps/@28.6139,77.2090,15z');
    expect(delhi.status).toBe(400);
    expect(delhi.body.detail).toMatch(/outside/);
    const other = await verify(token, 'https://example.com/maps/@27.03,88.26,15z');
    expect(other.status).toBe(400);
    const none = await verify(token, undefined);
    expect(none.status).toBe(400);
  });

  it('needs a provider', async () => {
    const { token } = await registerUser({ name: 'Tourist', role: 'tourist' });
    expect((await verify(token, IN_DARJEELING)).status).toBe(404);
    const anon = await request(app).post('/api/providers/me/location/verify').send({ maps_url: IN_DARJEELING });
    expect(anon.status).toBe(401);
  });

  it('a host cannot claim the flag by editing a listing, and moving the pin clears it', async () => {
    const { token } = await onboardActiveProvider({ name: 'Loc Three', businessType: 'homestay' });
    const me = await request(app).get('/api/providers/me').set('Authorization', `Bearer ${token}`);
    const [listing] = (await db.select().from(schema.listings)).filter((l) => l.providerId === me.body.provider.id);
    expect(listing).toBeTruthy();

    // Not verified yet: a forged flag in extras is dropped.
    const forged = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ extras: { location_verified: { verified_at: 'now' }, wifi: true } });
    expect(forged.status).toBe(200);
    expect(forged.body.item.extras.location_verified).toBeUndefined();
    expect(forged.body.item.extras.wifi).toBe(true);

    // Verified: an extras edit keeps the genuine flag; moving the pin removes it.
    await verify(token, IN_DARJEELING);
    const edited = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ extras: { wifi: false } });
    expect(edited.body.item.extras.location_verified.source).toBe('google_maps_link');
    const moved = await request(app)
      .patch(`/api/listings/${listing.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: 27.05, longitude: 88.3 });
    expect(moved.body.item.extras.location_verified).toBeUndefined();
  });

  it('moving the provider pin by hand clears its verification', async () => {
    const { token } = await onboardActiveProvider({ name: 'Loc Four', businessType: 'homestay' });
    await verify(token, IN_DARJEELING);
    const patch = await request(app)
      .patch('/api/providers/me')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: 27.1, longitude: 88.3 });
    expect(patch.status).toBe(200);
    expect(patch.body.provider.extras.location_verification).toBeUndefined();
    const [row] = await db.select().from(schema.providers).where(eq(schema.providers.id, patch.body.provider.id));
    expect(row.latitude).toBe(27.1);
  });
});
