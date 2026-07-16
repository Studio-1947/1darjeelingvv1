import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, onboardActiveProvider, loginAdmin, createListing } from './helpers';

describe('listings authorization', () => {
  it('rejects a plain tourist trying to create a listing', async () => {
    const { token } = await registerUser({ name: 'Tourist Tina', role: 'tourist' });
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Fake Listing', type: 'spot', description: 'x', location: 'y' });
    expect(res.status).toBe(403);
  });

  it('rejects listing creation with no auth token at all', async () => {
    const res = await request(app)
      .post('/api/listings')
      .send({ title: 'Fake Listing', type: 'spot', description: 'x', location: 'y' });
    expect(res.status).toBe(401);
  });

  it('lets an active provider create a listing under their own provider id', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Provider Pema' });
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'My Homestay', type: 'homestay', description: 'cozy', location: 'Darjeeling' });
    expect(res.status).toBe(200);
    expect(res.body.item.provider_id).toBe(providerId);
  });

  it('ignores a spoofed provider_id from a non-admin provider', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Provider Norbu' });
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Spoofed Listing',
        type: 'homestay',
        description: 'x',
        location: 'y',
        provider_id: 'someone-elses-provider-id',
      });
    expect(res.status).toBe(200);
    expect(res.body.item.provider_id).toBe(providerId);
    expect(res.body.item.provider_id).not.toBe('someone-elses-provider-id');
  });

  it('honors an explicit provider_id when the caller is an admin', async () => {
    const admin = await loginAdmin();
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${admin}`)
      .send({
        title: 'Admin Listing',
        type: 'spot',
        description: 'x',
        location: 'y',
        provider_id: 'admin-seed-provider',
      });
    expect(res.status).toBe(200);
    expect(res.body.item.provider_id).toBe('admin-seed-provider');
  });
});

describe('listings read endpoints', () => {
  it('lists and searches listings', async () => {
    await createListing({ title: 'Tiger Hill Sunrise' });
    const res = await request(app).get('/api/listings').query({ q: 'Tiger' });
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThanOrEqual(1);
    expect(res.body.items[0].title).toContain('Tiger');
  });

  it('gets a single listing by id, and 404s for an unknown id', async () => {
    const listing = await createListing();
    const okRes = await request(app).get(`/api/listings/${listing.id}`);
    expect(okRes.status).toBe(200);
    expect(okRes.body.item.id).toBe(listing.id);

    const missingRes = await request(app).get('/api/listings/does-not-exist');
    expect(missingRes.status).toBe(404);
  });
});

describe('provider can manage multiple listings', () => {
  it('lets an active provider create a second listing distinct from the one auto-created on activation', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Multi Listing Provider' });
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Second Listing', type: 'homestay', description: 'x', location: 'y' });
    expect(res.status).toBe(200);
    expect(res.body.item.provider_id).toBe(providerId);

    const listRes = await request(app).get('/api/listings').query({ type: 'homestay' });
    const mine = listRes.body.items.filter((i: any) => i.provider_id === providerId);
    expect(mine.length).toBeGreaterThanOrEqual(2); // the auto-created one + this one
  });

  it('lets a provider edit their own listing', async () => {
    const { token } = await onboardActiveProvider({ name: 'Editing Provider' });
    const createRes = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Original Title', type: 'homestay', description: 'x', location: 'y', price: 1000 });
    const listingId = createRes.body.item.id;

    const patchRes = await request(app)
      .patch(`/api/listings/${listingId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated Title', price: 1500 });

    expect(patchRes.status).toBe(200);
    expect(patchRes.body.item.title).toBe('Updated Title');
    expect(patchRes.body.item.price).toBe(1500);
  });

  it('blocks a different provider from editing someone else\'s listing', async () => {
    const { token: ownerToken } = await onboardActiveProvider({ name: 'Owner Provider' });
    const { token: otherToken } = await onboardActiveProvider({ name: 'Other Provider' });
    const createRes = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ title: 'Owner Listing', type: 'homestay', description: 'x', location: 'y' });
    const listingId = createRes.body.item.id;

    const patchRes = await request(app)
      .patch(`/api/listings/${listingId}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ title: 'Hijacked Title' });
    expect(patchRes.status).toBe(403);

    const deleteRes = await request(app)
      .delete(`/api/listings/${listingId}`)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(deleteRes.status).toBe(403);
  });

  it('lets a provider delete their own listing, and it disappears from search', async () => {
    const { token } = await onboardActiveProvider({ name: 'Deleting Provider' });
    const createRes = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Doomed Listing', type: 'homestay', description: 'x', location: 'y' });
    const listingId = createRes.body.item.id;

    const deleteRes = await request(app)
      .delete(`/api/listings/${listingId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(200);

    const getRes = await request(app).get(`/api/listings/${listingId}`);
    expect(getRes.status).toBe(404);
  });

  it('lets an admin edit or delete any listing regardless of ownership', async () => {
    const { token } = await onboardActiveProvider({ name: 'Admin Managed Provider' });
    const createRes = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Provider Owned', type: 'homestay', description: 'x', location: 'y' });
    const listingId = createRes.body.item.id;

    const admin = await loginAdmin();
    const patchRes = await request(app)
      .patch(`/api/listings/${listingId}`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ title: 'Admin Edited' });
    expect(patchRes.status).toBe(200);

    const deleteRes = await request(app)
      .delete(`/api/listings/${listingId}`)
      .set('Authorization', `Bearer ${admin}`);
    expect(deleteRes.status).toBe(200);
  });

  it('404s editing or deleting an unknown listing', async () => {
    const { token } = await onboardActiveProvider({ name: 'Ghost Editor Provider' });
    const patchRes = await request(app)
      .patch('/api/listings/does-not-exist')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'x' });
    expect(patchRes.status).toBe(404);

    const deleteRes = await request(app)
      .delete('/api/listings/does-not-exist')
      .set('Authorization', `Bearer ${token}`);
    expect(deleteRes.status).toBe(404);
  });
});
