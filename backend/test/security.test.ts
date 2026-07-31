import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// The upload routes push to the public bucket; stub it so tests never need MinIO.
vi.mock('../src/lib/s3', () => ({
  uploadToMinIO: vi.fn(async (_buffer: Buffer, key: string) => `https://cdn.test/1darjeeling/${key}`),
  uploadPrivate: vi.fn(async (_buffer: Buffer, key: string) => key),
  getPrivateObject: vi.fn(async () => {
    const { Readable } = await import('stream');
    return { stream: Readable.from([Buffer.from('test-file-bytes')]), contentType: 'image/png' };
  }),
  deletePrivate: vi.fn(async () => {}),
}));

import { app } from '../src/app';
import { db, schema } from '../src/db';
import { eq, inArray } from 'drizzle-orm';
import { registerUser, onboardActiveProvider, loginAdmin, nextPhone } from './helpers';

// 1x1 transparent PNG as a data URL — the smallest payload that is genuinely a PNG.
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('privilege escalation', () => {
  it('ignores a self-assigned admin role at registration', async () => {
    const phone = nextPhone();
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone, otp: '123456', name: 'Would-be Admin', role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('tourist');

    // The row itself must not be an admin either — the token is minted from it.
    const [stored] = await db.select().from(schema.users).where(eq(schema.users.phone, phone)).limit(1);
    expect(stored.role).toBe('tourist');

    // And the resulting token must not open the admin-only surface.
    const spots = await request(app)
      .get('/api/admin/spots')
      .set('Authorization', `Bearer ${res.body.token}`);
    expect(spots.status).toBe(403);
  });

  it('still honours the roles a caller may legitimately choose', async () => {
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: nextPhone(), otp: '123456', name: 'Real Provider', role: 'provider' });
    expect(res.body.user.role).toBe('provider');
  });
});

describe('image upload hardening', () => {
  it('stores a genuine image under an extension derived from its verified type', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .post('/api/admin/spots/upload')
      .set('Authorization', `Bearer ${token}`)
      // A filename that would previously have chosen the stored extension.
      .send({ file: PNG_DATA_URL, filename: 'photo.html' });

    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/\.png$/);
    expect(res.body.url).not.toMatch(/\.html/);
  });

  it('refuses a non-image media type even from an authenticated tourist', async () => {
    const { token } = await registerUser({ name: 'Upload Tourist' });
    const html = Buffer.from('<script>alert(1)</script>').toString('base64');
    const res = await request(app)
      .post('/api/listings/upload')
      .set('Authorization', `Bearer ${token}`)
      .send({ file: `data:text/html;base64,A${html}`, filename: 'pwn.html' });

    expect(res.status).toBe(400);
  });

  it('refuses a payload whose bytes are not the image type it claims', async () => {
    const token = await loginAdmin();
    const html = Buffer.from('<script>alert(1)</script>').toString('base64');
    const res = await request(app)
      .post('/api/admin/spots/upload')
      .set('Authorization', `Bearer ${token}`)
      .send({ file: `data:image/jpeg;base64,${html}`, filename: 'photo.jpg' });

    expect(res.status).toBe(400);
  });

  it('refuses SVG, which is script-capable on the public media origin', async () => {
    const token = await loginAdmin();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>').toString('base64');
    const res = await request(app)
      .post('/api/admin/spots/upload')
      .set('Authorization', `Bearer ${token}`)
      .send({ file: `data:image/svg+xml;base64,${svg}`, filename: 'x.svg' });

    expect(res.status).toBe(400);
  });
});

