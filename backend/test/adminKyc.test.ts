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

// Uploads and admin-approves every required shop doc, leaving the provider verified. Returns a
// map of docType -> document id so a test can act on a specific document afterwards (e.g. to
// exercise a revocation path).
async function verifyShopProvider(token: string, providerId: string, adminToken: string): Promise<Record<string, string>> {
  await uploadAllShopDocs(token);
  const list = await request(app).get('/api/admin/kyc?status=pending').set('Authorization', `Bearer ${adminToken}`);
  const mine = list.body.documents.filter((d: any) => d.provider_id === providerId);
  const docIds: Record<string, string> = {};
  for (const d of mine) {
    docIds[d.doc_type] = d.id;
    const r = await request(app).post(`/api/admin/kyc/${d.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`).send({ decision: 'approve' });
    if (r.status !== 200) throw new Error(`approve failed for ${d.doc_type}: ${r.status} ${JSON.stringify(r.body)}`);
  }
  return docIds;
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

  describe('revocation / downgrade', () => {
    it('admin rejecting a previously-approved required doc revokes verified status', async () => {
      const prov = await onboardActiveProvider({ name: 'Prov Revoke A', businessType: 'shop' });
      const admin = await loginAdmin();
      const docIds = await verifyShopProvider(prov.token, prov.providerId, admin);

      const before = await request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${prov.token}`);
      expect(before.body.kyc_status).toBe('verified');

      const reject = await request(app).post(`/api/admin/kyc/${docIds['aadhaar']}/review`)
        .set('Authorization', `Bearer ${admin}`).send({ decision: 'reject', reason: 'Illegible scan' });
      expect(reject.status).toBe(200);
      expect(reject.body.provider_kyc_status).not.toBe('verified');

      const after = await request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${prov.token}`);
      expect(after.body.kyc_status).not.toBe('verified');
    });

    it('re-reviewing an already-decided doc tracks kycStatus correctly in both directions (approve -> reject -> approve)', async () => {
      const prov = await onboardActiveProvider({ name: 'Prov Reverse Review', businessType: 'shop' });
      const admin = await loginAdmin();
      const docIds = await verifyShopProvider(prov.token, prov.providerId, admin);

      let profile = await request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${prov.token}`);
      expect(profile.body.kyc_status).toBe('verified');

      // approved -> rejected: the doc is still present (just no longer approved), so every
      // required type still has an entry -> 'submitted', not 'partial' or 'none'.
      const reject = await request(app).post(`/api/admin/kyc/${docIds['pan']}/review`)
        .set('Authorization', `Bearer ${admin}`).send({ decision: 'reject', reason: 'Needs a clearer copy' });
      expect(reject.status).toBe(200);
      expect(reject.body.document.status).toBe('rejected');
      expect(reject.body.provider_kyc_status).toBe('submitted');

      profile = await request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${prov.token}`);
      expect(profile.body.kyc_status).toBe('submitted');

      // rejected -> approved again: back to verified.
      const approve = await request(app).post(`/api/admin/kyc/${docIds['pan']}/review`)
        .set('Authorization', `Bearer ${admin}`).send({ decision: 'approve' });
      expect(approve.status).toBe(200);
      expect(approve.body.document.status).toBe('approved');
      expect(approve.body.provider_kyc_status).toBe('verified');

      profile = await request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${prov.token}`);
      expect(profile.body.kyc_status).toBe('verified');
    });

    it('rejecting an optional doc does not block verified status when all required docs are approved', async () => {
      const prov = await onboardActiveProvider({ name: 'Prov Optional Reject', businessType: 'shop' });
      const admin = await loginAdmin();
      await uploadAllShopDocs(prov.token);
      await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${prov.token}`)
        .send({ doc_type: 'gst_certificate', file: PNG_DATA_URL, filename: 'gst.png' });

      const list = await request(app).get('/api/admin/kyc?status=pending').set('Authorization', `Bearer ${admin}`);
      const mine = list.body.documents.filter((d: any) => d.provider_id === prov.providerId);
      expect(mine.length).toBe(5); // 4 required shop docs + the optional gst_certificate

      for (const d of mine) {
        const decision = d.doc_type === 'gst_certificate' ? 'reject' : 'approve';
        const r = await request(app).post(`/api/admin/kyc/${d.id}/review`)
          .set('Authorization', `Bearer ${admin}`)
          .send(decision === 'reject' ? { decision, reason: 'Not required' } : { decision });
        expect(r.status).toBe(200);
      }

      const profile = await request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${prov.token}`);
      expect(profile.body.kyc_status).toBe('verified');
      const gstItem = profile.body.checklist.find((c: any) => c.key === 'gst_certificate');
      expect(gstItem?.state).toBe('rejected');
    });

    it('reviewing an unknown document id returns 404', async () => {
      const admin = await loginAdmin();
      const res = await request(app)
        .post('/api/admin/kyc/00000000-0000-0000-0000-000000000000/review')
        .set('Authorization', `Bearer ${admin}`)
        .send({ decision: 'approve' });
      expect(res.status).toBe(404);
    });

    it('reviewing with an invalid decision value returns 400', async () => {
      const prov = await onboardActiveProvider({ name: 'Prov Bad Decision', businessType: 'shop' });
      await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${prov.token}`)
        .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });
      const admin = await loginAdmin();
      const list = await request(app).get('/api/admin/kyc?status=pending').set('Authorization', `Bearer ${admin}`);
      const doc = list.body.documents.find((d: any) => d.provider_id === prov.providerId);
      const res = await request(app).post(`/api/admin/kyc/${doc.id}/review`)
        .set('Authorization', `Bearer ${admin}`).send({ decision: 'maybe' });
      expect(res.status).toBe(400);
    });
  });

  describe('pagination', () => {
    it('defaults to a bounded page and reports total/limit/offset', async () => {
      const prov = await onboardActiveProvider({ name: 'Prov Page A', businessType: 'shop' });
      await uploadAllShopDocs(prov.token);
      const admin = await loginAdmin();
      const res = await request(app).get('/api/admin/kyc').set('Authorization', `Bearer ${admin}`);
      expect(res.status).toBe(200);
      expect(typeof res.body.total).toBe('number');
      expect(res.body.limit).toBe(50);
      expect(res.body.offset).toBe(0);
      expect(res.body.documents.length).toBeLessThanOrEqual(res.body.limit);
      expect(res.body.total).toBeGreaterThanOrEqual(4);
    });

    it('limit and offset page through results without overlap, and status is filtered server-side', async () => {
      const prov = await onboardActiveProvider({ name: 'Prov Page B', businessType: 'shop' });
      await uploadAllShopDocs(prov.token);
      const admin = await loginAdmin();

      const all = await request(app)
        .get('/api/admin/kyc')
        .query({ status: 'pending', limit: 100 })
        .set('Authorization', `Bearer ${admin}`);
      const mine = all.body.documents.filter((d: any) => d.provider_id === prov.providerId);
      expect(mine.length).toBe(4);

      const page1 = await request(app)
        .get('/api/admin/kyc')
        .query({ status: 'pending', limit: 2, offset: 0 })
        .set('Authorization', `Bearer ${admin}`);
      const page2 = await request(app)
        .get('/api/admin/kyc')
        .query({ status: 'pending', limit: 2, offset: 2 })
        .set('Authorization', `Bearer ${admin}`);

      expect(page1.body.documents.length).toBe(2);
      expect(page2.body.documents.length).toBe(2);
      expect(page1.body.documents.every((d: any) => d.status === 'pending')).toBe(true);
      const page1Ids = page1.body.documents.map((d: any) => d.id);
      const page2Ids = page2.body.documents.map((d: any) => d.id);
      expect(page1Ids.some((id: string) => page2Ids.includes(id))).toBe(false);
    });

    it('caps an oversized limit at the server maximum instead of honouring it', async () => {
      const admin = await loginAdmin();
      const res = await request(app)
        .get('/api/admin/kyc')
        .query({ limit: 999999 })
        .set('Authorization', `Bearer ${admin}`);
      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(200);
    });

    it('falls back to the default limit for a non-positive or non-numeric limit', async () => {
      const admin = await loginAdmin();
      const res = await request(app)
        .get('/api/admin/kyc')
        .query({ limit: 'not-a-number' })
        .set('Authorization', `Bearer ${admin}`);
      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(50);
    });
  });
});
