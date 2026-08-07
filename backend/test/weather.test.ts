import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

describe('Weather API (/api/weather)', () => {
  it('returns default Darjeeling weather when no location is passed', async () => {
    const res = await request(app).get('/api/weather');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Darjeeling Town');
    expect(res.body.temp).toBeDefined();
    expect(res.body.kanchenjungaIndex).toBe('clear');
  });

  it('returns Kalimpong weather when location=kalimpong', async () => {
    const res = await request(app).get('/api/weather?location=kalimpong');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Kalimpong Ridge');
    expect(res.body.altitude).toBe('1,250m');
  });

  it('returns Kurseong weather when location=kurseong', async () => {
    const res = await request(app).get('/api/weather?location=kurseong');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('Kurseong Dow Hill');
    expect(res.body.kanchenjungaIndex).toBe('partial');
  });
});
