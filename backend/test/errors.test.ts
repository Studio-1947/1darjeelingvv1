import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { loginAdmin } from './helpers';

describe('error handling', () => {
  it('returns JSON 404 for an unknown API route, not an HTML page', async () => {
    const res = await request(app).get('/api/definitely-not-a-route');
    expect(res.status).toBe(404);
    expect(res.body.detail).toBeTruthy();
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('returns JSON 404 for an unknown method on a known path', async () => {
    const res = await request(app).patch('/api/listings');
    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/json/);
  });

  it('turns an unhandled route error into a JSON 500 without leaking a stack trace', async () => {
    const token = await loginAdmin();
    // price is an integer column; a non-numeric value makes the driver throw mid-request.
    const res = await request(app)
      .post('/api/listings')
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'Boom',
        type: 'spot',
        description: 'triggers a driver-level error',
        location: 'Darjeeling',
        price: 'not-a-number',
        provider_id: 'admin-seed-provider',
      });

    expect(res.status).toBe(500);
    expect(res.headers['content-type']).toMatch(/json/);

    const body = JSON.stringify(res.body);
    // No stack frames, file paths, SQL, or driver internals in the response.
    expect(body).not.toMatch(/at \w+.*\(/);
    expect(body).not.toMatch(/[/\\]src[/\\]routes/);
    expect(body).not.toMatch(/insert into/i);
    expect(res.text).not.toMatch(/<pre>/);
  });

  it('does not leak the health route behind the 404 handler', async () => {
    const res = await request(app).get('/api');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
