import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';

import { db, schema } from '../db';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { routeParam } from '../lib/routeParam';
import { renderEmail, sendEmail } from '../lib/email';
import { ADMIN_ALERT_EMAILS } from '../config';

const router = Router();

// ============ REPORTS & BLOCKS ============
// App Store (guideline 1.2) and Google Play both require apps with user-generated content to let
// people report it and block the person who posted it. Reports land here for an admin to review;
// a block hides the blocked person's reviews from the blocker.

export const REPORT_REASONS = ['spam', 'fake', 'offensive', 'unsafe', 'other'] as const;
const TARGET_TYPES = ['listing', 'review', 'post'] as const;
const MAX_DETAILS_LEN = 1000;

type TargetType = (typeof TARGET_TYPES)[number];

async function targetExists(type: TargetType, id: string): Promise<boolean> {
  const table = type === 'listing' ? schema.listings : type === 'review' ? schema.reviews : schema.hostPosts;
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
 *               target_type: { type: string, enum: [listing, review, post] }
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
    return res.status(400).json({ detail: 'target_type must be listing, review or post' });
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

  // A new report reaches the team by email when ADMIN_ALERT_EMAIL and SMTP are set. Not awaited:
  // the reporter should not wait on a mail server.
  if (inserted.length && ADMIN_ALERT_EMAILS.length) {
    const what = `${target_type} ${target_id}`;
    void sendEmail({
      to: ADMIN_ALERT_EMAILS,
      subject: `New report: ${reason} (${target_type})`,
      text: `A ${target_type} was reported as "${reason}". ${what}. ${details ? `Note: ${details}` : ''} Review it in the admin reports list.`,
      html: renderEmail('Something was reported', [
        `A ${target_type} was reported as "${reason}".`,
        `Id: ${target_id}`,
        details ? `Note from the reporter: ${details}` : 'No note was added.',
        'Review it in the admin reports list (GET /api/admin/reports).',
      ], 'You get this because your address is in ADMIN_ALERT_EMAIL.'),
    });
  }

  // A second report of the same thing by the same person is not an error: the first stands.
  res.status(inserted.length ? 201 : 200).json({ ok: true });
});

/**
 * @openapi
 * /users/me/blocks:
 *   get:
 *     summary: The people the current user has blocked (ids, and names for an unblock list)
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
  // Names come with the ids so a "Blocked people" list can show who to unblock. Only the name the
  // person already shows publicly on their reviews: no phone, no email.
  const rows = await db
    .select({ id: schema.userBlocks.blockedId, name: schema.users.name, blockedAt: schema.userBlocks.createdAt })
    .from(schema.userBlocks)
    .innerJoin(schema.users, eq(schema.users.id, schema.userBlocks.blockedId))
    .where(eq(schema.userBlocks.blockerId, req.user!.id))
    .orderBy(desc(schema.userBlocks.createdAt));
  res.json({
    user_ids: rows.map((r) => r.id),
    users: rows.map((r) => ({ id: r.id, name: r.name, blocked_at: r.blockedAt })),
  });
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

/** What a report points at, for the admin list: enough to judge it without opening anything. */
async function targetSummaries(rows: { targetType: string; targetId: string }[]) {
  const ids = (type: string) => [...new Set(rows.filter((r) => r.targetType === type).map((r) => r.targetId))];
  const out = new Map<string, Record<string, unknown>>();

  const listingIds = ids('listing');
  if (listingIds.length) {
    const ls = await db
      .select({ id: schema.listings.id, title: schema.listings.title, type: schema.listings.type, location: schema.listings.location })
      .from(schema.listings)
      .where(inArray(schema.listings.id, listingIds));
    for (const l of ls) out.set('listing:' + l.id, { title: l.title, type: l.type, location: l.location });
  }

  const reviewIds = ids('review');
  if (reviewIds.length) {
    const rs = await db
      .select({
        id: schema.reviews.id,
        comment: schema.reviews.comment,
        rating: schema.reviews.rating,
        authorName: schema.reviews.authorName,
        authorId: schema.reviews.userId,
        listingId: schema.reviews.listingId,
        listingTitle: schema.listings.title,
      })
      .from(schema.reviews)
      .leftJoin(schema.listings, eq(schema.listings.id, schema.reviews.listingId))
      .where(inArray(schema.reviews.id, reviewIds));
    for (const r of rs) {
      out.set('review:' + r.id, {
        text: r.comment,
        rating: r.rating,
        author_name: r.authorName,
        author_id: r.authorId,
        listing_id: r.listingId,
        listing_title: r.listingTitle,
      });
    }
  }

  const postIds = ids('post');
  if (postIds.length) {
    const ps = await db
      .select({
        id: schema.hostPosts.id,
        body: schema.hostPosts.body,
        photos: schema.hostPosts.photos,
        hiddenAt: schema.hostPosts.hiddenAt,
        authorId: schema.hostPosts.userId,
        hostName: schema.providers.businessName,
      })
      .from(schema.hostPosts)
      .innerJoin(schema.providers, eq(schema.providers.id, schema.hostPosts.providerId))
      .where(inArray(schema.hostPosts.id, postIds));
    for (const p of ps) {
      out.set('post:' + p.id, {
        text: p.body,
        photos: p.photos,
        hidden: Boolean(p.hiddenAt),
        author_name: p.hostName,
        author_id: p.authorId,
      });
    }
  }
  return out;
}

