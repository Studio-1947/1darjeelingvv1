import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser } from './helpers';

function onboardPayload(overrides: Record<string, any> = {}) {
  return {
    business_name: "Test Provider's Business",
    business_type: 'shop',
    description: 'A lovely little shop',
    location: 'Darjeeling',
    contact_phone: '+919000099999',
    ...overrides,
  };
}

describe('provider onboarding guards', () => {
  it('rejects a second onboard while the first provider is still pending_payment or active, and leaves the first untouched', async () => {
    const { token } = await registerUser({ name: 'Double Onboarder', role: 'provider' });

    const first = await request(app)
      .post('/api/providers/onboard')
      .set('Authorization', `Bearer ${token}`)
      .send(onboardPayload({ business_name: 'First Business' }));
    expect(first.status).toBe(200);
    const firstProvider = first.body.provider;

    const second = await request(app)
      .post('/api/providers/onboard')
      .set('Authorization', `Bearer ${token}`)
      .send(onboardPayload({ business_name: 'Second Business' }));
    expect(second.status).toBe(409);
    expect(second.body.detail).toBeTruthy();

    // The first provider must be entirely untouched by the rejected second attempt.
    const me = await request(app)
      .get('/api/providers/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.provider.id).toBe(firstProvider.id);
    expect(me.body.provider.business_name).toBe('First Business');
    expect(me.body.provider.status).toBe('pending_payment');
  });

  it('rejects a business_type outside the self-onboardable KYC matrix', async () => {
    const { token } = await registerUser({ name: 'Bad Type Onboarder', role: 'provider' });
    const res = await request(app)
      .post('/api/providers/onboard')
      .set('Authorization', `Bearer ${token}`)
      .send(onboardPayload({ business_type: 'event' }));
    expect(res.status).toBe(400);
    expect(res.body.detail).toBeTruthy();
    expect(res.body.detail).toMatch(/driver|homestay|cafe|shop/);
  });

  it('accepts each of the self-onboardable business types', async () => {
    for (const businessType of ['driver', 'homestay', 'cafe', 'shop']) {
      const { token } = await registerUser({ name: `Valid ${businessType}`, role: 'provider' });
      const res = await request(app)
        .post('/api/providers/onboard')
        .set('Authorization', `Bearer ${token}`)
        .send(onboardPayload({ business_type: businessType, business_name: `${businessType} biz` }));
      expect(res.status).toBe(200);
      expect(res.body.provider.business_type).toBe(businessType);
    }
  });
});
