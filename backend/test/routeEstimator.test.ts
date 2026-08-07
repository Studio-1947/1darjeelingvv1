import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

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
});
