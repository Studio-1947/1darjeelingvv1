import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, createListing } from './helpers';

// Business and Traveller are kept apart: from the business side a host cannot book or save.
describe('business mode', () => {
  it('refuses a booking sent from Business mode', async () => {
    const { token } = await registerUser({ name: 'Mode Booker' });
    const listing = await createListing({ title: 'Mode Stay' });
    const res = await request(app).post('/api/bookings')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Aangan-Mode', 'business')
      .send({ listing_id: listing.id, guests: 1 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('business_mode');
  });

  it('refuses a save sent from Business mode, and allows it from Traveller', async () => {
    const { token } = await registerUser({ name: 'Mode Saver' });
    const listing = await createListing({ title: 'Mode Save' });
    const business = await request(app).post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Aangan-Mode', 'Business')
      .send({ listing_id: listing.id });
    expect(business.status).toBe(403);
    expect(business.body.code).toBe('business_mode');

    const traveller = await request(app).post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .set('X-Aangan-Mode', 'traveller')
      .send({ listing_id: listing.id });
    expect(traveller.status).toBe(200);
  });

  it('treats a request without the header as Traveller', async () => {
    const { token } = await registerUser({ name: 'No Header Saver' });
    const listing = await createListing({ title: 'No Header' });
    const res = await request(app).post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id });
    expect(res.status).toBe(200);
  });
});
