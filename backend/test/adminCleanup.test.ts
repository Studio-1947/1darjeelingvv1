import { describe, it, expect } from 'vitest';
import request from 'supertest';

import { app } from '../src/app';
import { db, schema } from '../src/db';
import { eq } from 'drizzle-orm';
import { loginAdmin, onboardActiveProvider, registerUser, nextPhone } from './helpers';

const PHRASE = 'DELETE ALL USERS';

async function seedAdminAndCuratedContent() {
  const adminId = `admin-${Date.now()}`;
  await db.insert(schema.users).values({
    id: adminId,
    name: 'Kept Admin',
    phone: nextPhone(),
    role: 'admin',
    createdAt: new Date().toISOString(),
  } as typeof schema.users.$inferInsert);
  const spotId = `spot-${Date.now()}`;
  await db.insert(schema.listings).values({
    id: spotId,
    title: 'Tiger Hill',
    type: 'spot',
    description: 'Curated sunrise viewpoint above Darjeeling town.',
    location: 'Darjeeling',
    price: 0,
    image: '',
    tags: [],
    providerId: 'admin-seed-provider',
    extras: {},
    createdAt: new Date().toISOString(),
  } as typeof schema.listings.$inferInsert);
  return { adminId, spotId };
}

describe('admin data clean-up', () => {
  it('previews what would go without changing anything', async () => {
    const admin = await loginAdmin();
    await registerUser({ name: 'Traveller A' });
    await onboardActiveProvider({ name: 'Host A', businessType: 'homestay' });

    const res = await request(app).get('/api/admin/cleanup/preview').set('Authorization', `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.users).toBe(2);
    expect(res.body.hosts).toBe(1);
    expect(res.body.travellers).toBe(1);
    expect(res.body.phrase).toBe(PHRASE);

    expect((await db.select().from(schema.users)).length).toBe(2);
  });

  it('refuses without the typed phrase, and for non-admins', async () => {
    const admin = await loginAdmin();
    const { token } = await registerUser({ name: 'Traveller B' });

    const noPhrase = await request(app).post('/api/admin/cleanup/users').set('Authorization', `Bearer ${admin}`).send({ mode: 'all' });
    expect(noPhrase.status).toBe(400);
    const wrong = await request(app).post('/api/admin/cleanup/users').set('Authorization', `Bearer ${admin}`).send({ mode: 'all', confirm: 'yes' });
    expect(wrong.status).toBe(400);
    const tourist = await request(app).post('/api/admin/cleanup/users').set('Authorization', `Bearer ${token}`).send({ mode: 'all', confirm: PHRASE });
    expect(tourist.status).toBe(403);
    const touristPreview = await request(app).get('/api/admin/cleanup/preview').set('Authorization', `Bearer ${token}`);
    expect(touristPreview.status).toBe(403);
    const anon = await request(app).post('/api/admin/cleanup/users').send({ mode: 'all', confirm: PHRASE });
    expect(anon.status).toBe(401);

    expect((await db.select().from(schema.users)).length).toBe(1);
  });

  it('deletes every non-admin account, their listings and bookings, and keeps admins and curated content', async () => {
    const admin = await loginAdmin();
    const { adminId, spotId } = await seedAdminAndCuratedContent();
    await registerUser({ name: 'Traveller C' });
    const host = await onboardActiveProvider({ name: 'Host C', businessType: 'homestay' });
    const hostListings = (await db.select().from(schema.listings)).filter((l) => l.providerId !== 'admin-seed-provider');
    expect(hostListings.length).toBeGreaterThan(0);

    const res = await request(app).post('/api/admin/cleanup/users').set('Authorization', `Bearer ${admin}`).send({ mode: 'all', confirm: PHRASE });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ deleted: 2, failed: 0 });

    const users = await db.select().from(schema.users);
    expect(users.map((u) => u.id)).toEqual([adminId]);
    expect((await db.select().from(schema.providers)).length).toBe(0);
    const listings = await db.select().from(schema.listings);
    expect(listings.map((l) => l.id)).toEqual([spotId]);

    // The deleted host's old token no longer works.
    const stale = await request(app).get('/api/providers/me').set('Authorization', `Bearer ${host.token}`);
    expect([401, 403, 404]).toContain(stale.status);
  });

  it('deletes only the selected accounts and skips admins', async () => {
    const admin = await loginAdmin();
    const { adminId } = await seedAdminAndCuratedContent();
    const a = await registerUser({ name: 'Keep Me' });
    const b = await registerUser({ name: 'Delete Me' });

    const res = await request(app)
      .post('/api/admin/cleanup/users')
      .set('Authorization', `Bearer ${admin}`)
      .send({ mode: 'selected', user_ids: [b.user.id, adminId] });
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(1);

    const ids = (await db.select().from(schema.users)).map((u) => u.id).sort();
    expect(ids).toEqual([a.user.id, adminId].sort());
    expect((await db.select().from(schema.users).where(eq(schema.users.id, b.user.id))).length).toBe(0);
  });

  it('validates the request', async () => {
    const admin = await loginAdmin();
    const bad = await request(app).post('/api/admin/cleanup/users').set('Authorization', `Bearer ${admin}`).send({ mode: 'everything' });
    expect(bad.status).toBe(400);
    const empty = await request(app).post('/api/admin/cleanup/users').set('Authorization', `Bearer ${admin}`).send({ mode: 'selected', user_ids: [] });
    expect(empty.status).toBe(400);
  });
});
