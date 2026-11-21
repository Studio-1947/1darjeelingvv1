import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { loginAdmin, registerUser } from './helpers';

/**
 * The admin spot form's "Get pin": a Google Maps link (or a pasted "lat, lng") in, the pin out.
 * Nothing is saved. These links carry the pin themselves, so no request leaves the server.
 */

const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

describe('POST /admin/spots/resolve-pin', () => {
  it('reads the place pin out of a full Google Maps link', async () => {
    const admin = await loginAdmin();
    const url = 'https://www.google.com/maps/place/Tiger+Hill/@27.0,88.2,15z/data=!4m6!3m5!1s0x0:0x0!8m2!3d26.9852!4d88.2867';
    const res = await request(app).post('/api/admin/spots/resolve-pin').set(auth(admin)).send({ maps_url: url });
    expect(res.status).toBe(200);
    // The place pin (!3d/!4d), not the map's centre (@27.0,88.2).
    expect(res.body).toMatchObject({ latitude: 26.9852, longitude: 88.2867, in_region: true });
    expect(res.body.maps_url).toContain('26.9852,88.2867');
  });

  it('takes pasted coordinates, and flags a pin outside the Darjeeling area', async () => {
    const admin = await loginAdmin();
    const near = await request(app).post('/api/admin/spots/resolve-pin').set(auth(admin)).send({ maps_url: '27.0410, 88.2663' });
    expect(near.body).toMatchObject({ latitude: 27.041, longitude: 88.2663, in_region: true });
    const far = await request(app).post('/api/admin/spots/resolve-pin').set(auth(admin)).send({ maps_url: '28.6139, 77.2090' });
    expect(far.status).toBe(200);
    expect(far.body.in_region).toBe(false);
  });

  it('refuses links that are not Google Maps, and anyone who is not an admin', async () => {
    const admin = await loginAdmin();
    const bad = await request(app).post('/api/admin/spots/resolve-pin').set(auth(admin)).send({ maps_url: 'https://example.com/?q=27,88' });
    expect(bad.status).toBe(400);
    const { token } = await registerUser({ name: 'Not Admin' });
    const denied = await request(app).post('/api/admin/spots/resolve-pin').set(auth(token)).send({ maps_url: '27.04, 88.26' });
    expect(denied.status).toBe(403);
  });
});
