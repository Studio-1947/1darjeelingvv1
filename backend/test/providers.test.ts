import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { eq } from 'drizzle-orm';
import { registerUser, loginAdmin, onboardActiveProvider } from './helpers';

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
  // Onboarding a second time while the first provider is still pending_payment (onboarded, but
  // payment never completed) used to 409 unconditionally — stranding the user, since the
  // frontend only creates a payment order from a *successful* onboard response, so there was no
  // way to resume. It must now be idempotent: the existing row is updated in place and returned
  // with 200, and no second row is created (the DB's unique index on providers.user_id would
  // reject one anyway).
  it('resuming a pending_payment onboard updates the same row in place, returns 200, and creates no second row', async () => {
    const { token, user } = await registerUser({ name: 'Resuming Onboarder', role: 'provider' });

    const first = await request(app)
      .post('/api/providers/onboard')
      .set('Authorization', `Bearer ${token}`)
      .send(onboardPayload({ business_name: 'First Business' }));
    expect(first.status).toBe(200);
    expect(first.body.provider.status).toBe('pending_payment');
    const firstProviderId = first.body.provider.id;

    const second = await request(app)
      .post('/api/providers/onboard')
      .set('Authorization', `Bearer ${token}`)
      .send(onboardPayload({ business_name: 'Resumed Business', description: 'Updated on resume' }));
    expect(second.status).toBe(200);
    expect(second.body.provider.id).toBe(firstProviderId);
    expect(second.body.provider.business_name).toBe('Resumed Business');
    expect(second.body.provider.description).toBe('Updated on resume');
    expect(second.body.provider.status).toBe('pending_payment');

    // Exactly one row for this user, with the resumed details — not two.
    const rows = await db.select().from(schema.providers).where(eq(schema.providers.userId, user.id));
    expect(rows.length).toBe(1);
    expect(rows[0].id).toBe(firstProviderId);
    expect(rows[0].businessName).toBe('Resumed Business');

    // The now-resumed provider can proceed straight to creating the payment order, same as a
    // fresh onboard — the frontend flow (useProviderOnboard.ts) needs no special-casing.
    const orderRes = await request(app)
      .post('/api/payments/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ flow: 'provider_registration', reference_id: firstProviderId });
    expect(orderRes.status).toBe(200);
  });

  it('rejects a second onboard once the provider is active, and leaves the active row untouched', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Active Double Onboarder' });

    const second = await request(app)
      .post('/api/providers/onboard')
      .set('Authorization', `Bearer ${token}`)
      .send(onboardPayload({ business_name: 'Second Business' }));
    expect(second.status).toBe(409);
    expect(second.body.detail).toBeTruthy();

    const me = await request(app)
      .get('/api/providers/me')
      .set('Authorization', `Bearer ${token}`);
    expect(me.status).toBe(200);
    expect(me.body.provider.id).toBe(providerId);
    expect(me.body.provider.status).toBe('active');
    expect(me.body.provider.business_name).not.toBe('Second Business');
  });

  it('rejects a second onboard for a suspended provider, with a distinct contact-support message, and creates no second row', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Suspended Double Onboarder' });
    const admin = await loginAdmin();
    const suspendRes = await request(app)
      .put(`/api/admin/providers/${providerId}/status`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'suspended' });
    expect(suspendRes.status).toBe(200);

    const second = await request(app)
      .post('/api/providers/onboard')
      .set('Authorization', `Bearer ${token}`)
      .send(onboardPayload({ business_name: 'Sneaky Second Business' }));
    expect(second.status).toBe(409);
    expect(second.body.detail).toBeTruthy();
    expect(second.body.detail).toMatch(/support/i);

    const rows = await db.select().from(schema.providers).where(eq(schema.providers.id, providerId));
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('suspended');
    expect(rows[0].businessName).not.toBe('Sneaky Second Business');
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
