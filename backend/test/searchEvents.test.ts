import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { scrubQuery, sweepSearchEvents, SEARCH_LOG_DAYS } from '../src/lib/searchEvents';
import { loginAdmin } from './helpers';

const S = 'visit_abcdef123456';
const send = (body: Record<string, unknown>) => request(app).post('/api/search-events').send({ session: S, surface: 'sheet', source: 'typed', ...body });

describe('the search log', () => {
  it('keeps the words without phone numbers, PINs or email addresses', () => {
    expect(scrubQuery('homestay call 98000 12345')).toBe('homestay call');
    expect(scrubQuery('+91-98000-12345 taxi')).toBe('taxi');
    expect(scrubQuery('mail me a@b.in ghum')).toBe('mail me ghum');
    expect(scrubQuery('under 2000 ghum')).toBe('under 2000 ghum');
    expect(scrubQuery('x'.repeat(300))).toHaveLength(120);
  });

  it('stores a search anonymously, and only that visit can say what it opened', async () => {
    const res = await send({ q: 'Ghoom  Monastery 9800012345', type: 'spot', results: 3 });
    expect(res.status).toBe(201);
    const [row] = await db.select().from(schema.searchEvents).where(eq(schema.searchEvents.id, res.body.id));
    expect(row).toMatchObject({ q: 'Ghoom Monastery', qNorm: 'ghum monastery', type: 'spot', results: 3, session: S });
    expect(Object.keys(row)).not.toContain('userId');

    await request(app).patch(`/api/search-events/${res.body.id}/opened`).send({ session: 'someone_elses_visit', listing_id: 'l9', rank: 1 });
    await request(app).patch(`/api/search-events/${res.body.id}/opened`).send({ session: S, listing_id: 'l2', rank: 2 });
    await request(app).patch(`/api/search-events/${res.body.id}/opened`).send({ session: S, listing_id: 'l3', rank: 3 });
    const [after] = await db.select().from(schema.searchEvents).where(eq(schema.searchEvents.id, res.body.id));
    expect([after.openedListingId, after.openedRank]).toEqual(['l2', 2]);
  });

  it('refuses a search with no words left, or no visit code', async () => {
    expect((await send({ q: '9800012345', results: 0 })).status).toBe(400);
    expect((await request(app).post('/api/search-events').send({ q: 'ghum' })).status).toBe(400);
  });

  it('reports top searches and what found nothing, to admins only', async () => {
    await send({ q: 'Sittong homestay', type: 'homestay', results: 0 });
    await send({ q: 'sittong homestay', type: 'homestay', results: 0, source: 'voice' });
    const hit = await send({ q: 'ghum', results: 4 });
    await request(app).patch(`/api/search-events/${hit.body.id}/opened`).send({ session: S, listing_id: 'l1', rank: 1 });

    expect((await request(app).get('/api/admin/search-insights')).status).toBe(401);
    const admin = await loginAdmin();
    const res = await request(app).get('/api/admin/search-insights').query({ days: 30 }).set({ Authorization: `Bearer ${admin}` });
    expect(res.status).toBe(200);
    expect(res.body.totals).toMatchObject({ searches: 3, sessions: 1, zero: 2, opened: 1, voice: 1 });
    expect(res.body.missing[0]).toMatchObject({ q: 'sittong homestay', n: 2, type: 'homestay' });
    expect(res.body.top[0]).toMatchObject({ q: 'sittong homestay', n: 2 });
    expect(res.body.keep_days).toBe(SEARCH_LOG_DAYS);
  });

  it('deletes searches older than the kept days', async () => {
    const old = new Date(Date.now() - (SEARCH_LOG_DAYS + 1) * 86_400_000).toISOString();
    await db.insert(schema.searchEvents).values({ id: 'old-1', session: S, q: 'old', qNorm: 'old', surface: 'sheet', source: 'typed', results: 1, createdAt: old });
    await send({ q: 'new', results: 1 });
    expect(await sweepSearchEvents()).toBe(1);
    const left = await db.select({ q: schema.searchEvents.q }).from(schema.searchEvents);
    expect(left.map((r) => r.q)).toEqual(['new']);
  });
});
