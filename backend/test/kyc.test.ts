import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('../src/lib/s3', () => ({
  uploadPrivate: vi.fn(async (_buffer: Buffer, key: string) => key),
  getPrivateObject: vi.fn(async () => {
    const { Readable } = await import('stream');
    return { stream: Readable.from([Buffer.from('test-file-bytes')]), contentType: 'image/png' };
  }),
}));

import { app } from '../src/app';
import { onboardActiveProvider, registerUser } from './helpers';

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
});
