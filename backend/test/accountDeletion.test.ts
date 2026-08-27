import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

// The point of this suite is what happens in OBJECT STORAGE when an account goes, so s3 is a
// mock whose calls we assert on rather than a real bucket.
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
import { eq, inArray } from 'drizzle-orm';
import { deletePrivate } from '../src/lib/s3';
import { onboardActiveProvider, loginAdmin } from './helpers';

const PNG_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

/** Onboards a provider with two KYC documents and returns the storage keys behind them. */
async function providerWithKyc(name: string) {
  const { token, providerId } = await onboardActiveProvider({ name });

  for (const docType of ['aadhaar', 'pan']) {
    const up = await request(app)
      .post('/api/providers/me/kyc')
      .set('Authorization', `Bearer ${token}`)
      .send({ doc_type: docType, file: PNG_DATA_URL, filename: `${docType}.png` });
    expect(up.status).toBe(200);
  }

  // The file key is deliberately never returned by the API — kyc.test.ts asserts that — so the
  // only way to know what should have been deleted is to read it straight out of the table.
  const docs = await db
    .select({ fileKey: schema.kycDocuments.fileKey })
    .from(schema.kycDocuments)
    .where(eq(schema.kycDocuments.providerId, providerId));
  expect(docs).toHaveLength(2);

  // onboardActiveProvider hands back the provider id, not the user id behind it, and the admin
  // delete route is addressed by user.
  const [provider] = await db
    .select({ userId: schema.providers.userId })
    .from(schema.providers)
    .where(eq(schema.providers.id, providerId));

  return { token, providerId, userId: provider.userId, fileKeys: docs.map((d) => d.fileKey) };
}

describe('deleting an account takes the KYC documents with it', () => {
  beforeEach(() => {
    vi.mocked(deletePrivate).mockClear();
  });

  it('removes the uploaded files from storage, not just the rows', async () => {
    const { token, providerId, fileKeys } = await providerWithKyc('Deleting Host');

    const res = await request(app).delete('/api/users/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.deleted).toBe(true);

    // kyc_documents cascades off providers, so the rows going is not the interesting part.
    const rows = await db
      .select()
      .from(schema.kycDocuments)
      .where(eq(schema.kycDocuments.providerId, providerId));
    expect(rows).toHaveLength(0);

    // This is. Nothing cascades into the private bucket, so without an explicit sweep the
    // identity documents outlive the account that uploaded them.
    const deleted = vi.mocked(deletePrivate).mock.calls.map(([key]) => key).sort();
    expect(deleted).toEqual([...fileKeys].sort());
  });

  it('does the same when an admin deletes the account', async () => {
    const { userId, fileKeys } = await providerWithKyc('Admin Deleted Host');

    const adminToken = await loginAdmin();
    const res = await request(app)
      .delete(`/api/admin/users/${userId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const deleted = vi.mocked(deletePrivate).mock.calls.map(([key]) => key).sort();
    expect(deleted).toEqual([...fileKeys].sort());
  });

  it('finishes deleting the account even if storage refuses', async () => {
    // A half-deleted account is worse than an orphaned object: the user asked to be removed and
    // would still be here. So a storage failure is swallowed, and the account still goes.
    const { token, userId } = await providerWithKyc('Unlucky Host');
    vi.mocked(deletePrivate).mockRejectedValueOnce(new Error('bucket unreachable'));

    const res = await request(app).delete('/api/users/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);

    const users = await db.select().from(schema.users).where(eq(schema.users.id, userId));
    expect(users).toHaveLength(0);
  });

  it('deletes an account that never uploaded anything', async () => {
    // No provider rows at all — the lookup must short-circuit rather than query on an empty
    // id list, which is a SQL error in some drivers rather than an empty result.
    const { registerUser } = await import('./helpers');
    const { token, user } = await registerUser({ name: 'Plain Tourist', role: 'tourist' });

    const res = await request(app).delete('/api/users/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(vi.mocked(deletePrivate)).not.toHaveBeenCalled();

    const users = await db.select().from(schema.users).where(inArray(schema.users.id, [user.id]));
    expect(users).toHaveLength(0);
  });
});
