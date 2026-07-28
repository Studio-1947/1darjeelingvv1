import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

// The spot upload route pushes to the public bucket; stub it so tests never need MinIO.
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
import { registerUser, onboardActiveProvider, loginAdmin } from './helpers';

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

let titleCounter = 0;
const uniqueTitle = (prefix: string) => `${prefix} ${Date.now()}-${++titleCounter}`;

async function createSpot(token: string, overrides: Record<string, any> = {}) {
  const res = await request(app)
    .post('/api/admin/spots')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: uniqueTitle('Test Spot'),
      description: 'A curated viewpoint',
      location: 'Darjeeling',
      ...overrides,
    });
  if (res.status !== 200) {
    throw new Error(`createSpot failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.item;
}

describe('tourist spots — only an admin can write them', () => {
  it('rejects an active provider creating a spot through the listings route', async () => {
    const { token } = await onboardActiveProvider({ name: 'Spot Squatting Provider' });
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: uniqueTitle('Provider Spot'), type: 'spot', description: 'x', location: 'Darjeeling' });
    expect(res.status).toBe(403);
    expect(res.body.detail).toMatch(/admin/i);
  });

  it('rejects a tourist creating a spot', async () => {
    const { token } = await registerUser({ name: 'Spot Tourist', role: 'tourist' });
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: uniqueTitle('Tourist Spot'), type: 'spot', description: 'x', location: 'Darjeeling' });
    expect(res.status).toBe(403);
  });

  it('still lets an active provider create their own non-spot listing', async () => {
    const { token } = await onboardActiveProvider({ name: 'Ordinary Provider' });
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: uniqueTitle('A Homestay'), type: 'homestay', description: 'x', location: 'Darjeeling' });
    expect(res.status).toBe(200);
  });

  it('rejects every unauthenticated and non-admin call to the admin spot routes', async () => {
    const admin = await loginAdmin();
    const spot = await createSpot(admin);
    const { token: provider } = await onboardActiveProvider({ name: 'Nosy Provider' });

    const anon = await request(app).get('/api/admin/spots');
    expect(anon.status).toBe(401);

    const listed = await request(app).get('/api/admin/spots').set('Authorization', `Bearer ${provider}`);
    expect(listed.status).toBe(403);

    const created = await request(app)
      .post('/api/admin/spots')
      .set('Authorization', `Bearer ${provider}`)
      .send({ title: uniqueTitle('Nope'), description: 'x', location: 'y' });
    expect(created.status).toBe(403);

    const patched = await request(app)
      .patch(`/api/admin/spots/${spot.id}`)
      .set('Authorization', `Bearer ${provider}`)
      .send({ title: 'Hijacked' });
    expect(patched.status).toBe(403);

    const uploaded = await request(app)
      .post('/api/admin/spots/upload')
      .set('Authorization', `Bearer ${provider}`)
      .send({ file: PNG_DATA_URL, filename: 'x.png' });
    expect(uploaded.status).toBe(403);

    const deleted = await request(app)
      .delete(`/api/admin/spots/${spot.id}`)
      .set('Authorization', `Bearer ${provider}`);
    expect(deleted.status).toBe(403);
  });

  it('blocks a provider from editing or deleting a spot through the listings route', async () => {
    const admin = await loginAdmin();
    const spot = await createSpot(admin);
    const { token: provider } = await onboardActiveProvider({ name: 'Spot Editing Provider' });

    const patched = await request(app)
      .patch(`/api/listings/${spot.id}`)
      .set('Authorization', `Bearer ${provider}`)
      .send({ title: 'Hijacked Spot' });
    expect(patched.status).toBe(403);

    const deleted = await request(app)
      .delete(`/api/listings/${spot.id}`)
      .set('Authorization', `Bearer ${provider}`);
    expect(deleted.status).toBe(403);

    const still = await request(app).get(`/api/listings/${spot.id}`);
    expect(still.status).toBe(200);
    expect(still.body.item.title).toBe(spot.title);
  });
});

describe('tourist spots — admin CRUD', () => {
  it('creates a spot with its editorial fields and returns it in the admin list', async () => {
    const admin = await loginAdmin();
    const title = uniqueTitle('Tiger Hill');
    const res = await request(app)
      .post('/api/admin/spots')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        title,
        description: 'The most famous sunrise viewpoint around Darjeeling.',
        location: 'Ghum, Darjeeling',
        latitude: 27.0028,
        longitude: 88.267,
        price: 50,
        image: 'https://cdn.test/hero.jpg',
        tags: ['sunrise', 'viewpoint'],
        extras: {
          images: ['https://cdn.test/1.jpg', 'https://cdn.test/2.jpg'],
          highlights: ['Kanchenjunga sunrise', 'Observation tower'],
          best_time: 'October to December',
          timings: '4:00 AM – 7:00 AM',
          entry_fee: '₹50 per person',
          how_to_reach: 'Shared jeep from Chowk Bazaar, 11 km.',
          altitude: '2,590 m',
          address: 'Tiger Hill Road',
          featured: true,
          sort_order: 1,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.item.title).toBe(title);
    expect(res.body.item.type).toBe('spot');
    expect(res.body.item.published).toBe(true);
    expect(res.body.item.featured).toBe(true);
    expect(res.body.item.extras.images).toHaveLength(2);
    expect(res.body.item.extras.best_time).toBe('October to December');
    expect(res.body.item.latitude).toBeCloseTo(27.0028);

    const list = await request(app).get('/api/admin/spots').set('Authorization', `Bearer ${admin}`);
    expect(list.status).toBe(200);
    expect(list.body.items.some((s: any) => s.id === res.body.item.id)).toBe(true);
  });

  it('rejects a spot with no title, and a duplicate title', async () => {
    const admin = await loginAdmin();
    const missing = await request(app)
      .post('/api/admin/spots')
      .set('Authorization', `Bearer ${admin}`)
      .send({ description: 'x', location: 'y' });
    expect(missing.status).toBe(400);

    const spot = await createSpot(admin);
    const duplicate = await request(app)
      .post('/api/admin/spots')
      .set('Authorization', `Bearer ${admin}`)
      .send({ title: spot.title, description: 'x', location: 'y' });
    expect(duplicate.status).toBe(409);
  });

  it('rejects invalid editorial payloads', async () => {
    const admin = await loginAdmin();
    const cases: Record<string, any>[] = [
      { extras: { images: ['javascript:alert(1)'] } },
      { extras: { images: 'not-an-array' } },
      { extras: { sort_order: -3 } },
      { extras: { published: 'maybe' } },
      { extras: { best_time: 'x'.repeat(500) } },
      { image: 'not-a-url' },
      { price: -10 },
      { latitude: 200 },
    ];
    for (const payload of cases) {
      const res = await request(app)
        .post('/api/admin/spots')
        .set('Authorization', `Bearer ${admin}`)
        .send({ title: uniqueTitle('Invalid'), description: 'x', location: 'y', ...payload });
      expect(res.status, `payload ${JSON.stringify(payload)} should be rejected`).toBe(400);
    }
  });

  it('updates a spot and keeps extras the patch did not mention', async () => {
    const admin = await loginAdmin();
    const spot = await createSpot(admin, {
      extras: { images: ['https://cdn.test/a.jpg'], highlights: ['Great views'], best_time: 'Spring' },
    });

    const patched = await request(app)
      .patch(`/api/admin/spots/${spot.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ title: uniqueTitle('Renamed Spot'), extras: { entry_fee: 'Free' } });

    expect(patched.status).toBe(200);
    expect(patched.body.item.extras.entry_fee).toBe('Free');
    expect(patched.body.item.extras.images).toEqual(['https://cdn.test/a.jpg']);
    expect(patched.body.item.extras.highlights).toEqual(['Great views']);
    expect(patched.body.item.extras.best_time).toBe('Spring');
  });

  it('clears a text field when it is sent as an empty string', async () => {
    const admin = await loginAdmin();
    const spot = await createSpot(admin, { extras: { entry_fee: '₹50' } });
    const patched = await request(app)
      .patch(`/api/admin/spots/${spot.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ extras: { entry_fee: '' } });
    expect(patched.status).toBe(200);
    expect(patched.body.item.extras.entry_fee).toBeUndefined();
  });

  it('404s for an unknown spot id and for a non-spot listing id', async () => {
    const admin = await loginAdmin();
    const { token } = await onboardActiveProvider({ name: 'Homestay Owner For Spots' });
    const homestay = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: uniqueTitle('Not A Spot'), type: 'homestay', description: 'x', location: 'y' });

    const unknown = await request(app)
      .patch('/api/admin/spots/does-not-exist')
      .set('Authorization', `Bearer ${admin}`)
      .send({ title: 'x' });
    expect(unknown.status).toBe(404);

    const wrongType = await request(app)
      .patch(`/api/admin/spots/${homestay.body.item.id}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ title: 'x' });
    expect(wrongType.status).toBe(404);
  });

  it('deletes a spot', async () => {
    const admin = await loginAdmin();
    const spot = await createSpot(admin);
    const del = await request(app).delete(`/api/admin/spots/${spot.id}`).set('Authorization', `Bearer ${admin}`);
    expect(del.status).toBe(200);
    const gone = await request(app).get(`/api/listings/${spot.id}`);
    expect(gone.status).toBe(404);
  });

  it('uploads a spot photo and answers 400 for an empty one', async () => {
    const admin = await loginAdmin();
    const ok = await request(app)
      .post('/api/admin/spots/upload')
      .set('Authorization', `Bearer ${admin}`)
      .send({ file: PNG_DATA_URL, filename: 'view.png' });
    expect(ok.status).toBe(200);
    expect(ok.body.url).toMatch(/^https:\/\/cdn\.test\//);
    expect(ok.body.url).toMatch(/\.png$/);

    const empty = await request(app)
      .post('/api/admin/spots/upload')
      .set('Authorization', `Bearer ${admin}`)
      .send({ file: '', filename: 'view.png' });
    expect(empty.status).toBe(400);
  });
});

