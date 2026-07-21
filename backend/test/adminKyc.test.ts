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
import { onboardActiveProvider, loginAdmin } from './helpers';

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

async function uploadAllShopDocs(token: string) {
  for (const t of ['aadhaar', 'pan', 'owner_photo', 'trade_license']) {
    await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
      .send({ doc_type: t, file: PNG_DATA_URL, filename: `${t}.png` });
  }
}

describe('admin KYC review', () => {
  it('lists pending documents', async () => {
    const { token } = await onboardActiveProvider({ name: 'Prov P', businessType: 'shop' });
    await uploadAllShopDocs(token);
    const admin = await loginAdmin();
    const res = await request(app).get('/api/admin/kyc?status=pending').set('Authorization', `Bearer ${admin}`);
    expect(res.status).toBe(200);
    expect(res.body.documents.length).toBeGreaterThanOrEqual(4);
  });

  it('non-admin cannot list KYC', async () => {
    const { token } = await onboardActiveProvider({ name: 'Prov Q', businessType: 'shop' });
    const res = await request(app).get('/api/admin/kyc').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });

  it('approving all required docs makes the provider verified', async () => {
    const prov = await onboardActiveProvider({ name: 'Prov R', businessType: 'shop' });
    await uploadAllShopDocs(prov.token);
    const admin = await loginAdmin();

    const list = await request(app).get('/api/admin/kyc?status=pending').set('Authorization', `Bearer ${admin}`);
    const mine = list.body.documents.filter((d: any) => d.provider_id === prov.providerId);
    for (const d of mine) {
      const r = await request(app).post(`/api/admin/kyc/${d.id}/review`)
        .set('Authorization', `Bearer ${admin}`).send({ decision: 'approve' });
      expect(r.status).toBe(200);
    }
    const profile = await request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${prov.token}`);
    expect(profile.body.kyc_status).toBe('verified');
    expect(profile.body.completion_percent).toBeGreaterThanOrEqual(60);
  });

  it('rejecting a doc records the reason', async () => {
    const prov = await onboardActiveProvider({ name: 'Prov S', businessType: 'shop' });
    await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${prov.token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });
    const admin = await loginAdmin();
    const list = await request(app).get('/api/admin/kyc?status=pending').set('Authorization', `Bearer ${admin}`);
    const doc = list.body.documents.find((d: any) => d.provider_id === prov.providerId);
    const r = await request(app).post(`/api/admin/kyc/${doc.id}/review`)
      .set('Authorization', `Bearer ${admin}`).send({ decision: 'reject', reason: 'Blurry scan' });
    expect(r.status).toBe(200);
    expect(r.body.document.status).toBe('rejected');
    expect(r.body.document.rejection_reason).toBe('Blurry scan');
  });

  it('rejects a non-string reason on review', async () => {
    const prov = await onboardActiveProvider({ name: 'Prov U', businessType: 'shop' });
    await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${prov.token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });
    const admin = await loginAdmin();
    const list = await request(app).get('/api/admin/kyc?status=pending').set('Authorization', `Bearer ${admin}`);
    const doc = list.body.documents.find((d: any) => d.provider_id === prov.providerId);
    const res = await request(app).post(`/api/admin/kyc/${doc.id}/review`)
      .set('Authorization', `Bearer ${admin}`).send({ decision: 'reject', reason: { not: 'a string' } });
    expect(res.status).toBe(400);
  });

  it('rejects a reason over 500 characters', async () => {
    const prov = await onboardActiveProvider({ name: 'Prov V', businessType: 'shop' });
    await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${prov.token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });
    const admin = await loginAdmin();
    const list = await request(app).get('/api/admin/kyc?status=pending').set('Authorization', `Bearer ${admin}`);
    const doc = list.body.documents.find((d: any) => d.provider_id === prov.providerId);
    const res = await request(app).post(`/api/admin/kyc/${doc.id}/review`)
      .set('Authorization', `Bearer ${admin}`).send({ decision: 'reject', reason: 'x'.repeat(501) });
    expect(res.status).toBe(400);
  });

  it('allows approve without a reason (reason stays optional)', async () => {
    const prov = await onboardActiveProvider({ name: 'Prov W', businessType: 'shop' });
    await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${prov.token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });
    const admin = await loginAdmin();
    const list = await request(app).get('/api/admin/kyc?status=pending').set('Authorization', `Bearer ${admin}`);
    const doc = list.body.documents.find((d: any) => d.provider_id === prov.providerId);
    const res = await request(app).post(`/api/admin/kyc/${doc.id}/review`)
      .set('Authorization', `Bearer ${admin}`).send({ decision: 'approve' });
    expect(res.status).toBe(200);
  });

  it('non-admin cannot review KYC documents', async () => {
    const prov = await onboardActiveProvider({ name: 'Prov T', businessType: 'shop' });
    await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${prov.token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });
    const admin = await loginAdmin();
    const list = await request(app).get('/api/admin/kyc?status=pending').set('Authorization', `Bearer ${admin}`);
    const doc = list.body.documents.find((d: any) => d.provider_id === prov.providerId);
    const res = await request(app).post(`/api/admin/kyc/${doc.id}/review`)
      .set('Authorization', `Bearer ${prov.token}`).send({ decision: 'approve' });
    expect(res.status).toBe(403);
  });
});
