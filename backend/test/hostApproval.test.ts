import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';

vi.mock('../src/lib/s3', () => ({
  uploadPrivate: vi.fn(async (_buffer: Buffer, key: string) => key),
  getPrivateObject: vi.fn(async () => {
    const { Readable } = await import('stream');
    return { stream: Readable.from([Buffer.from('test-file-bytes')]), contentType: 'image/png' };
  }),
  deletePrivate: vi.fn(async () => {}),
}));

import { app } from '../src/app';
import { db, schema } from '../src/db';
import { isHostApprovalPending } from '../src/lib/hostPlan';
import { loginAdmin, onboardActiveProvider, registerUser } from './helpers';

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function listingOf(providerId: string) {
  const [row] = await db.select().from(schema.listings).where(eq(schema.listings.providerId, providerId)).limit(1);
  return row;
}

async function providerMe(token: string) {
  const res = await request(app).get('/api/providers/me').set('Authorization', `Bearer ${token}`);
  return res.body.provider;
}

/** Uploads every document this host's business type requires, then has the admin approve each. */
async function verify(token: string, providerId: string, admin: string): Promise<string[]> {
  const profile = await request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${token}`);
  const required = profile.body.checklist.filter((c: any) => c.kind === 'kyc' && c.required);
  for (const item of required) {
    await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
      .send({ doc_type: item.key, file: PNG_DATA_URL, filename: `${item.key}.png` });
  }
  const list = await request(app).get('/api/admin/kyc?status=pending').set('Authorization', `Bearer ${admin}`);
  const mine = list.body.documents.filter((d: any) => d.provider_id === providerId);
  const ids: string[] = [];
  for (const d of mine) {
    ids.push(d.id);
    const r = await request(app).post(`/api/admin/kyc/${d.id}/review`)
      .set('Authorization', `Bearer ${admin}`).send({ decision: 'approve' });
    expect(r.status).toBe(200);
  }
  return ids;
}

async function bookAs(listingId: string, listingType = 'homestay') {
  const guest = await registerUser({ name: 'Guest' });
  return request(app).post('/api/bookings').set('Authorization', `Bearer ${guest.token}`)
    .send({ listing_id: listingId, listing_type: listingType, check_in: '2027-03-01', check_out: '2027-03-03' });
}

describe('isHostApprovalPending', () => {
  it('holds back only hosts under the approval rule who are not yet verified', () => {
    expect(isHostApprovalPending({ approvalRequired: true, kycStatus: 'none' })).toBe(true);
    expect(isHostApprovalPending({ approvalRequired: true, kycStatus: 'submitted' })).toBe(true);
    expect(isHostApprovalPending({ approvalRequired: true, kycStatus: 'verified' })).toBe(false);
    expect(isHostApprovalPending({ approvalRequired: false, kycStatus: 'none' })).toBe(false);
  });
});

describe('contact-only listings', () => {
  it('refuses a booking on a shop, judged by the listing itself rather than the type claimed', async () => {
    const { providerId } = await onboardActiveProvider({ name: 'Shop Host', businessType: 'shop' });
    const listing = await listingOf(providerId);

    expect((await bookAs(listing.id, 'shop')).status).toBe(400);
    // Claiming it is a homestay does not get past the check.
    expect((await bookAs(listing.id, 'homestay')).status).toBe(400);
  });
});

describe('admin approval gate for new hosts', () => {
  it('keeps a newly registered host out of the feed, the detail page and bookings until verified', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Fresh Stay', awaitingApproval: true });
    const listing = await listingOf(providerId);

    const me = await providerMe(token);
    expect(me.status).toBe('active');
    expect(me.kyc_status).toBe('none');
    expect(me.approval_pending).toBe(true);

    const feed = await request(app).get('/api/listings').query({ type: 'homestay' });
    expect(feed.body.items.some((i: any) => i.id === listing.id)).toBe(false);

    expect((await request(app).get(`/api/listings/${listing.id}`)).status).toBe(404);
    expect((await bookAs(listing.id)).status).toBe(409);
  });

  it('goes live the moment an admin verifies the last required document', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Approved Stay', awaitingApproval: true });
    const listing = await listingOf(providerId);
    const admin = await loginAdmin();

    await verify(token, providerId, admin);

    const me = await providerMe(token);
    expect(me.kyc_status).toBe('verified');
    expect(me.approval_pending).toBe(false);

    const feed = await request(app).get('/api/listings').query({ type: 'homestay' });
    const item = feed.body.items.find((i: any) => i.id === listing.id);
    expect(item?.provider_verified).toBe(true);
    expect((await request(app).get(`/api/listings/${listing.id}`)).status).toBe(200);
    expect((await bookAs(listing.id)).status).toBe(200);
  });

  it('pulls the host back out when an admin rejects an approved document', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Revoked Stay', awaitingApproval: true });
    const listing = await listingOf(providerId);
    const admin = await loginAdmin();

    const [firstDoc] = await verify(token, providerId, admin);
    expect((await request(app).get(`/api/listings/${listing.id}`)).status).toBe(200);

    await request(app).post(`/api/admin/kyc/${firstDoc}/review`)
      .set('Authorization', `Bearer ${admin}`).send({ decision: 'reject', reason: 'blurry' });

    expect((await request(app).get(`/api/listings/${listing.id}`)).status).toBe(404);
    expect((await providerMe(token)).approval_pending).toBe(true);
  });

  it('leaves a host who was already live untouched, with no KYC at all', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Old Stay' });
    const listing = await listingOf(providerId);

    expect((await providerMe(token)).approval_pending).toBe(false);
    expect((await request(app).get(`/api/listings/${listing.id}`)).status).toBe(200);
    expect((await bookAs(listing.id)).status).toBe(200);
  });

  it('puts an unpaid draft that predates the rule under it when it resumes onboarding', async () => {
    const { token } = await registerUser({ name: 'Draft Host', role: 'provider' });
    const body = {
      business_name: 'Draft', business_type: 'shop', description: 'd', location: 'Darjeeling', contact_phone: '+919000099999',
    };
    const first = await request(app).post('/api/providers/onboard').set('Authorization', `Bearer ${token}`).send(body);
    const id = first.body.provider.id as string;
    await db.update(schema.providers).set({ approvalRequired: false }).where(eq(schema.providers.id, id));

    await request(app).post('/api/providers/onboard').set('Authorization', `Bearer ${token}`).send(body);

    const [row] = await db.select().from(schema.providers).where(eq(schema.providers.id, id));
    expect(row.approvalRequired).toBe(true);
  });
});
