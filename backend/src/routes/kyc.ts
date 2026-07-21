import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import { db, schema } from '../db';
import { eq, and } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { isAllowedDocType } from '../lib/kycRequirements';
import { computeCompletion } from '../lib/profileCompletion';
import { uploadPrivate, getPrivateObject, deletePrivate } from '../lib/s3';
import { log } from '../config';

const router = Router();

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const MAX_BYTES = 5 * 1024 * 1024;
// The 8mb JSON body limit for this path is applied in app.ts (mounted before the global
// express.json(), which would otherwise consume the stream at its 100kb default).

async function ownActiveProvider(userId: string) {
  const rows = await db.select().from(schema.providers).where(eq(schema.providers.userId, userId));
  return rows.find(p => p.status === 'active') || null;
}

function docOut(d: typeof schema.kycDocuments.$inferSelect) {
  return {
    id: d.id,
    doc_type: d.docType,
    status: d.status,
    rejection_reason: d.rejectionReason,
    uploaded_at: d.uploadedAt,
    reviewed_at: d.reviewedAt,
  };
}

/** Recompute and persist providers.kycStatus from current docs. Returns the new status. */
export async function recomputeKycStatus(providerId: string): Promise<string> {
  const [provider] = await db.select().from(schema.providers).where(eq(schema.providers.id, providerId)).limit(1);
  if (!provider) return 'none';
  const docs = await db.select().from(schema.kycDocuments).where(eq(schema.kycDocuments.providerId, providerId));
  const { kycStatus } = computeCompletion(
    {
      businessType: provider.businessType,
      description: provider.description,
      images: provider.images,
      priceFrom: provider.priceFrom,
      latitude: provider.latitude,
      longitude: provider.longitude,
    },
    docs.map(d => ({ docType: d.docType, status: d.status as any }))
  );
  await db.update(schema.providers).set({ kycStatus }).where(eq(schema.providers.id, providerId));
  return kycStatus;
}

// GET /providers/me/profile — profile + completion + checklist + kycStatus
router.get('/me/profile', authenticateToken, async (req: Request, res: Response) => {
  const provider = await ownActiveProvider(req.user.id);
  if (!provider) return res.status(404).json({ detail: 'No active provider profile' });
  const docs = await db.select().from(schema.kycDocuments).where(eq(schema.kycDocuments.providerId, provider.id));
  const { completionPercent, checklist, kycStatus } = computeCompletion(
    {
      businessType: provider.businessType,
      description: provider.description,
      images: provider.images,
      priceFrom: provider.priceFrom,
      latitude: provider.latitude,
      longitude: provider.longitude,
    },
    docs.map(d => ({ docType: d.docType, status: d.status as any }))
  );
  res.json({
    provider_id: provider.id,
    business_type: provider.businessType,
    completion_percent: completionPercent,
    kyc_status: kycStatus,
    checklist,
    documents: docs.map(docOut),
  });
});

// GET /providers/me/kyc — list own docs
router.get('/me/kyc', authenticateToken, async (req: Request, res: Response) => {
  const provider = await ownActiveProvider(req.user.id);
  if (!provider) return res.status(404).json({ detail: 'No active provider profile' });
  const docs = await db.select().from(schema.kycDocuments).where(eq(schema.kycDocuments.providerId, provider.id));
  res.json({ documents: docs.map(docOut) });
});

