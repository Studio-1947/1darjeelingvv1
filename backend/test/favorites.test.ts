import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, createListing } from './helpers';

describe('favorites', () => {
  it('requires auth', async () => {
    const res = await request(app).get('/api/favorites');
    expect(res.status).toBe(401);
  });

  it('saves a listing and returns it from GET / and GET /ids', async () => {
    const { token } = await registerUser({ name: 'Saver One' });
    const listing = await createListing({ title: 'Saved Sunrise Point' });

    const add = await request(app).post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id });
    expect(add.status).toBe(200);

    const list = await request(app).get('/api/favorites').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.items.length).toBe(1);
    expect(list.body.items[0].id).toBe(listing.id);
    // Shaped like a /listings item so the frontend card renders it unchanged.
    expect(list.body.items[0]).toHaveProperty('provider_verified');

    const ids = await request(app).get('/api/favorites/ids').set('Authorization', `Bearer ${token}`);
    expect(ids.status).toBe(200);
    expect(ids.body.ids).toEqual([listing.id]);
  });

  it('is idempotent — saving the same listing twice keeps a single row', async () => {
    const { token } = await registerUser({ name: 'Double Saver' });
    const listing = await createListing({ title: 'Twice Saved' });

    await request(app).post('/api/favorites').set('Authorization', `Bearer ${token}`).send({ listing_id: listing.id });
    const second = await request(app).post('/api/favorites').set('Authorization', `Bearer ${token}`).send({ listing_id: listing.id });
    expect(second.status).toBe(200);

    const list = await request(app).get('/api/favorites').set('Authorization', `Bearer ${token}`);
    expect(list.body.items.length).toBe(1);
  });

  it('removes a saved listing', async () => {
    const { token } = await registerUser({ name: 'Unsaver' });
    const listing = await createListing({ title: 'To Be Unsaved' });

    await request(app).post('/api/favorites').set('Authorization', `Bearer ${token}`).send({ listing_id: listing.id });
    const del = await request(app).delete(`/api/favorites/${listing.id}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);

    const list = await request(app).get('/api/favorites').set('Authorization', `Bearer ${token}`);
    expect(list.body.items.length).toBe(0);
  });

  it('removing a listing that was never saved is a no-op success', async () => {
    const { token } = await registerUser({ name: 'Noop Unsaver' });
    const listing = await createListing();
    const del = await request(app).delete(`/api/favorites/${listing.id}`).set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
  });

  it('404s when saving a listing that does not exist', async () => {
    const { token } = await registerUser({ name: 'Ghost Saver' });
    const res = await request(app).post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: 'does-not-exist' });
    expect(res.status).toBe(404);
  });

  it("only returns the caller's own favorites", async () => {
    const { token: tokenA } = await registerUser({ name: 'Favorites Owner A' });
    const { token: tokenB } = await registerUser({ name: 'Favorites Owner B' });
    const listing = await createListing({ title: 'A-only Save' });

    await request(app).post('/api/favorites').set('Authorization', `Bearer ${tokenA}`).send({ listing_id: listing.id });

    const listA = await request(app).get('/api/favorites').set('Authorization', `Bearer ${tokenA}`);
    const listB = await request(app).get('/api/favorites').set('Authorization', `Bearer ${tokenB}`);
    expect(listA.body.items.length).toBe(1);
    expect(listB.body.items.length).toBe(0);
  });
});
