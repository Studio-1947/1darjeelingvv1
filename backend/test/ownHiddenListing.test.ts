import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { onboardActiveProvider, registerUser } from './helpers';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

describe('a listing hidden while its host waits for approval', () => {
  it('404s for travellers but opens for its own host, marked not live', async () => {
    const host = await onboardActiveProvider({ name: 'Waiting Wangdi', awaitingApproval: true });
    const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.providerId, host.providerId)).limit(1);
    expect(listing).toBeTruthy();

    expect((await request(app).get(`/api/listings/${listing.id}`)).status).toBe(404);
    const { token } = await registerUser({ name: 'Curious Karma' });
    expect((await request(app).get(`/api/listings/${listing.id}`).set(auth(token))).status).toBe(404);

    const own = await request(app).get(`/api/listings/${listing.id}`).set(auth(host.token));
    expect(own.status).toBe(200);
    expect(own.body.item.not_live).toBe(true);
  });

  it('is not marked for a live listing', async () => {
    const host = await onboardActiveProvider({ name: 'Live Lobsang' });
    const [listing] = await db.select().from(schema.listings).where(eq(schema.listings.providerId, host.providerId)).limit(1);
    const res = await request(app).get(`/api/listings/${listing.id}`);
    expect(res.status).toBe(200);
    expect(res.body.item.not_live).toBe(false);
  });
});
