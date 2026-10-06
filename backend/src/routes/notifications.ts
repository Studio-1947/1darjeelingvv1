import { Router, Request, Response } from 'express';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db';
import { authenticateToken } from '../middleware/auth';
import { routeParam } from '../lib/routeParam';

const router = Router();

const shape = (n: typeof schema.notifications.$inferSelect) => ({
  id: n.id,
  kind: n.kind,
  title: n.title,
  body: n.body,
  ref_id: n.refId,
  unread: n.readAt === null,
  created_at: n.createdAt,
});

/**
 * @openapi
 * /notifications:
 *   get:
 *     summary: The caller's in-app activity feed, newest first
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - { in: query, name: limit, schema: { type: integer, default: 50, maximum: 100 } }
 *     responses:
 *       200:
 *         description: Feed items and the total unread count
 */
router.get('/', authenticateToken, async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '50'), 10) || 50, 1), 100);
  const rows = await db.select().from(schema.notifications)
    .where(eq(schema.notifications.userId, req.user.id))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(limit);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` })
    .from(schema.notifications)
    .where(and(eq(schema.notifications.userId, req.user.id), isNull(schema.notifications.readAt)));
  res.json({ items: rows.map(shape), unread_count: count });
});

/**
 * @openapi
 * /notifications/read-all:
 *   post:
 *     summary: Mark every notification as read
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: How many were marked }
 */
router.post('/read-all', authenticateToken, async (req: Request, res: Response) => {
  const updated = await db.update(schema.notifications)
    .set({ readAt: new Date().toISOString() })
    .where(and(eq(schema.notifications.userId, req.user.id), isNull(schema.notifications.readAt)))
    .returning({ id: schema.notifications.id });
  res.json({ ok: true, updated: updated.length });
});

/**
 * @openapi
 * /notifications/{id}/read:
 *   patch:
 *     summary: Mark one notification as read
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Marked }
 *       404: { description: Not found, or not the caller's }
 */
router.patch('/:id/read', authenticateToken, async (req: Request, res: Response) => {
  const id = routeParam(req, 'id');
  // Scoped to the caller in the WHERE, so someone else's id is indistinguishable from a missing one.
  const [row] = await db.update(schema.notifications)
    .set({ readAt: new Date().toISOString() })
    .where(and(
      eq(schema.notifications.id, id),
      eq(schema.notifications.userId, req.user.id),
      isNull(schema.notifications.readAt),
    ))
    .returning();
  if (row) return res.json({ ok: true });
  // Already read is a success; only a row that is not theirs (or does not exist) is a 404.
  const [existing] = await db.select({ id: schema.notifications.id }).from(schema.notifications)
    .where(and(eq(schema.notifications.id, id), eq(schema.notifications.userId, req.user.id)))
    .limit(1);
  if (!existing) return res.status(404).json({ detail: 'Notification not found' });
  res.json({ ok: true });
});

export default router;
