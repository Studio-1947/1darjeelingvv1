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
});
