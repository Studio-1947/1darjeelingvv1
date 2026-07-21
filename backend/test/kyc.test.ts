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

const SHOP_REQUIRED_DOC_TYPES = ['aadhaar', 'pan', 'owner_photo', 'trade_license'];

// Uploads and admin-approves every required shop doc for `providerId`, leaving the provider
// verified. Used by the revocation/downgrade tests, which all need to start from "verified".
async function verifyShopProvider(token: string, providerId: string) {
  for (const t of SHOP_REQUIRED_DOC_TYPES) {
    const up = await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
      .send({ doc_type: t, file: PNG_DATA_URL, filename: `${t}.png` });
    if (up.status !== 200) throw new Error(`upload failed for ${t}: ${up.status} ${JSON.stringify(up.body)}`);
  }
  const adminToken = await loginAdmin();
  const list = await request(app).get('/api/admin/kyc?status=pending').set('Authorization', `Bearer ${adminToken}`);
  const mine = list.body.documents.filter((d: any) => d.provider_id === providerId);
  for (const d of mine) {
    const r = await request(app).post(`/api/admin/kyc/${d.id}/review`)
      .set('Authorization', `Bearer ${adminToken}`).send({ decision: 'approve' });
    if (r.status !== 200) throw new Error(`approve failed for ${d.doc_type}: ${r.status} ${JSON.stringify(r.body)}`);
  }
}

