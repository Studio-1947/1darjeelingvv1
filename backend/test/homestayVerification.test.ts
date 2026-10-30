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
import { loginAdmin, onboardActiveProvider } from './helpers';

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
const MP4 = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypmp42'), Buffer.alloc(32)]);
const IN_DARJEELING = 'https://www.google.com/maps/place/Stay/@27.036,88.2627,17z/data=!3d27.036!4d88.2627';

const profile = (token: string) =>
  request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${token}`).then((r) => r.body);

async function uploadAll(token: string) {
  const p = await profile(token);
  for (const item of p.checklist.filter((c: any) => c.kind === 'kyc' && c.required)) {
    if (item.media === 'video') {
      const res = await request(app).post(`/api/providers/me/kyc/video?doc_type=${item.key}`)
        .set('Authorization', `Bearer ${token}`).set('Content-Type', 'video/mp4').send(MP4);
      expect(res.status).toBe(200);
    } else {
      const res = await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
        .send({ doc_type: item.key, file: PNG_DATA_URL, filename: `${item.key}.png` });
      expect(res.status).toBe(200);
    }
  }
}

async function approveAll(admin: string, providerId: string) {
  const list = await request(app).get('/api/admin/kyc?status=pending').set('Authorization', `Bearer ${admin}`);
  for (const d of list.body.documents.filter((x: any) => x.provider_id === providerId)) {
    const r = await request(app).post(`/api/admin/kyc/${d.id}/review`)
      .set('Authorization', `Bearer ${admin}`).send({ decision: 'approve' });
    expect(r.status).toBe(200);
  }
}

async function firstListingId(token: string) {
  const res = await request(app).get('/api/bookings/provider').set('Authorization', `Bearer ${token}`);
  return res.body.listings[0].id as string;
}

describe('homestay verification checklist', () => {
  it('asks for the certificate, a selfie at the property, photos, a video and a Google Maps pin', async () => {
    const { token } = await onboardActiveProvider({ name: 'Check Stay', awaitingApproval: true });
    const p = await profile(token);
    const keys = p.checklist.map((c: any) => c.key);
    for (const k of ['tourism_registration', 'owner_photo', 'property_photo_front', 'property_photo_room', 'property_video', 'location']) {
      expect(keys).toContain(k);
    }
    expect(p.checklist.find((c: any) => c.key === 'property_video').media).toBe('video');
    expect(p.checklist.find((c: any) => c.key === 'owner_photo').label).toMatch(/property/i);
    expect(p.checklist.find((c: any) => c.key === 'location').label).toMatch(/Google Maps/);
  });
});

describe('a homestay is verified only with its documents AND a confirmed pin', () => {
  it('stays partial with every document approved but no Google Maps pin, then verifies once it has one', async () => {
    const admin = await loginAdmin();
    const { token, providerId } = await onboardActiveProvider({ name: 'Pin Stay', awaitingApproval: true });
    await uploadAll(token);
    await approveAll(admin, providerId);

    const before = await profile(token);
    expect(before.kyc_status).toBe('partial');
    expect(before.checklist.find((c: any) => c.key === 'location').state).toBe('missing');

    const verified = await request(app).post('/api/providers/me/location/verify')
      .set('Authorization', `Bearer ${token}`).send({ maps_url: IN_DARJEELING });
    expect(verified.status).toBe(200);

    const after = await profile(token);
    expect(after.kyc_status).toBe('verified');
    expect(after.checklist.find((c: any) => c.key === 'location').state).toBe('done');
  });

  it('also counts a pin verified on the listing itself', async () => {
    const admin = await loginAdmin();
    const { token, providerId } = await onboardActiveProvider({ name: 'Listing Pin Stay', awaitingApproval: true });
    await uploadAll(token);
    await approveAll(admin, providerId);
    expect((await profile(token)).kyc_status).toBe('partial');

    const res = await request(app).post(`/api/listings/${await firstListingId(token)}/location/verify`)
      .set('Authorization', `Bearer ${token}`).send({ maps_url: IN_DARJEELING });
    expect(res.status).toBe(200);
    expect((await profile(token)).kyc_status).toBe('verified');
  });

  it('falls back to partial when the verified pin is moved by hand', async () => {
    const admin = await loginAdmin();
    const { token, providerId } = await onboardActiveProvider({ name: 'Moved Pin Stay', awaitingApproval: true });
    await uploadAll(token);
    await approveAll(admin, providerId);
    await request(app).post('/api/providers/me/location/verify')
      .set('Authorization', `Bearer ${token}`).send({ maps_url: IN_DARJEELING });
    expect((await profile(token)).kyc_status).toBe('verified');

    // Moving the provider's pin voids its verification, and so does moving the listing's own.
    const listingId = await firstListingId(token);
    await request(app).patch('/api/providers/me').set('Authorization', `Bearer ${token}`).send({ latitude: 27.1, longitude: 88.3 });
    await request(app).patch(`/api/listings/${listingId}`).set('Authorization', `Bearer ${token}`).send({ latitude: 27.1, longitude: 88.3 });
    expect((await profile(token)).kyc_status).toBe('partial');
  });

  it('does not let a pasted Google Maps link stand in for a cafe live capture', async () => {
    const admin = await loginAdmin();
    const { token, providerId } = await onboardActiveProvider({ name: 'Link Cafe', businessType: 'cafe', awaitingApproval: true });
    await uploadAll(token);
    await approveAll(admin, providerId);
    await request(app).post('/api/providers/me/location/verify')
      .set('Authorization', `Bearer ${token}`).send({ maps_url: IN_DARJEELING });
    expect((await profile(token)).kyc_status).toBe('partial');
  });
});
