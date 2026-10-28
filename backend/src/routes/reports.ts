import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { and, desc, eq } from 'drizzle-orm';

import { db, schema } from '../db';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { routeParam } from '../lib/routeParam';

const router = Router();

// ============ REPORTS & BLOCKS ============
// App Store (guideline 1.2) and Google Play both require apps with user-generated content to let
// people report it and block the person who posted it. Reports land here for an admin to review;
// a block hides the blocked person's reviews from the blocker.

export const REPORT_REASONS = ['spam', 'fake', 'offensive', 'unsafe', 'other'] as const;
const TARGET_TYPES = ['listing', 'review'] as const;
const MAX_DETAILS_LEN = 1000;

type TargetType = (typeof TARGET_TYPES)[number];

async function targetExists(type: TargetType, id: string): Promise<boolean> {
  const table = type === 'listing' ? schema.listings : schema.reviews;
  const [row] = await db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
  return Boolean(row);
}

/**
 * @openapi
 * /reports:
 *   post:
 *     summary: Report a listing or a review
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [target_type, target_id, reason]
 *             properties:
 *               target_type: { type: string, enum: [listing, review] }
 *               target_id: { type: string }
 *               reason: { type: string, enum: [spam, fake, offensive, unsafe, other] }
 *               details: { type: string, maxLength: 1000 }
 *     responses:
 *       201: { description: Report recorded }
 *       200: { description: Already reported by this person; nothing new stored }
 *       400: { description: Invalid input }
 *       404: { description: The listing or review does not exist }
 */
router.post('/reports', authenticateToken, async (req: Request, res: Response) => {
  const { target_type, target_id, reason, details = '' } = req.body ?? {};
  if (!TARGET_TYPES.includes(target_type)) {
    return res.status(400).json({ detail: 'target_type must be listing or review' });
  }
  if (typeof target_id !== 'string' || !target_id.trim()) {
    return res.status(400).json({ detail: 'target_id is required' });
  }
  if (!REPORT_REASONS.includes(reason)) {
    return res.status(400).json({ detail: `reason must be one of ${REPORT_REASONS.join(', ')}` });
  }
  if (typeof details !== 'string' || details.length > MAX_DETAILS_LEN) {
    return res.status(400).json({ detail: `details must be text of ${MAX_DETAILS_LEN} characters or fewer` });
  }
  if (!(await targetExists(target_type, target_id))) {
    return res.status(404).json({ detail: 'Nothing to report: it may already have been removed' });
  }

  const inserted = await db
    .insert(schema.reports)
    .values({
      id: uuidv4(),
      reporterId: req.user!.id,
      targetType: target_type,
      targetId: target_id,
      reason,
      details: details.trim(),
      createdAt: new Date().toISOString(),
    })
    .onConflictDoNothing()
    .returning({ id: schema.reports.id });

  // A second report of the same thing by the same person is not an error: the first stands.
  res.status(inserted.length ? 201 : 200).json({ ok: true });
});

/**
 * @openapi
 * /users/me/blocks:
 *   get:
 *     summary: The ids of the people the current user has blocked
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *   post:
 *     summary: Block a person, hiding their reviews from the current user
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id]
 *             properties:
 *               user_id: { type: string }
 */
router.get('/users/me/blocks', authenticateToken, async (req: Request, res: Response) => {
  const rows = await db
    .select({ id: schema.userBlocks.blockedId })
    .from(schema.userBlocks)
    .where(eq(schema.userBlocks.blockerId, req.user!.id))
    .orderBy(desc(schema.userBlocks.createdAt));
  res.json({ user_ids: rows.map((r) => r.id) });
});

router.post('/users/me/blocks', authenticateToken, async (req: Request, res: Response) => {
  const userId = req.body?.user_id;
  if (typeof userId !== 'string' || !userId.trim()) {
    return res.status(400).json({ detail: 'user_id is required' });
  }
  if (userId === req.user!.id) {
    return res.status(400).json({ detail: 'You cannot block yourself' });
  }
  const [target] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  if (!target) return res.status(404).json({ detail: 'User not found' });

  await db
    .insert(schema.userBlocks)
    .values({ blockerId: req.user!.id, blockedId: userId, createdAt: new Date().toISOString() })
    .onConflictDoNothing();
  res.status(201).json({ ok: true });
});

/**
 * @openapi
 * /users/me/blocks/{userId}:
 *   delete:
 *     summary: Unblock a person
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 */
router.delete('/users/me/blocks/:userId', authenticateToken, async (req: Request, res: Response) => {
  await db
    .delete(schema.userBlocks)
    .where(and(eq(schema.userBlocks.blockerId, req.user!.id), eq(schema.userBlocks.blockedId, routeParam(req, 'userId'))));
  res.json({ ok: true });
});

/**
 * @openapi
 * /admin/reports:
 *   get:
 *     summary: Reports for an admin to review, open ones first
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [open, resolved] }
 */
router.get('/admin/reports', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const status = req.query.status === 'resolved' ? 'resolved' : 'open';
  const rows = await db
    .select()
    .from(schema.reports)
    .where(eq(schema.reports.status, status))
    .orderBy(desc(schema.reports.createdAt))
    .limit(200);
  res.json({
    reports: rows.map((r) => ({
      id: r.id,
      reporter_id: r.reporterId,
      target_type: r.targetType,
      target_id: r.targetId,
      reason: r.reason,
      details: r.details,
      status: r.status,
      created_at: r.createdAt,
      resolved_at: r.resolvedAt,
    })),
  });
});

/**
 * @openapi
 * /admin/reports/{id}/resolve:
 *   post:
 *     summary: Mark a report as dealt with
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/admin/reports/:id/resolve', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const [row] = await db
    .update(schema.reports)
    .set({ status: 'resolved', resolvedAt: new Date().toISOString() })
    .where(eq(schema.reports.id, routeParam(req, 'id')))
    .returning({ id: schema.reports.id });
  if (!row) return res.status(404).json({ detail: 'Report not found' });
  res.json({ ok: true });
});

export default router;