/**
 * @openapi
 * /admin/reports:
 *   get:
 *     summary: Reports for an admin to review, newest first, with what each one points at
 *     description: >
 *       Each report carries `target` (a short preview of the listing, review or post, or null if it
 *       was deleted since), `reporter_name`, and `open_reports_on_target` so repeat reports of one
 *       thing stand out.
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
    .select({ report: schema.reports, reporterName: schema.users.name })
    .from(schema.reports)
    .leftJoin(schema.users, eq(schema.users.id, schema.reports.reporterId))
    .where(eq(schema.reports.status, status))
    .orderBy(desc(schema.reports.createdAt))
    .limit(200);

  const reports = rows.map((r) => r.report);
  const targets = await targetSummaries(reports);
  const openCounts = new Map<string, number>();
  if (reports.length) {
    const counts = await db
      .select({ type: schema.reports.targetType, id: schema.reports.targetId, n: sql<number>`count(*)::int` })
      .from(schema.reports)
      .where(eq(schema.reports.status, 'open'))
      .groupBy(schema.reports.targetType, schema.reports.targetId);
    for (const c of counts) openCounts.set(c.type + ':' + c.id, c.n);
  }

  res.json({
    reports: rows.map(({ report: r, reporterName }) => ({
      id: r.id,
      reporter_id: r.reporterId,
      reporter_name: reporterName,
      target_type: r.targetType,
      target_id: r.targetId,
      target: targets.get(r.targetType + ':' + r.targetId) ?? null,
      open_reports_on_target: openCounts.get(r.targetType + ':' + r.targetId) ?? 0,
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
 *     summary: Mark a report as dealt with. With ?all=1, every open report on the same item too.
 *     tags: [Reports]
 *     security: [{ bearerAuth: [] }]
 */
router.post('/admin/reports/:id/resolve', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const [report] = await db.select().from(schema.reports).where(eq(schema.reports.id, routeParam(req, 'id'))).limit(1);
  if (!report) return res.status(404).json({ detail: 'Report not found' });
  const now = new Date().toISOString();
  const all = req.query.all === '1' || req.query.all === 'true';
  const resolved = await db
    .update(schema.reports)
    .set({ status: 'resolved', resolvedAt: now })
    .where(
      all
        ? and(eq(schema.reports.targetType, report.targetType), eq(schema.reports.targetId, report.targetId), eq(schema.reports.status, 'open'))
        : eq(schema.reports.id, report.id)
    )
    .returning({ id: schema.reports.id });
  res.json({ ok: true, resolved: resolved.length });
});

export default router;
