import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { registerUser, loginAdmin, onboardActiveProvider } from './helpers';

describe('admin routes', () => {
  it('no longer exposes the old unauthenticated /dev/seed route', async () => {
    const res = await request(app).post('/api/dev/seed');
    expect(res.status).toBe(404);
  });

  it('rejects /admin/seed without a token', async () => {
    const res = await request(app).post('/api/admin/seed');
    expect(res.status).toBe(401);
  });

  it('rejects /admin/seed for a non-admin user', async () => {
    const { token } = await registerUser({ name: 'Regular Joe' });
    const res = await request(app).post('/api/admin/seed').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('seeds sample listings for an admin, idempotently', async () => {
    const admin = await loginAdmin();
    const first = await request(app).post('/api/admin/seed').set('Authorization', `Bearer ${admin}`);
    expect(first.status).toBe(200);
    expect(first.body.seeded).toBeGreaterThan(0);

    const second = await request(app).post('/api/admin/seed').set('Authorization', `Bearer ${admin}`);
    expect(second.body.seeded).toBe(0);
  });

  it('returns platform stats for an admin', async () => {
    const admin = await loginAdmin();
    await registerUser({ name: 'Counted User' });
    const res = await request(app).get('/api/admin/stats').set('Authorization', `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.users).toBeGreaterThanOrEqual(1);
  });
});

describe('admin provider status update', () => {
  it('rejects a status outside the allowed set', async () => {
    const { providerId } = await onboardActiveProvider({ name: 'Status Guard Provider' });
    const admin = await loginAdmin();
    const res = await request(app)
      .put(`/api/admin/providers/${providerId}/status`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'banned' });
    expect(res.status).toBe(400);
    expect(res.body.detail).toBeTruthy();
  });

  it('accepts a valid status transition to pending_payment', async () => {
    const { providerId } = await onboardActiveProvider({ name: 'Status Valid Provider' });
    const admin = await loginAdmin();
    const res = await request(app)
      .put(`/api/admin/providers/${providerId}/status`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'pending_payment' });
    expect(res.status).toBe(200);
  });

  // This is the real admin suspend path: `frontend-admin/src/pages/Admin.tsx`'s
  // handleToggleProviderStatus sends exactly the string 'suspended' when suspending an
  // active provider. A previous version of this suite only exercised 'pending_payment',
  // which passed even though 'suspended' — the value the client actually sends — was
  // rejected by the route's allow-list. Send the exact string the UI sends.
  it('accepts a valid status transition to suspended — the exact string the admin UI sends', async () => {
    const { providerId } = await onboardActiveProvider({ name: 'Status Suspend Provider' });
    const admin = await loginAdmin();
    const res = await request(app)
      .put(`/api/admin/providers/${providerId}/status`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'suspended' });
    expect(res.status).toBe(200);

    const users = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${admin}`);
    const row = users.body.items.find((u: any) => u.providerId === providerId);
    expect(row.providerStatus).toBe('suspended');
  });

  it('still rejects a status outside the allowed set after suspended was added', async () => {
    const { providerId } = await onboardActiveProvider({ name: 'Status Guard Provider Two' });
    const admin = await loginAdmin();
    const res = await request(app)
      .put(`/api/admin/providers/${providerId}/status`)
      .set('Authorization', `Bearer ${admin}`)
      .send({ status: 'deactivated' });
    expect(res.status).toBe(400);
    expect(res.body.detail).toBeTruthy();
  });
});
