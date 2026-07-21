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
import { onboardActiveProvider, registerUser, loginAdmin } from './helpers';

// 1x1 transparent PNG as a data URL
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('provider KYC', () => {
  it('provider can upload an allowed doc; it starts pending', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc One', businessType: 'shop' });
    const res = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'aadhaar.png' });
    expect(res.status).toBe(200);
    expect(res.body.document.doc_type).toBe('aadhaar');
    expect(res.body.document.status).toBe('pending');
  });

  it('rejects a doc_type not allowed for the business type', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Two', businessType: 'shop' });
    const res = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'driving_license', file: PNG_DATA_URL, filename: 'dl.png' });
    expect(res.status).toBe(400);
  });

  it('rejects a disallowed mime type', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Three', businessType: 'shop' });
    const res = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: 'data:text/plain;base64,aGVsbG8=', filename: 'x.txt' });
    expect(res.status).toBe(400);
  });

  it('a tourist cannot upload KYC', async () => {
    const { token } = await registerUser({ name: 'Tourist', role: 'tourist' });
    const res = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });
    expect(res.status).toBe(403);
  });

  it('me/profile returns completion percent and checklist', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Four', businessType: 'shop' });
    const res = await request(app)
      .get('/api/providers/me/profile')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.completion_percent).toBe('number');
    expect(Array.isArray(res.body.checklist)).toBe(true);
    expect(res.body.kyc_status).toBe('none');
  });

  it('re-uploading replaces the doc and keeps it pending', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Five', businessType: 'shop' });
    await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'pan', file: PNG_DATA_URL, filename: 'pan.png' });
    await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'pan', file: PNG_DATA_URL, filename: 'pan2.png' });
    const list = await request(app).get('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`);
    const panDocs = list.body.documents.filter((d: any) => d.doc_type === 'pan');
    expect(panDocs.length).toBe(1);
    expect(panDocs[0].status).toBe('pending');
  });

  it('owner can fetch their file; another provider gets 403', async () => {
    const a = await onboardActiveProvider({ name: 'Owner A', businessType: 'shop' });
    const up = await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${a.token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });
    const docId = up.body.document.id;

    const ownerFetch = await request(app).get(`/api/providers/kyc/${docId}/file`).set('Authorization', `Bearer ${a.token}`);
    expect(ownerFetch.status).toBe(200);

    const b = await onboardActiveProvider({ name: 'Other B', businessType: 'shop' });
    const otherFetch = await request(app).get(`/api/providers/kyc/${docId}/file`).set('Authorization', `Bearer ${b.token}`);
    expect(otherFetch.status).toBe(403);
  });

  it('owner can delete a doc', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Six', businessType: 'shop' });
    await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });
    const del = await request(app).delete('/api/providers/me/kyc/aadhaar').set('Authorization', `Bearer ${token}`);
    expect(del.status).toBe(200);
    const list = await request(app).get('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`);
    expect(list.body.documents.find((d: any) => d.doc_type === 'aadhaar')).toBeUndefined();
  });

  it('an admin can fetch another provider\'s KYC file', async () => {
    const a = await onboardActiveProvider({ name: 'Owner C', businessType: 'shop' });
    const up = await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${a.token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });
    const docId = up.body.document.id;

    const adminToken = await loginAdmin();
    const adminFetch = await request(app)
      .get(`/api/providers/kyc/${docId}/file`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminFetch.status).toBe(200);
  });

  it('an unauthenticated request to fetch a KYC file gets 401', async () => {
    const a = await onboardActiveProvider({ name: 'Owner D', businessType: 'shop' });
    const up = await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${a.token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });
    const docId = up.body.document.id;

    const res = await request(app).get(`/api/providers/kyc/${docId}/file`);
    expect(res.status).toBe(401);
  });

  it('never leaks the file key or a storage URL in upload/list responses', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Seven', businessType: 'shop' });
    const up = await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });
    expect(up.status).toBe(200);
    expect(up.body.document).not.toHaveProperty('file_key');
    const upStr = JSON.stringify(up.body);
    expect(upStr).not.toMatch(/one-darjeeling/);
    expect(upStr).not.toMatch(/http/i);

    const list = await request(app).get('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    for (const doc of list.body.documents) {
      expect(doc).not.toHaveProperty('file_key');
    }
    const listStr = JSON.stringify(list.body);
    expect(listStr).not.toMatch(/one-darjeeling/);
    expect(listStr).not.toMatch(/http/i);
  });

  it('rejects a file whose decoded size exceeds the 5 MB limit', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Eight', businessType: 'shop' });
    const oversizeDataUrl = 'data:image/png;base64,' + 'A'.repeat(7_000_000); // ~5.25 MB decoded
    const res = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: oversizeDataUrl, filename: 'big.png' });
    expect(res.status).toBe(400);
  });

  it('accepts an upload just over the old 100 KB body-parser limit (regression guard)', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Nine', businessType: 'shop' });
    // ~200 KB of base64 payload — well over body-parser's 100kb default, well under the 5 MB
    // MAX_BYTES / 8mb JSON limit. Catches a regression to the global 100kb express.json() default.
    const mediumDataUrl = 'data:image/png;base64,' + 'A'.repeat(200_000);
    const res = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: mediumDataUrl, filename: 'medium.png' });
    expect(res.status).toBe(200);
  });
});
