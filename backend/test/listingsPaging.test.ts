import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../src/app';
import { loginAdmin } from './helpers';

const UA = 'Mozilla/5.0 Chrome/140';

async function makeSpots(word: string, n: number) {
  const admin = await loginAdmin();
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const res = await request(app)
      .post('/api/admin/spots')
      .set('Authorization', `Bearer ${admin}`)
      .send({ title: `${word} viewpoint ${i}`, description: `A ${word} place`, location: 'Darjeeling', extras: { sort_order: i } });
    expect(res.status).toBe(200);
    ids.push(res.body.item.id);
  }
  return ids;
}

/** Follows next_offset from the first page to the last, collecting every id. */
async function walk(query: string) {
  const seen: string[] = [];
  let offset: number | null = 0;
  let total = -1;
  for (let guard = 0; offset !== null && guard < 500; guard++) {
    const res = await request(app).get(`/api/listings?${query}&limit=2&offset=${offset}`).set('User-Agent', UA);
    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeLessThanOrEqual(2);
    if (total < 0) total = res.body.total;
    seen.push(...res.body.items.map((i: any) => i.id));
    offset = res.body.next_offset;
  }
  return { seen, total };
}

describe('GET /listings paging', () => {
  it('walks every public spot once, in order, with total and next_offset', async () => {
    const mine = await makeSpots(`pagewalk${uuidv4().slice(0, 6)}`, 5);
    const { seen, total } = await walk('type=spot');
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen.length).toBe(total);
    for (const id of mine) expect(seen).toContain(id);
  });

  it('pages a search the same way', async () => {
    const word = `zqpage${uuidv4().replace(/-/g, '').slice(0, 8)}`;
    const mine = await makeSpots(word, 5);
    const { seen, total } = await walk(`type=spot&q=${word}`);
    expect(total).toBe(5);
    expect(seen.sort()).toEqual([...mine].sort());
  });

  it('treats a bad offset as 0 and answers past the end with an empty last page', async () => {
    const first = await request(app).get('/api/listings?type=spot&limit=3').set('User-Agent', UA);
    for (const bad of ['-5', 'abc', '']) {
      const res = await request(app).get(`/api/listings?type=spot&limit=3&offset=${bad}`).set('User-Agent', UA);
      expect(res.status).toBe(200);
      expect(res.body.items.map((i: any) => i.id)).toEqual(first.body.items.map((i: any) => i.id));
    }
    const past = await request(app).get(`/api/listings?type=spot&limit=3&offset=${first.body.total + 10}`).set('User-Agent', UA);
    expect(past.status).toBe(200);
    expect(past.body.items).toEqual([]);
    expect(past.body.next_offset).toBeNull();
  });
});
