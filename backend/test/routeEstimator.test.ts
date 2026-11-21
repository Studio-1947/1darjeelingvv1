import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { driverFaresFor, hubsInRouteName } from '../src/routes/routeEstimator';
import { onboardActiveProvider } from './helpers';

async function addDriver(providerId: string, routes: unknown[]) {
  await db.insert(schema.listings).values({
    id: randomUUID(), title: 'Test driver', type: 'driver', description: 'x', location: 'Darjeeling',
    price: 1800, providerId, extras: { routes }, createdAt: new Date().toISOString(),
  });
}

describe('Route Estimator API (/api/routes/estimate)', () => {
  it('calculates fare and distance for Bagdogra to Darjeeling', async () => {
    const res = await request(app).get('/api/routes/estimate?from=Bagdogra Airport (IXB)&to=Darjeeling Town');
    expect(res.status).toBe(200);
    expect(res.body.distanceKm).toBe(68);
    expect(res.body.durationHours).toBe(3.0);
    expect(res.body.minFare).toBe(2800);
    expect(res.body.maxFare).toBe(4500);
    expect(typeof res.body.driverCount).toBe('number');
  });

  it('handles reverse route directions correctly', async () => {
    const res = await request(app).get('/api/routes/estimate?from=Darjeeling Town&to=Bagdogra Airport (IXB)');
    expect(res.status).toBe(200);
    expect(res.body.distanceKm).toBe(68);
    expect(res.body.minFare).toBe(2800);
  });

  it('calculates fare and distance for Siliguri Junction to Darjeeling Town', async () => {
    const res = await request(app).get('/api/routes/estimate?from=Siliguri Junction (Tenzing Norgay Stand)&to=Darjeeling Town (Chowk Bazaar / Clubside)');
    expect(res.status).toBe(200);
    expect(res.body.distanceKm).toBe(62);
    expect(res.body.durationHours).toBe(2.5);
    expect(res.body.minFare).toBe(2500);
    expect(res.body.maxFare).toBe(4200);
    expect(res.body.hatchbackFare).toBe(2500);
    expect(res.body.suvFare).toBe(3900);
  });

  it('calculates fare for Ghum to Kalimpong route', async () => {
    const res = await request(app).get('/api/routes/estimate?from=Ghum Junction %26 Monastery&to=Kalimpong Motor Stand');
    expect(res.status).toBe(200);
    expect(res.body.distanceKm).toBe(52);
    expect(res.body.minFare).toBe(2400);
  });

  it('handles same pickup and drop location correctly', async () => {
    const res = await request(app).get('/api/routes/estimate?from=Siliguri Junction&to=Siliguri Junction');
    expect(res.status).toBe(200);
    expect(res.body.distanceKm).toBe(0);
    expect(res.body.minFare).toBe(0);
    expect(res.body.routeNote).toContain('Same pickup and drop location');
  });

  it('returns null driverFares when no driver lists the route', async () => {
    const res = await request(app).get('/api/routes/estimate?from=Bagdogra Airport (IXB)&to=Mirik Lake');
    expect(res.status).toBe(200);
    expect(res.body.driverFares).toBeNull();
  });

  it("shows the range of drivers' own per-trip prices for the route, from live drivers only", async () => {
    const a = await onboardActiveProvider({ name: 'Fare Driver A', businessType: 'driver' });
    const b = await onboardActiveProvider({ name: 'Fare Driver B', businessType: 'driver' });
    const lapsed = await onboardActiveProvider({ name: 'Fare Driver C', businessType: 'driver' });
    await db.update(schema.providers).set({ planExpiresAt: '2020-01-01T00:00:00.000Z' }).where(eq(schema.providers.id, lapsed.providerId));

    await addDriver(a.providerId, [{ route: 'NJP to Darjeeling', price: 3200, unit: 'trip' }, { route: 'Full day hire', price: 1800, unit: 'day' }]);
    await addDriver(b.providerId, [{ route: 'Darjeeling - NJP', price: 2600, unit: 'trip' }, { route: 'NJP to Darjeeling via Mirik', price: 4000, unit: 'trip' }]);
    await addDriver(lapsed.providerId, [{ route: 'NJP to Darjeeling', price: 900, unit: 'trip' }]);

    const res = await request(app).get('/api/routes/estimate?from=NJP Railway Station&to=Darjeeling Town (Chowk Bazaar / Clubside)');
    expect(res.status).toBe(200);
    // B's lowest for the pair is 2,600; the lapsed driver's 900 is not public, so not counted.
    expect(res.body.driverFares).toEqual({ min: 2600, max: 3200, count: 2 });
    // Our typed figures are still there for the hatchback / SUV rows.
    expect(res.body.minFare).toBe(2800);
  });
});

describe('matching driver route names to places', () => {
  it('reads the two ends a driver typed, ignoring the way', () => {
    expect([...hubsInRouteName('NJP to Darjeeling')].sort()).toEqual(['darjeeling', 'njp']);
    expect([...hubsInRouteName('Bagdogra Airport → Kalimpong')].sort()).toEqual(['bagdogra', 'kalimpong']);
    expect([...hubsInRouteName('Darjeeling to Kalimpong via Ghum')].sort()).toEqual(['darjeeling', 'kalimpong']);
    expect([...hubsInRouteName('IXB-Ghoom')].sort()).toEqual(['bagdogra', 'ghum']);
    expect(hubsInRouteName('Full day hire').size).toBe(0);
  });

  it('only counts per-trip prices naming exactly the two places', () => {
    const fares = driverFaresFor('Bagdogra Airport (IXB)', 'Darjeeling Town', [
      { routes: [{ route: 'Airport to Darjeeling', price: 3000, unit: 'trip' }] },
      { routes: [{ route: 'Bagdogra to Darjeeling', price: 2000, unit: 'day' }] },
      { routes: [{ route: 'Siliguri/Bagdogra to Darjeeling', price: 1000, unit: 'trip' }] },
      { routes: [{ route: 'Bagdogra to Darjeeling', price: 0, unit: 'trip' }] },
      { routes: ['Bagdogra to Darjeeling'] },
    ]);
    expect(fares).toEqual({ min: 3000, max: 3000, count: 1 });
    expect(driverFaresFor('NJP', 'Mirik', [{ routes: [{ route: 'NJP to Darjeeling', price: 3000, unit: 'trip' }] }])).toBeNull();
  });
});
