import { Router, Request, Response } from 'express';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { VAPID_PUBLIC_KEY, WEB_PUSH_CONFIGURED } from '../config';
import { authenticateToken } from '../middleware/auth';
import { routeParam } from '../lib/routeParam';
import { parseSubscription } from '../lib/webPush';

const router = Router();

const shape = (n: typeof schema.notifications.$inferSelect) => ({
  id: n.id,
  kind: n.kind,
  title: n.title,
  body: n.body,
  ref_id: n.refId,
  msg: n.msg ?? null,
  link: n.link ?? null,
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

/** Browsers one person can have notifications on in; registering another drops their oldest. */
const MAX_BROWSERS = 10;

/**
 * @openapi
 * /notifications/web-push/key:
 *   get:
 *     summary: The public key a browser subscribes to website notifications with
 *     tags: [Notifications]
 *     responses:
 *       200: { description: "{ key } (null when the website does not send notifications)" }
 */
router.get('/web-push/key', (_req: Request, res: Response) => {
  res.json({ key: WEB_PUSH_CONFIGURED ? VAPID_PUBLIC_KEY : null });
});

/**
 * @openapi
 * /notifications/web-push:
 *   post:
 *     summary: Turn on notifications in this browser (its PushSubscription.toJSON())
 *     tags: [Notifications]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Registered }
 *       400: { description: Not a subscription from a browser push service }
 *   delete:
 *     summary: Turn off notifications in this browser, e.g. on sign-out
 *     description: Needs no sign-in, so a browser whose session has expired can still stop them. Knowing the endpoint is the proof.
 *     tags: [Notifications]
 *     responses:
 *       200: { description: Removed }
 */
// A browser, like a phone, changes hands: whoever signs in and turns notifications on owns it now.
router.post('/web-push', authenticateToken, async (req: Request, res: Response) => {
  if (!WEB_PUSH_CONFIGURED) return res.status(503).json({ detail: 'Notifications are not available on the website yet' });
  const parsed = parseSubscription(req.body);
  if (!parsed.ok) return res.status(400).json({ detail: parsed.error });
  const { endpoint, p256dh, auth } = parsed.value;
  const now = new Date().toISOString();
  await db.insert(schema.webPushSubscriptions)
    .values({ id: uuidv4(), userId: req.user.id, endpoint, p256dh, auth, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.webPushSubscriptions.endpoint,
      set: { userId: req.user.id, p256dh, auth, updatedAt: now },
    });
  const extra = await db.select({ id: schema.webPushSubscriptions.id })
    .from(schema.webPushSubscriptions)
    .where(eq(schema.webPushSubscriptions.userId, req.user.id))
    .orderBy(desc(schema.webPushSubscriptions.updatedAt))
    .offset(MAX_BROWSERS);
  if (extra.length) {
    await db.delete(schema.webPushSubscriptions).where(inArray(schema.webPushSubscriptions.id, extra.map((r) => r.id)));
  }
  res.json({ ok: true });
});

router.delete('/web-push', async (req: Request, res: Response) => {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint : '';
  if (!endpoint) return res.status(400).json({ detail: 'endpoint is required' });
  await db.delete(schema.webPushSubscriptions).where(eq(schema.webPushSubscriptions.endpoint, endpoint));
  res.json({ ok: true });
});

export default router;