// POST /providers/me/kyc — upload/replace a doc
router.post('/me/kyc', authenticateToken, async (req: Request, res: Response) => {
  const provider = await ownActiveProvider(req.user.id);
  if (!provider) return res.status(403).json({ detail: 'Only active providers can upload KYC documents' });

  const { doc_type, file, filename } = req.body || {};
  if (!doc_type || !file || !filename) {
    return res.status(400).json({ detail: 'doc_type, file, and filename are required' });
  }
  if (!isAllowedDocType(provider.businessType, doc_type)) {
    return res.status(400).json({ detail: `doc_type "${doc_type}" is not valid for a ${provider.businessType}` });
  }

  const match = String(file).match(/^data:([\w/+.-]+);base64,/);
  const contentType = match ? match[1] : '';
  if (!ALLOWED_MIME.has(contentType)) {
    return res.status(400).json({ detail: 'File must be a JPEG, PNG, or PDF' });
  }
  const base64Data = String(file).replace(/^data:[\w/+.-]+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  if (buffer.length === 0) return res.status(400).json({ detail: 'Empty file' });
  if (buffer.length > MAX_BYTES) return res.status(400).json({ detail: 'File exceeds 5 MB limit' });

  const ext = path.extname(filename) || (contentType === 'application/pdf' ? '.pdf' : '.jpg');
  const key = `${provider.id}/${doc_type}/${uuidv4()}${ext}`;

  // Capture the existing row's fileKey (if any) BEFORE uploading, so we know what to clean up
  // in storage afterwards regardless of which way this request goes.
  const [existing] = await db.select().from(schema.kycDocuments)
    .where(and(eq(schema.kycDocuments.providerId, provider.id), eq(schema.kycDocuments.docType, doc_type)));
  const oldFileKey = existing?.fileKey;

  await uploadPrivate(buffer, key, contentType);

  const uploadedAt = new Date().toISOString();
  let doc: typeof schema.kycDocuments.$inferSelect;
  try {
    // One row per (provider, docType), enforced by a DB-level unique index: a single atomic
    // upsert avoids the select→delete→insert race where two concurrent uploads of the same
    // docType could both pass a prior existence check and both insert.
    const [row] = await db.insert(schema.kycDocuments)
      .values({
        id: uuidv4(),
        providerId: provider.id,
        docType: doc_type,
        fileKey: key,
        contentType,
        status: 'pending',
        rejectionReason: null,
        uploadedAt,
        reviewedAt: null,
        reviewedBy: null,
      })
      .onConflictDoUpdate({
        target: [schema.kycDocuments.providerId, schema.kycDocuments.docType],
        set: {
          fileKey: key,
          contentType,
          status: 'pending',
          rejectionReason: null,
          uploadedAt,
          reviewedAt: null,
          reviewedBy: null,
        },
      })
      .returning();
    doc = row;
  } catch (err) {
    // The DB write failed — the object we just uploaded is now orphaned (unreferenced by any
    // row). Best-effort clean it up before propagating, so failed writes don't leak storage.
    try {
      await deletePrivate(key);
    } catch (cleanupErr: any) {
      log.error(`Failed to delete orphaned KYC object ${key} after failed DB write: ${cleanupErr?.message || cleanupErr}`);
    }
    throw err;
  }

  // Best-effort cleanup of the previous object now that the new row is committed.
  if (oldFileKey && oldFileKey !== key) {
    try {
      await deletePrivate(oldFileKey);
    } catch (err: any) {
      log.error(`Failed to delete replaced KYC object ${oldFileKey}: ${err?.message || err}`);
    }
  }

  await recomputeKycStatus(provider.id);
  res.json({ document: docOut(doc) });
});

// DELETE /providers/me/kyc/:docType — owner removes a doc
router.delete('/me/kyc/:docType', authenticateToken, async (req: Request, res: Response) => {
  const provider = await ownActiveProvider(req.user.id);
  if (!provider) return res.status(403).json({ detail: 'Only active providers can manage KYC documents' });
  const removed = await db.select().from(schema.kycDocuments)
    .where(and(eq(schema.kycDocuments.providerId, provider.id), eq(schema.kycDocuments.docType, req.params.docType as any)));
  await db.delete(schema.kycDocuments)
    .where(and(eq(schema.kycDocuments.providerId, provider.id), eq(schema.kycDocuments.docType, req.params.docType as any)));
  for (const row of removed) {
    try {
      await deletePrivate(row.fileKey);
    } catch (err: any) {
      log.error(`Failed to delete removed KYC object ${row.fileKey}: ${err?.message || err}`);
    }
  }
  await recomputeKycStatus(provider.id);
  res.json({ ok: true });
});

// GET /providers/kyc/:id/file — stream a private doc to owner or admin
router.get('/kyc/:id/file', authenticateToken, async (req: Request, res: Response) => {
  const [doc] = await db.select().from(schema.kycDocuments).where(eq(schema.kycDocuments.id, req.params.id as any)).limit(1);
  if (!doc) return res.status(404).json({ detail: 'Not found' });

  let allowed = req.user.role === 'admin';
  if (!allowed) {
    const [provider] = await db.select().from(schema.providers).where(eq(schema.providers.id, doc.providerId)).limit(1);
    allowed = !!provider && provider.userId === req.user.id;
  }
  if (!allowed) return res.status(403).json({ detail: 'Forbidden' });

  const { stream, contentType } = await getPrivateObject(doc.fileKey);
  const resolvedType = contentType || doc.contentType;
  res.setHeader('Content-Type', resolvedType);
  res.setHeader('Cache-Control', 'private, no-store');
  // The content type is ultimately sourced from the uploader's own data-URL prefix, so a
  // browser must never be allowed to sniff/reinterpret it (e.g. as HTML) — and it must never
  // render inline as a top-level navigation target for arbitrary content, only as an asset.
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const ext = path.extname(doc.fileKey) || (resolvedType === 'application/pdf' ? '.pdf' : '');
  res.setHeader('Content-Disposition', `inline; filename="${doc.docType}${ext}"`);
  stream.on('error', (err: any) => {
    log.error(`KYC file stream failed for ${doc.id}: ${err?.message || err}`);
    res.destroy(err);
  });
  res.on('close', () => stream.destroy());
  stream.pipe(res);
});

export default router;
