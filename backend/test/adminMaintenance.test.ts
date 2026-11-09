import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// File storage is faked: the tests run without MinIO.
const stored = vi.hoisted(() => ({ keys: new Map<string, string[]>(), deleted: [] as string[] }));
vi.mock('../src/lib/s3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/lib/s3')>()),
  listBucketKeys: vi.fn(async (bucket: string) => stored.keys.get(bucket) ?? []),
  deleteStoredObject: vi.fn(async (bucket: string, key: string) => {
    stored.deleted.push(`${bucket}/${key}`);
  }),
}));

import { app } from '../src/app';
import { db, pool, schema } from '../src/db';
import { STORAGE_BUCKETS } from '../src/lib/s3';
import { DEMO_PROVIDER_ID } from '../src/lib/demoData';
import { loginAdmin, registerUser } from './helpers';

let n = 0;
async function listing(o: { title: string; type?: string; provider?: string; image?: string; extras?: Record<string, unknown> }) {
  const id = `m-${++n}`;
  await db.insert(schema.listings).values({
    id, title: o.title, type: o.type ?? 'homestay', description: 'x', location: 'Darjeeling', price: 1500,
    image: o.image ?? '', tags: [], providerId: o.provider ?? 'prov-1', extras: o.extras ?? {},
    createdAt: new Date().toISOString(),
  });
  return id;
}

const as = (token: string) => ({ Authorization: `Bearer ${token}` });

beforeEach(() => {
  stored.keys.clear();
  stored.deleted.length = 0;
});

describe('admin Clean-up tab', () => {
  it('is admin-only', async () => {
    const { token } = await registerUser({ name: 'Traveller' });
    for (const path of ['photos', 'demo', 'content', 'storage']) {
      expect((await request(app).get(`/api/admin/maintenance/${path}`)).status).toBe(401);
      expect((await request(app).get(`/api/admin/maintenance/${path}`).set(as(token))).status).toBe(403);
    }
    for (const path of ['photos/repair', 'demo/delete', 'storage/delete']) {
      expect((await request(app).post(`/api/admin/maintenance/${path}`).set(as(token))).status).toBe(403);
    }
  });

  it('reports broken photo addresses, then repairs them', async () => {
    const admin = await loginAdmin();
    const id = await listing({ title: 'Cloud Stay', image: 'https://1darjeeling.in,https://aaganerp.in/one-darjeeling/a-photo.jpg' });

    const before = await request(app).get('/api/admin/maintenance/photos').set(as(admin));
    expect(before.body.count).toBe(1);
    expect(before.body.changes[0]).toMatchObject({ table: 'listings', column: 'image', id, after: 'https://aanganerp.in/one-darjeeling/a-photo.jpg' });

    const fix = await request(app).post('/api/admin/maintenance/photos/repair').set(as(admin));
    expect(fix.body).toEqual({ updated: 1 });
    const { rows } = await pool.query('SELECT image FROM listings WHERE id = $1', [id]);
    expect(rows[0].image).toBe('https://aanganerp.in/one-darjeeling/a-photo.jpg');
    expect((await request(app).get('/api/admin/maintenance/photos').set(as(admin))).body.count).toBe(0);
  });

  it('deletes the demo businesses and nothing else', async () => {
    const admin = await loginAdmin();
    const demo = await listing({ title: 'Mist & Pine Homestay', provider: DEMO_PROVIDER_ID });
    const real = await listing({ title: 'Mist & Pine Homestay', provider: 'prov-real' });
    const spot = await listing({ title: 'Tiger Hill Sunrise', type: 'spot', provider: DEMO_PROVIDER_ID });

    const report = await request(app).get('/api/admin/maintenance/demo').set(as(admin));
    expect(report.body.remove.map((l: any) => l.id)).toEqual([demo]);

    expect((await request(app).post('/api/admin/maintenance/demo/delete').set(as(admin))).body).toEqual({ deleted: 1 });
    const { rows } = await pool.query('SELECT id FROM listings ORDER BY id');
    expect(rows.map((r) => r.id).sort()).toEqual([real, spot].sort());
  });

  it('lists test-looking content', async () => {
    const admin = await loginAdmin();
    const junk = await listing({ title: 'D' });
    await listing({ title: 'Hillside Homestay', image: 'https://aanganerp.in/one-darjeeling/h.jpg' });
    const res = await request(app).get('/api/admin/maintenance/content').set(as(admin));
    expect(res.body.items).toEqual([
      expect.objectContaining({ kind: 'listing', id: junk, label: 'D', type: 'homestay', problems: expect.arrayContaining(['no photo']) }),
    ]);
  });

  it('deletes only stored files that nothing refers to', async () => {
    const admin = await loginAdmin();
    await listing({ title: 'Gallery Stay', image: 'https://aanganerp.in/one-darjeeling/main-1111.jpg', extras: { images: ['https://aanganerp.in/one-darjeeling/gallery-2222.png'] } });
    const [kyc, pub] = STORAGE_BUCKETS;
    stored.keys.set(kyc, ['old-document-3333.pdf']);
    stored.keys.set(pub, ['main-1111.jpg', 'gallery-2222.png', 'leftover-4444.jpg']);

    const report = await request(app).get('/api/admin/maintenance/storage').set(as(admin));
    expect(report.body.unused_total).toBe(2);
    expect(report.body.buckets).toEqual([
      { bucket: kyc, total: 1, used: 0, unused: ['old-document-3333.pdf'] },
      { bucket: pub, total: 3, used: 2, unused: ['leftover-4444.jpg'] },
    ]);

    const del = await request(app).post('/api/admin/maintenance/storage/delete').set(as(admin));
    expect(del.body).toEqual({ deleted: 2, failed: 0 });
    expect(stored.deleted.sort()).toEqual([`${kyc}/old-document-3333.pdf`, `${pub}/leftover-4444.jpg`].sort());
  });
});