describe('listing payload validation', () => {
  it('rejects a non-numeric price with 400 instead of failing in the driver', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Bad Price', type: 'spot', description: 'x', location: 'Darjeeling',
        price: 'free', provider_id: 'admin-seed-provider',
      });

    expect(res.status).toBe(400);
  });

  it('rejects a non-array tags value that would crash every consumer', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Bad Tags', type: 'spot', description: 'x', location: 'Darjeeling',
        tags: { a: 1 }, provider_id: 'admin-seed-provider',
      });

    expect(res.status).toBe(400);
  });

  it('rejects an unknown listing type rather than polluting the feed filter', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Bad Type', type: 'Spot', description: 'x', location: 'Darjeeling' });

    expect(res.status).toBe(400);
  });

  it('keeps a numeric-string coordinate instead of silently dropping the pin', async () => {
    const token = await loginAdmin();
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'String Coords', type: 'spot', description: 'x', location: 'Darjeeling',
        latitude: '27.036', longitude: '88.262', provider_id: 'admin-seed-provider',
      });

    expect(res.status).toBe(200);
    expect(res.body.item.latitude).toBeCloseTo(27.036);
    expect(res.body.item.longitude).toBeCloseTo(88.262);
  });

  it('blocks blanking a spot through the generic update route', async () => {
    const token = await loginAdmin();
    const created = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Protected Spot', type: 'spot', description: 'x', location: 'Darjeeling',
        provider_id: 'admin-seed-provider',
      });

    const blanked = await request(app)
      .patch(`/api/listings/${created.body.item.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '' });
    expect(blanked.status).toBe(400);

    const offWorld = await request(app)
      .patch(`/api/listings/${created.body.item.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: 5000 });
    expect(offWorld.status).toBe(400);

    // NaN is a number to `typeof`, which is how it used to reach the column.
    const notANumber = await request(app)
      .patch(`/api/listings/${created.body.item.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude: 'abc' });
    expect(notANumber.status).toBe(400);
  });

  it('clamps limit rather than 500ing on a negative one', async () => {
    const negative = await request(app).get('/api/listings').query({ limit: -1 });
    expect(negative.status).toBe(200);

    const huge = await request(app).get('/api/listings').query({ limit: 1000000 });
    expect(huge.status).toBe(200);
    expect(huge.body.items.length).toBeLessThanOrEqual(200);
  });
});

describe('draft spot visibility', () => {
  async function createDraftSpot() {
    const admin = await loginAdmin();
    const created = await request(app)
      .post('/api/admin/spots')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        title: `Draft Spot ${Math.random().toString(36).slice(2)}`,
        description: 'not ready for the public',
        location: 'Darjeeling',
        extras: { published: false },
      });
    if (created.status !== 200) {
      throw new Error(`draft spot create failed: ${created.status} ${JSON.stringify(created.body)}`);
    }
    return created.body.item.id as string;
  }

  it('does not let an unpublished spot be favourited', async () => {
    const spotId = await createDraftSpot();
    const { token } = await registerUser({ name: 'Draft Favouriter' });

    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: spotId });

    expect(res.status).toBe(404);
  });

  it('hides a spot from saved items once it is unpublished', async () => {
    const admin = await loginAdmin();
    const created = await request(app)
      .post('/api/admin/spots')
      .set('Authorization', `Bearer ${admin}`)
      .send({ title: `Pullable Spot ${Math.random().toString(36).slice(2)}`, description: 'live for now', location: 'Darjeeling' });
    const spotId = created.body.item.id as string;

    const { token } = await registerUser({ name: 'Saver' });
    const saved = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: spotId });
    expect(saved.status).toBe(200);

    const before = await request(app).get('/api/favorites').set('Authorization', `Bearer ${token}`);
    expect(before.body.items.map((i: any) => i.id)).toContain(spotId);

    await request(app)
      .post(`/api/admin/spots/${spotId}/publish`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ published: false });

    const after = await request(app).get('/api/favorites').set('Authorization', `Bearer ${token}`);
    expect(after.body.items.map((i: any) => i.id)).not.toContain(spotId);
  });

  it('does not let an unpublished spot be reviewed', async () => {
    const spotId = await createDraftSpot();
    const { token } = await registerUser({ name: 'Draft Reviewer' });

    const res = await request(app)
      .post('/api/reviews')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: spotId, rating: 5, comment: 'lovely' });

    expect(res.status).toBe(404);
  });
});

describe('account deletion cleanup', () => {
  it('removes listings filed under the deleted user\'s provider id', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Departing Owner' });

    const created = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Ghost Homestay', type: 'homestay', description: 'x', location: 'Darjeeling' });
    expect(created.status).toBe(200);
    // The listing is filed under the provider id, not the user id — which is what the old
    // delete missed entirely.
    expect(created.body.item.provider_id).toBe(providerId);

    const del = await request(app).delete('/api/users/me').set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);

    const [orphan] = await db.select().from(schema.listings)
      .where(eq(schema.listings.id, created.body.item.id)).limit(1);
    expect(orphan).toBeUndefined();
  });

  it('removes a provider\'s listings when an admin deletes the account', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Fraudulent Owner' });
    const created = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Fraud Shop', type: 'shop', description: 'x', location: 'Darjeeling' });

    const [providerRow] = await db.select().from(schema.providers)
      .where(eq(schema.providers.id, providerId)).limit(1);

    const admin = await loginAdmin();
    const del = await request(app)
      .delete(`/api/admin/users/${providerRow.userId}`)
      .set('Authorization', `Bearer ${admin}`);
    expect(del.status).toBe(200);

    const remaining = await db.select().from(schema.listings)
      .where(inArray(schema.listings.id, [created.body.item.id]));
    expect(remaining).toHaveLength(0);
  });
});
