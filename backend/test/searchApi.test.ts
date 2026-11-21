import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { loginAdmin } from './helpers';

/** GET /listings?q= reads the query, ranks the results and says what it understood. */
describe('search through the listings API', () => {
  it('finds a stay from a sentence with a typo and a budget, and explains the search', async () => {
    const admin = await loginAdmin();
    const add = (body: Record<string, unknown>) =>
      request(app).post('/api/listings').set({ Authorization: `Bearer ${admin}` })
        .send({ description: 'x', provider_id: 'admin-seed-provider', ...body });
    await add({ title: 'Sunrise Ridge Homestay', type: 'homestay', location: 'Ghum, Darjeeling', price: 1800 });
    await add({ title: 'Ridge Palace Homestay', type: 'homestay', location: 'Ghum, Darjeeling', price: 6000 });
    await add({ title: 'Sunrise Taxi', type: 'driver', location: 'Ghum', price: 1500 });

    const res = await request(app).get('/api/listings').query({ q: 'stay in ghoom under 2000 sunrise ridgee' });
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: any) => i.title)).toEqual(['Sunrise Ridge Homestay']);
    expect(res.body.search).toMatchObject({ type: 'homestay', max_price: 2000 });

    const cheap = await request(app).get('/api/listings').query({ q: 'cheap ridge homestay ghum' });
    expect(cheap.body.items.map((i: any) => i.title)).toEqual(['Sunrise Ridge Homestay', 'Ridge Palace Homestay']);
    expect(cheap.body.search.cheapest_first).toBe(true);
    expect(res.body.search.corrected).toContain('ridge');
  });

  it('keeps the plain list (no search block) when there is no query', async () => {
    const res = await request(app).get('/api/listings').query({ type: 'homestay' });
    expect(res.body.search).toBeUndefined();
  });
});
