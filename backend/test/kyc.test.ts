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
import { db, schema } from '../src/db';
import { and, eq } from 'drizzle-orm';
import { deletePrivate, uploadPrivate, getPrivateObject } from '../src/lib/s3';
import { onboardActiveProvider, registerUser, loginAdmin } from './helpers';

// 1x1 transparent PNG as a data URL
const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

// A minimal, structurally valid PDF (starts with the "%PDF" signature).
const PDF_DATA_URL =
  'data:application/pdf;base64,' + Buffer.from('%PDF-1.4\n%mock pdf for tests\n').toString('base64');

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
    // ~200 KB payload — well over body-parser's 100kb default, well under the 5 MB MAX_BYTES /
    // 8mb JSON limit. Catches a regression to the global 100kb express.json() default. Must
    // start with a real PNG signature (0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A) so it also
    // clears the magic-byte content-type check — the padding after that is arbitrary.
    const mediumBuffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(200_000, 0x00),
    ]);
    const mediumDataUrl = 'data:image/png;base64,' + mediumBuffer.toString('base64');
    const res = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: mediumDataUrl, filename: 'medium.png' });
    expect(res.status).toBe(200);
  });

  it('two concurrent uploads of the same docType leave exactly one row (unique constraint + atomic upsert)', async () => {
    const { token, providerId } = await onboardActiveProvider({ name: 'Kyc Ten', businessType: 'shop' });
    const upload = (filename: string) =>
      request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
        .send({ doc_type: 'pan', file: PNG_DATA_URL, filename });

    const [r1, r2] = await Promise.all([upload('pan-a.png'), upload('pan-b.png')]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);

    const rows = await db.select().from(schema.kycDocuments)
      .where(and(eq(schema.kycDocuments.providerId, providerId), eq(schema.kycDocuments.docType, 'pan')));
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('pending');
  });

  it('best-effort deletes the just-uploaded object if the DB write fails, so nothing orphans in storage', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Eleven', businessType: 'shop' });
    const deletePrivateMock = deletePrivate as unknown as ReturnType<typeof vi.fn>;
    const callsBefore = deletePrivateMock.mock.calls.length;

    const insertSpy = vi.spyOn(db, 'insert').mockImplementationOnce(() => {
      throw new Error('simulated DB failure');
    });

    const res = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });

    expect(res.status).toBe(500);
    insertSpy.mockRestore();

    // The orphaned object (the one just uploaded, before the failed DB write) must have been
    // best-effort cleaned up.
    expect(deletePrivateMock.mock.calls.length).toBe(callsBefore + 1);
    const [deletedKey] = deletePrivateMock.mock.calls[deletePrivateMock.mock.calls.length - 1];
    expect(deletedKey).toMatch(/\/aadhaar\//);

    // No row should exist for this doc, since the insert never committed.
    const list = await request(app).get('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`);
    expect(list.body.documents.find((d: any) => d.doc_type === 'aadhaar')).toBeUndefined();
  });

  it('answers with 503 (not a bare 500) when storage is unavailable during upload, without leaking internals', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Twelve', businessType: 'shop' });
    const uploadPrivateMock = uploadPrivate as unknown as ReturnType<typeof vi.fn>;
    uploadPrivateMock.mockRejectedValueOnce(new Error('connect ECONNREFUSED 127.0.0.1:9000 - internal-secret-detail'));

    const res = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });

    expect(res.status).toBe(503);
    expect(typeof res.body.detail).toBe('string');
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/ECONNREFUSED/);
    expect(bodyStr).not.toMatch(/internal-secret-detail/);

    // No row should exist for this doc, since the upload never made it to storage.
    const list = await request(app).get('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`);
    expect(list.body.documents.find((d: any) => d.doc_type === 'aadhaar')).toBeUndefined();
  });

  it('answers with 503 (not a bare 500) when storage is unavailable while streaming a file, without leaking internals', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Thirteen', businessType: 'shop' });
    const up = await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });
    const docId = up.body.document.id;

    const getPrivateObjectMock = getPrivateObject as unknown as ReturnType<typeof vi.fn>;
    getPrivateObjectMock.mockRejectedValueOnce(new Error('internal-storage-outage-detail'));

    const res = await request(app)
      .get(`/api/providers/kyc/${docId}/file`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(503);
    const bodyStr = JSON.stringify(res.body);
    expect(bodyStr).not.toMatch(/internal-storage-outage-detail/);
  });

  it('accepts a document whose bytes match the declared PDF type', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Fourteen', businessType: 'shop' });
    const res = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: PDF_DATA_URL, filename: 'aadhaar.pdf' });
    expect(res.status).toBe(200);
    expect(res.body.document.doc_type).toBe('aadhaar');
  });

  it('rejects a payload declaring image/png whose bytes are actually a PDF', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Fifteen', businessType: 'shop' });
    const mismatchedDataUrl = 'data:image/png;base64,' + Buffer.from('%PDF-1.4\nnot a png').toString('base64');
    const res = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: mismatchedDataUrl, filename: 'fake.png' });
    expect(res.status).toBe(400);
  });

  it('rejects a payload declaring image/png whose bytes are random junk', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Sixteen', businessType: 'shop' });
    const junkDataUrl = 'data:image/png;base64,' + Buffer.from('just some random junk bytes, not an image').toString('base64');
    const res = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: junkDataUrl, filename: 'junk.png' });
    expect(res.status).toBe(400);
  });
});
