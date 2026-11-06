import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { createListing, loginAdmin, registerUser } from './helpers';

// The server, not only the forms, refuses test text and tidies names (lib/contentRules.ts).
describe('content rules on the routes', () => {
  const create = async (body: Record<string, unknown>) => request(app).post('/api/listings')
    .set('Authorization', `Bearer ${await loginAdmin()}`)
    .send({ type: 'homestay', description: 'A real place', provider_id: 'admin-seed-provider', ...body });

  it('refuses a listing called "D" or placed at "asdasd"', async () => {
    expect((await create({ title: 'D', location: 'Darjeeling' })).status).toBe(400);
    expect((await create({ title: 'Real Stay', location: 'asdasd' })).status).toBe(400);
  });

  it('tidies the spacing of a listing place', async () => {
    const res = await create({ title: 'Tidy Stay', location: 'Dali , Darjeeling' });
    expect(res.status).toBe(200);
    expect(res.body.item.location).toBe('Dali, Darjeeling');
  });

  it('refuses a review that carries a referral code', async () => {
    const listing = await createListing({ title: 'Reviewed Spot' });
    const { token } = await registerUser({ name: 'Code Sharer' });
    const res = await request(app).post('/api/reviews').set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id, rating: 5, comment: 'Very good ANG26-4AWLNE' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('referral_code');
  });
});
