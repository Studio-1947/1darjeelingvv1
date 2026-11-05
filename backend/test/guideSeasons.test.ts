import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { guideWorksOn, seasonOf } from '../src/lib/hostProfile';
import { registerUser, onboardActiveProvider, loginAdmin } from './helpers';

/** Board: guides confirm "based on availability". The seasons on a guide's profile now count. */
describe('guide seasons', () => {
  it('maps Darjeeling months to seasons', () => {
    expect(seasonOf('2031-01-10')).toBe('winter');
    expect(seasonOf('2031-04-30')).toBe('spring');
    expect(seasonOf('2031-06-01')).toBe('summer');
    expect(seasonOf('2031-08-15')).toBe('monsoon');
    expect(seasonOf('2031-10-02')).toBe('autumn');
    expect(seasonOf('2031-12-31')).toBe('winter');
    expect(seasonOf(null)).toBeNull();
  });

  it('a guide with no seasons works all year; undated requests are allowed', () => {
    expect(guideWorksOn({}, '2031-08-01')).toBe(true);
    expect(guideWorksOn({ seasons: ['spring'] }, null)).toBe(true);
    expect(guideWorksOn({ seasons: ['spring', 'autumn'] }, '2031-10-05')).toBe(true);
    expect(guideWorksOn({ seasons: ['spring', 'autumn'] }, '2031-07-05')).toBe(false);
  });

  it('refuses a booking outside the guide’s seasons and takes one inside them', async () => {
    const { providerId } = await onboardActiveProvider({ name: 'Season Guide' });
    const admin = await loginAdmin();
    const listing = (await request(app).post('/api/listings').set({ Authorization: `Bearer ${admin}` }).send({
      title: 'Season Guide', type: 'guide', description: 'x', location: 'Darjeeling', price: 1500,
      provider_id: providerId, extras: { seasons: ['spring', 'autumn'] },
    })).body.item;
    const { token } = await registerUser({ name: 'Monsoon Walker' });
    const ask = (check_in: string) => request(app).post('/api/bookings').set({ Authorization: `Bearer ${token}` })
      .send({ listing_id: listing.id, listing_type: 'guide', check_in });

    const wet = await ask('2031-07-10');
    expect(wet.status).toBe(409);
    expect(wet.body.code).toBe('out_of_season');
    expect(wet.body.detail).toContain('spring, autumn');

    const ok = await ask('2031-10-10');
    expect(ok.status).toBe(200);
  });
});
