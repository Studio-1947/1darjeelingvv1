/**
 * The admin panel's Clean-up tab: the same checks as the scripts in backend/scripts/, so nobody has
 * to log in to the server to run them.
 *
 * Each check has a GET that only reports. The POST that fixes something works the list out again
 * on the server; it never acts on a list the browser sends back, so a stale page cannot delete
 * something that has since changed.
 *
 *   GET  /admin/maintenance/photos           broken photo addresses
 *   POST /admin/maintenance/photos/repair
 *   GET  /admin/maintenance/demo             the old sample businesses
 *   POST /admin/maintenance/demo/delete
 *   GET  /admin/maintenance/content          test-looking listings, posts and reviews (read-only)
 *   GET  /admin/maintenance/storage          stored files nothing refers to
 *   POST /admin/maintenance/storage/delete
 */
import { Router, Request, Response } from 'express';

import { pool } from '../db';
import { log } from '../config';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { deleteDemoListings, findDemoData } from '../lib/demoData';
import { findPlaceholderContent } from '../lib/placeholderContent';
import { applyPhotoRepairs, findPhotoRepairs } from '../lib/photoRepair';
import { findReferencedKeys } from '../lib/storageRefs';
import { STORAGE_BUCKETS, deleteStoredObject, listBucketKeys } from '../lib/s3';

const router = Router();
const admin = [authenticateToken, requireAdmin];
const writeLimit = rateLimiter(10, 60_000, 'admin_maintenance');

const short = (s: string) => (s.length > 300 ? s.slice(0, 300) + '...' : s);

/** Runs `fn` on one connection, so its BEGIN and COMMIT reach the same session. */
async function withClient<T>(fn: (c: import('pg').PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

// ---- Broken photo addresses ----------------------------------------------------------------

router.get('/admin/maintenance/photos', ...admin, async (_req: Request, res: Response) => {
  const changes = await findPhotoRepairs(pool);
  res.json({
    count: changes.length,
    changes: changes.map((c) => ({ table: c.table, column: c.column, id: c.id, before: short(c.before), after: short(c.after) })),
  });
});

router.post('/admin/maintenance/photos/repair', ...admin, writeLimit, async (req: Request, res: Response) => {
  const updated = await withClient(async (c) => applyPhotoRepairs(c, await findPhotoRepairs(c)));
  log.warn(`[admin-maintenance] admin=${req.user.id} repaired ${updated} photo address row(s)`);
  res.json({ updated });
});

// ---- Demo businesses -------------------------------------------------------------------------

router.get('/admin/maintenance/demo', ...admin, async (_req: Request, res: Response) => {
  res.json(await findDemoData(pool));
});

router.post('/admin/maintenance/demo/delete', ...admin, writeLimit, async (req: Request, res: Response) => {
  const deleted = await withClient(async (c) => {
    const report = await findDemoData(c);
    return deleteDemoListings(c, report.remove.map((l) => l.id));
  });
  log.warn(`[admin-maintenance] admin=${req.user.id} deleted ${deleted.length} demo business(es)`);
  res.json({ deleted: deleted.length });
});

// ---- Test-looking content (read-only; the panel links each item to its own delete/hide) -----

router.get('/admin/maintenance/content', ...admin, async (_req: Request, res: Response) => {
  res.json({ items: await findPlaceholderContent(pool) });
});

// ---- Unused stored files -----------------------------------------------------------------------

async function unusedFiles() {
  const buckets = [];
  for (const bucket of STORAGE_BUCKETS) {
    const keys = await listBucketKeys(bucket);
    const used = await findReferencedKeys(pool, keys);
    buckets.push({ bucket, total: keys.length, used: used.size, unused: keys.filter((k) => !used.has(k)) });
  }
  return buckets;
}

router.get('/admin/maintenance/storage', ...admin, async (_req: Request, res: Response) => {
  try {
    const buckets = await unusedFiles();
    res.json({ unused_total: buckets.reduce((n, b) => n + b.unused.length, 0), buckets });
  } catch (err: any) {
    log.error(`[admin-maintenance] storage check failed: ${err?.message || err}`);
    res.status(503).json({ detail: 'Could not read file storage. Try again, or check the storage service.' });
  }
});

router.post('/admin/maintenance/storage/delete', ...admin, writeLimit, async (req: Request, res: Response) => {
  let buckets;
  try {
    buckets = await unusedFiles();
  } catch (err: any) {
    log.error(`[admin-maintenance] storage check failed: ${err?.message || err}`);
    return res.status(503).json({ detail: 'Could not read file storage. Nothing was deleted.' });
  }
  let deleted = 0;
  let failed = 0;
  for (const b of buckets) {
    for (const key of b.unused) {
      try {
        await deleteStoredObject(b.bucket, key);
        deleted++;
      } catch (err: any) {
        failed++;
        log.error(`[admin-maintenance] could not delete ${b.bucket}/${key}: ${err?.message || err}`);
      }
    }
  }
  log.warn(`[admin-maintenance] admin=${req.user.id} deleted ${deleted} unused file(s), ${failed} failed`);
  res.json({ deleted, failed });
});

export default router;
