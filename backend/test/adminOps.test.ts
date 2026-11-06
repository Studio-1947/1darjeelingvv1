import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/lib/s3', () => ({
  uploadPrivate: vi.fn(async (_buffer: Buffer, key: string) => key),
  getPrivateObject: vi.fn(async () => {
    const { Readable } = await import('stream');
    return { stream: Readable.from([Buffer.from('test-file-bytes')]), contentType: 'image/png' };
  }),
  deletePrivate: vi.fn(async () => {}),
}));

import { app } from '../src/app';
import { completeMandatoryProfile, loginAdmin, onboardActiveProvider, registerUser, uploadRequiredDocs, inDays } from './helpers';

/**
 * The admin console's two operating views added with host approval:
 *  - GET /admin/hosts/waiting: every host not live yet and the single step holding them up, so the
 *    team can see why a host whose documents were all approved is still not public.
 *  - GET /admin/bookings: newest first, with the guest's contact and whether a request is waiting
 *    for its host (the team can accept on a host's behalf with PATCH /bookings/:id/confirm).
 */
const auth = (t: string) => ({ Authorization: `Bearer ${t}` });

async function waiting(admin: string) {
  const res = await request(app).get('/api/admin/hosts/waiting').set(auth(admin));
  expect(res.status).toBe(200);
  return res.body;
}

describe('admin: hosts waiting to go live', () => {
  it('is admin only', async () => {
    const { token } = await registerUser({ name: 'Nosy Traveller' });
    const res = await request(app).get('/api/admin/hosts/waiting').set(auth(token));
    expect(res.status).toBe(403);
  });

  it('names the step each host is stuck on, from profile to documents to the team', async () => {
    const admin = await loginAdmin();
    const host = await onboardActiveProvider({ name: 'Stepwise Stay', awaitingApproval: true });

    // Paid, but the mandatory profile (8 photos, host name...) is not done yet.
    let row = (await waiting(admin)).hosts.find((h: any) => h.provider_id === host.providerId);
    expect(row).toBeTruthy();
    expect(row.plan_status).toBe('active');
    expect(row.next_step).toBe('finish_profile');
    expect(row.profile_missing.length).toBeGreaterThan(0);
    expect(row.phone).toBeTruthy();

    await completeMandatoryProfile(host.token);
    row = (await waiting(admin)).hosts.find((h: any) => h.provider_id === host.providerId);
    expect(row.next_step).toBe('upload_documents');
    expect(row.documents.some((d: any) => d.required && d.state === 'missing')).toBe(true);

    await uploadRequiredDocs(host.token);
    const body = await waiting(admin);
    row = body.hosts.find((h: any) => h.provider_id === host.providerId);
    // Every required document is in: now it is the team's turn.
    expect(row.next_step).toBe('review_documents');
    expect(row.documents.filter((d: any) => d.required).every((d: any) => d.state === 'in_review')).toBe(true);
    expect(body.counts.review_documents).toBeGreaterThanOrEqual(1);
  });

  it('drops a host from the list once they are verified', async () => {
    const admin = await loginAdmin();
    const host = await onboardActiveProvider({ name: 'Soon Live Guide', businessType: 'guide', awaitingApproval: true });
    await completeMandatoryProfile(host.token);
    await uploadRequiredDocs(host.token);
    const docs = await request(app).get('/api/admin/kyc?status=pending').set(auth(admin));
    for (const d of docs.body.documents.filter((x: any) => x.provider_id === host.providerId)) {
      await request(app).post(`/api/admin/kyc/${d.id}/review`).set(auth(admin)).send({ decision: 'approve' }).expect(200);
    }
    const rows = (await waiting(admin)).hosts.filter((h: any) => h.provider_id === host.providerId);
    expect(rows).toHaveLength(0);
  });
});

describe('admin: bookings list', () => {
  it('shows the guest and flags requests waiting for their host, newest first', async () => {
    const admin = await loginAdmin();
    const { providerId } = await onboardActiveProvider({ name: 'Listed Driver Host' });
    const listing = (await request(app).post('/api/listings').set(auth(admin)).send({
      title: 'Ridge Cab', type: 'driver', description: 'Cab', location: 'Darjeeling', price: 2000, provider_id: providerId,
    })).body.item;
    const { token: guest } = await registerUser({ name: 'Cab Guest' });
    const first = (await request(app).post('/api/bookings').set(auth(guest))
      .send({ listing_id: listing.id, listing_type: 'driver', check_in: inDays(10) })).body.booking;
    const second = (await request(app).post('/api/bookings').set(auth(guest))
      .send({ listing_id: listing.id, listing_type: 'driver', check_in: inDays(11) })).body.booking;

    const res = await request(app).get('/api/admin/bookings').set(auth(admin));
    expect(res.status).toBe(200);
    const ids = res.body.items.map((b: any) => b.id);
    expect(ids.indexOf(second.id)).toBeLessThan(ids.indexOf(first.id));
    const row = res.body.items.find((b: any) => b.id === first.id);
    expect(row.guestName).toBe('Cab Guest');
    expect(row.guestPhone).toBeTruthy();
    expect(row.awaitingHost).toBe(true);

    // The team accepts on the host's behalf; the flag clears.
    await request(app).patch(`/api/bookings/${first.id}/confirm`).set(auth(admin)).expect(200);
    const after = (await request(app).get('/api/admin/bookings').set(auth(admin))).body.items.find((b: any) => b.id === first.id);
    expect(after.status).toBe('accepted');
    expect(after.awaitingHost).toBe(false);
  });
});