// Recursively scans a serialized response for values shaped like a storage object key
// (`<providerId>/<docType>/<uuid>.<ext>`), catching a leak anywhere in the payload — not just
// at a hardcoded top-level property name.
const STORAGE_KEY_SHAPE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[a-zA-Z0-9_]+\/[0-9a-f-]{8,}\.[a-zA-Z0-9]+/i;
function findLeakedKeys(value: unknown, path = '$'): string[] {
  if (typeof value === 'string') {
    return STORAGE_KEY_SHAPE.test(value) ? [`${path}: ${value}`] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((v, i) => findLeakedKeys(v, `${path}[${i}]`));
  }
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([k, v]) => findLeakedKeys(v, `${path}.${k}`));
  }
  return [];
}

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

  it('two concurrent re-uploads of an already-existing doc leave exactly one row and orphan no storage object', async () => {
    // This is the exact scenario the bug was about: a docType that already has a row (and an
    // object in storage, key0) gets re-uploaded by two concurrent requests. Both read key0,
    // both upload their own new object, and only one write wins the row — without the
    // transaction + row lock in kyc.ts, the *loser's* freshly-uploaded object is never
    // referenced by the row and never deleted, leaking forever. A prior version of this test
    // only asserted the row count, which the DB-level unique constraint already guaranteed on
    // its own — it would have stayed green even with the object-leak bug still present.
    const { token, providerId } = await onboardActiveProvider({ name: 'Kyc Ten', businessType: 'shop' });

    const uploadPrivateMock = uploadPrivate as unknown as ReturnType<typeof vi.fn>;
    const deletePrivateMock = deletePrivate as unknown as ReturnType<typeof vi.fn>;
    const uploadCallsBefore = uploadPrivateMock.mock.calls.length;

    // Establish the pre-existing row/object (key0) sequentially first.
    const initial = await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'pan', file: PNG_DATA_URL, filename: 'pan-0.png' });
    expect(initial.status).toBe(200);

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
    const survivingKey = rows[0].fileKey;

    // Every object uploaded during this test (key0 plus both concurrent re-uploads) except
    // whichever one ended up stored on the row must have had deletePrivate called on it —
    // nothing should be orphaned in storage.
    const uploadedKeys = uploadPrivateMock.mock.calls.slice(uploadCallsBefore).map((call: any[]) => call[1] as string);
    expect(uploadedKeys.length).toBe(3);
    expect(uploadedKeys).toContain(survivingKey);
    const deletedKeys = new Set(deletePrivateMock.mock.calls.map((call: any[]) => call[0] as string));
    for (const key of uploadedKeys) {
      if (key === survivingKey) continue;
      expect(deletedKeys.has(key)).toBe(true);
    }
  });

  it('best-effort deletes the just-uploaded object if the DB write fails, so nothing orphans in storage', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Eleven', businessType: 'shop' });
    const deletePrivateMock = deletePrivate as unknown as ReturnType<typeof vi.fn>;
    const callsBefore = deletePrivateMock.mock.calls.length;

    // The existing-row read and the upsert now happen inside db.transaction(...) (see kyc.ts),
    // so simulating "the DB write failed" means failing the transaction itself rather than a
    // bare db.insert call — db.insert is invoked on a per-transaction `tx` object, not on `db`,
    // so spying on db.insert would silently never fire.
    const txSpy = vi.spyOn(db, 'transaction').mockImplementationOnce(() => {
      throw new Error('simulated DB failure');
    });

    const res = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });

    expect(res.status).toBe(500);
    txSpy.mockRestore();

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

  it('accepts a PDF whose "%PDF" header is preceded by a UTF-8 BOM and leading whitespace', async () => {
    // ISO 32000 permits the %PDF header anywhere in the first 1024 bytes, and some real-world
    // scanners/tools emit a UTF-8 BOM (or stray whitespace) before it. A prior offset-0-only
    // check would reject these as "contents do not match the declared file type" even though
    // they are legitimate PDFs.
    const { token } = await onboardActiveProvider({ name: 'Kyc Seventeen', businessType: 'shop' });
    const bomAndWhitespacePrefixedPdf = Buffer.concat([
      Buffer.from([0xef, 0xbb, 0xbf]), // UTF-8 BOM
      Buffer.from('   \n'),
      Buffer.from('%PDF-1.4\n%bom-prefixed mock pdf for tests\n'),
    ]);
    const dataUrl = 'data:application/pdf;base64,' + bomAndWhitespacePrefixedPdf.toString('base64');
    const res = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: dataUrl, filename: 'aadhaar-bom.pdf' });
    expect(res.status).toBe(200);
    expect(res.body.document.doc_type).toBe('aadhaar');
  });

  it('still rejects a declared PDF whose bytes never contain the "%PDF" signature within the first 1024 bytes', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Eighteen', businessType: 'shop' });
    const notActuallyAPdf = Buffer.alloc(2000, 0x41); // 2000 'A' bytes, no %PDF anywhere
    const dataUrl = 'data:application/pdf;base64,' + notActuallyAPdf.toString('base64');
    const res = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: dataUrl, filename: 'not-a-pdf.pdf' });
    expect(res.status).toBe(400);
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

  describe('revocation / downgrade', () => {
    it('provider deleting an approved required doc revokes verified status', async () => {
      const { token, providerId } = await onboardActiveProvider({ name: 'Kyc Revoke Delete', businessType: 'shop' });
      await verifyShopProvider(token, providerId);

      const before = await request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${token}`);
      expect(before.body.kyc_status).toBe('verified');

      const del = await request(app).delete('/api/providers/me/kyc/aadhaar').set('Authorization', `Bearer ${token}`);
      expect(del.status).toBe(200);

      const after = await request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${token}`);
      expect(after.body.kyc_status).not.toBe('verified');
    });

    it('provider re-uploading an approved required doc resets it to pending and revokes verified status', async () => {
      const { token, providerId } = await onboardActiveProvider({ name: 'Kyc Revoke Reupload', businessType: 'shop' });
      await verifyShopProvider(token, providerId);

      const before = await request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${token}`);
      expect(before.body.kyc_status).toBe('verified');

      const reupload = await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
        .send({ doc_type: 'pan', file: PNG_DATA_URL, filename: 'pan-v2.png' });
      expect(reupload.status).toBe(200);
      expect(reupload.body.document.status).toBe('pending');

      const after = await request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${token}`);
      expect(after.body.kyc_status).not.toBe('verified');
    });
  });

  describe('edge states', () => {
    it('a pending_payment provider (onboarded, never paid) gets 404 from GET /me/profile, 404 from GET /me/kyc, and 403 from POST /me/kyc', async () => {
      const { token, phone } = await registerUser({ name: 'Pending Payment Provider', role: 'provider' });
      const onboardRes = await request(app)
        .post('/api/providers/onboard')
        .set('Authorization', `Bearer ${token}`)
        .send({
          business_name: "Pending Payment Provider's Business",
          business_type: 'shop',
          description: 'A shop awaiting payment',
          location: 'Darjeeling',
          contact_phone: phone,
        });
      expect(onboardRes.status).toBe(200);
      expect(onboardRes.body.provider.status).toBe('pending_payment');

      const profile = await request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${token}`);
      expect(profile.status).toBe(404);

      const list = await request(app).get('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`);
      expect(list.status).toBe(404);

      const upload = await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
        .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });
      expect(upload.status).toBe(403);
    });

    it('a plain tourist with no provider row at all gets 404 from GET /me/profile', async () => {
      const { token } = await registerUser({ name: 'Tourist No Provider Row', role: 'tourist' });
      const res = await request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it('deleting a docType the provider never uploaded is a no-op: 200, no deletePrivate call, other docs unaffected', async () => {
      const { token } = await onboardActiveProvider({ name: 'Kyc Never Uploaded', businessType: 'shop' });
      await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
        .send({ doc_type: 'pan', file: PNG_DATA_URL, filename: 'pan.png' });

      const deletePrivateMock = deletePrivate as unknown as ReturnType<typeof vi.fn>;
      const callsBefore = deletePrivateMock.mock.calls.length;

      const del = await request(app).delete('/api/providers/me/kyc/aadhaar').set('Authorization', `Bearer ${token}`);
      expect(del.status).toBe(200);
      expect(del.body.ok).toBe(true);
      expect(deletePrivateMock.mock.calls.length).toBe(callsBefore);

      const list = await request(app).get('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`);
      const panDocs = list.body.documents.filter((d: any) => d.doc_type === 'pan');
      expect(panDocs.length).toBe(1);
      expect(list.body.documents.find((d: any) => d.doc_type === 'aadhaar')).toBeUndefined();
    });
  });

  describe('deletePrivate assertion strength', () => {
    it('re-uploading an existing doc calls deletePrivate with the OLD fileKey, not the new one', async () => {
      const { token, providerId } = await onboardActiveProvider({ name: 'Kyc Old Key', businessType: 'shop' });
      await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
        .send({ doc_type: 'pan', file: PNG_DATA_URL, filename: 'pan-v1.png' });

      const [rowBefore] = await db.select().from(schema.kycDocuments)
        .where(and(eq(schema.kycDocuments.providerId, providerId), eq(schema.kycDocuments.docType, 'pan')));
      const oldKey = rowBefore.fileKey;

      const deletePrivateMock = deletePrivate as unknown as ReturnType<typeof vi.fn>;
      const callsBefore = deletePrivateMock.mock.calls.length;

      const reupload = await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
        .send({ doc_type: 'pan', file: PNG_DATA_URL, filename: 'pan-v2.png' });
      expect(reupload.status).toBe(200);

      const [rowAfter] = await db.select().from(schema.kycDocuments)
        .where(and(eq(schema.kycDocuments.providerId, providerId), eq(schema.kycDocuments.docType, 'pan')));
      const newKey = rowAfter.fileKey;
      expect(newKey).not.toBe(oldKey);

      expect(deletePrivateMock.mock.calls.length).toBe(callsBefore + 1);
      const [deletedKey] = deletePrivateMock.mock.calls[deletePrivateMock.mock.calls.length - 1];
      expect(deletedKey).toBe(oldKey);
      expect(deletedKey).not.toBe(newKey);
    });

    it('deleting a doc calls deletePrivate with that document\'s exact fileKey', async () => {
      const { token, providerId } = await onboardActiveProvider({ name: 'Kyc Delete Key', businessType: 'shop' });
      await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
        .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });

      const [row] = await db.select().from(schema.kycDocuments)
        .where(and(eq(schema.kycDocuments.providerId, providerId), eq(schema.kycDocuments.docType, 'aadhaar')));
      const key = row.fileKey;

      const deletePrivateMock = deletePrivate as unknown as ReturnType<typeof vi.fn>;
      const callsBefore = deletePrivateMock.mock.calls.length;

      const del = await request(app).delete('/api/providers/me/kyc/aadhaar').set('Authorization', `Bearer ${token}`);
      expect(del.status).toBe(200);

      expect(deletePrivateMock.mock.calls.length).toBe(callsBefore + 1);
      const [deletedKey] = deletePrivateMock.mock.calls[deletePrivateMock.mock.calls.length - 1];
      expect(deletedKey).toBe(key);
    });
  });

  it('recursively scans upload, list, and profile responses for storage-key-shaped strings (not just file_key/bucket/http)', async () => {
    const { token } = await onboardActiveProvider({ name: 'Kyc Key Scan', businessType: 'shop' });

    const up = await request(app).post('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`)
      .send({ doc_type: 'aadhaar', file: PNG_DATA_URL, filename: 'a.png' });
    expect(up.status).toBe(200);
    expect(findLeakedKeys(up.body)).toEqual([]);

    const list = await request(app).get('/api/providers/me/kyc').set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(findLeakedKeys(list.body)).toEqual([]);

    const profile = await request(app).get('/api/providers/me/profile').set('Authorization', `Bearer ${token}`);
    expect(profile.status).toBe(200);
    expect(Array.isArray(profile.body.documents)).toBe(true);
    expect(profile.body.documents.length).toBeGreaterThan(0);
    expect(findLeakedKeys(profile.body)).toEqual([]);
  });
});