describe('tourist spots — publishing controls public visibility', () => {
  it('hides a draft spot from the public list and detail routes, and shows it again once published', async () => {
    const admin = await loginAdmin();
    const spot = await createSpot(admin, { extras: { published: false } });

    const list = await request(app).get('/api/listings').query({ type: 'spot', limit: 200 });
    expect(list.status).toBe(200);
    expect(list.body.items.some((i: any) => i.id === spot.id)).toBe(false);

    const detail = await request(app).get(`/api/listings/${spot.id}`);
    expect(detail.status).toBe(404);

    // The admin can still see it — that is the whole point of a draft.
    const adminList = await request(app).get('/api/admin/spots').set('Authorization', `Bearer ${admin}`);
    expect(adminList.body.items.some((s: any) => s.id === spot.id)).toBe(true);

    const publish = await request(app)
      .post(`/api/admin/spots/${spot.id}/publish`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ published: true });
    expect(publish.status).toBe(200);
    expect(publish.body.item.published).toBe(true);

    const afterList = await request(app).get('/api/listings').query({ type: 'spot', limit: 200 });
    expect(afterList.body.items.some((i: any) => i.id === spot.id)).toBe(true);
    const afterDetail = await request(app).get(`/api/listings/${spot.id}`);
    expect(afterDetail.status).toBe(200);
  });

  it('rejects a publish call with a non-boolean flag', async () => {
    const admin = await loginAdmin();
    const spot = await createSpot(admin);
    const res = await request(app)
      .post(`/api/admin/spots/${spot.id}/publish`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ published: 'yes' });
    expect(res.status).toBe(400);
  });

  it('leaves non-spot listings untouched by the draft filter', async () => {
    const { token } = await onboardActiveProvider({ name: 'Unaffected Provider' });
    const title = uniqueTitle('Visible Homestay');
    await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title, type: 'homestay', description: 'x', location: 'y', extras: { published: false } });

    const res = await request(app).get('/api/listings').query({ q: title });
    expect(res.body.items.some((i: any) => i.title === title)).toBe(true);
  });

  it('orders the public spots feed: featured first, then sort_order', async () => {
    const admin = await loginAdmin();
    const plain = await createSpot(admin, { extras: { sort_order: 50 } });
    const early = await createSpot(admin, { extras: { sort_order: 2 } });
    const starred = await createSpot(admin, { extras: { featured: true, sort_order: 99 } });

    const res = await request(app).get('/api/listings').query({ type: 'spot', limit: 200 });
    expect(res.status).toBe(200);
    const ids = res.body.items.map((i: any) => i.id);
    expect(ids.indexOf(starred.id)).toBeLessThan(ids.indexOf(early.id));
    expect(ids.indexOf(early.id)).toBeLessThan(ids.indexOf(plain.id));
  });
});
