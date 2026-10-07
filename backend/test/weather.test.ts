import { afterEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('GET /api/weather', () => {
  it('returns the mobile weather contract for a supported location', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        current: {
          temperature_2m: 14.6,
          relative_humidity_2m: 82.1,
          weather_code: 2,
          wind_speed_10m: 7.8,
        },
        daily: { sunrise: ['2030-01-01T06:21'] },
      }),
    } as Response);

    const res = await request(app).get('/api/weather?location=darjeeling');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      location: 'darjeeling',
      name: 'Darjeeling',
      altitude: '2,042 m',
      temp: 15,
      condition: 'Partly cloudy',
      humidity: 82,
      wind: '8 km/h',
      kanchenjungaIndex: 'partial',
      sunriseTime: '2030-01-01T06:21',
    });
  });

  it('rejects locations outside the supported destination list', async () => {
    const res = await request(app).get('/api/weather?location=London');
    expect(res.status).toBe(400);
  });
});
