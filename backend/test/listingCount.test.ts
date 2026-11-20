import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { createListing } from './helpers';

// The About page's "places mapped so far": the listings a traveller can find, under the same rules
// as GET /listings (a draft spot is not counted).
describe('GET /api/listings/count', () => {
  it('counts what travellers can see, and not a draft spot', async () => {
    const before = (await request(app).get('/api/listings/count')).body.count;

    await createListing({ title: 'Counted Viewpoint' });
    await createListing({ title: 'Hidden Draft Spot', extras: { published: false } });

    const res = await request(app).get('/api/listings/count');
    expect(res.status).toBe(200);
    expect(res.body.count).toBe(before + 1);
  });

  it('is not mistaken for a listing id', async () => {
    const res = await request(app).get('/api/listings/count');
    expect(res.status).toBe(200);
    expect(typeof res.body.count).toBe('number');
    expect(res.body.item).toBeUndefined();
  });
});
