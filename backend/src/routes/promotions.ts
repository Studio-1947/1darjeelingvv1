import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { routeParam } from '../lib/routeParam';

const router = Router();

const shape = (p: typeof schema.promotions.$inferSelect) => ({
  id: p.id,
  tag: p.tag,
  title: p.title,
  subtitle: p.subtitle,
  image: p.image,
  link: p.link,
  sort_order: p.sortOrder,
  active: p.active,
});

/**
 * @openapi
 * /promotions:
 *   get:
 *     summary: Active home-screen promotion cards, in display order
 *     tags: [Promotions]
 *     responses:
 *       200: { description: "{ items: Promotion[] }" }
 */
router.get('/', async (_req: Request, res: Response) => {
  const rows = await db.select().from(schema.promotions)
    .where(eq(schema.promotions.active, true))
    .orderBy(asc(schema.promotions.sortOrder), asc(schema.promotions.createdAt));
  res.json({ items: rows.map(shape) });
});

// The link is followed by the app's own router, so it must be an in-app path rather than a URL
// that would send a traveller to an arbitrary site. The image is shown as-is, so https only.
function validate(body: any, partial: boolean): { ok: true; set: Record<string, any> } | { ok: false; detail: string } {
  const set: Record<string, any> = {};
  for (const key of ['tag', 'title', 'subtitle'] as const) {
    if (body[key] === undefined) { if (!partial) return { ok: false, detail: `${key} is required` }; continue; }
    if (typeof body[key] !== 'string' || !body[key].trim() || body[key].length > 120) {
      return { ok: false, detail: `${key} must be 1-120 characters` };
    }
    set[key] = body[key].trim();
  }
  if (body.image !== undefined || !partial) {
    if (typeof body.image !== 'string' || !/^https:\/\//.test(body.image) || body.image.length > 500) {
      return { ok: false, detail: 'image must be an https URL' };
    }
    set.image = body.image;
  }
  if (body.link !== undefined || !partial) {
    if (typeof body.link !== 'string' || !/^\/[A-Za-z0-9/_\-?=&%.]*$/.test(body.link) || body.link.startsWith('//')) {
      return { ok: false, detail: 'link must be an in-app path like /category/homestay' };
    }
    set.link = body.link;
  }
  if (body.sort_order !== undefined) {
    if (!Number.isInteger(body.sort_order)) return { ok: false, detail: 'sort_order must be an integer' };
    set.sortOrder = body.sort_order;
  }
  if (body.active !== undefined) {
    if (typeof body.active !== 'boolean') return { ok: false, detail: 'active must be true or false' };
    set.active = body.active;
  }
  return { ok: true, set };
}

router.post('/', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const v = validate(req.body || {}, false);
  if (!v.ok) return res.status(400).json({ detail: v.detail });
  const [row] = await db.insert(schema.promotions)
    .values({ id: uuidv4(), createdAt: new Date().toISOString(), ...v.set } as typeof schema.promotions.$inferInsert)
    .returning();
  res.json({ item: shape(row) });
});

router.patch('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const v = validate(req.body || {}, true);
  if (!v.ok) return res.status(400).json({ detail: v.detail });
  if (Object.keys(v.set).length === 0) return res.status(400).json({ detail: 'Nothing to update' });
  const [row] = await db.update(schema.promotions).set(v.set)
    .where(eq(schema.promotions.id, routeParam(req, 'id'))).returning();
  if (!row) return res.status(404).json({ detail: 'Promotion not found' });
  res.json({ item: shape(row) });
});

router.delete('/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const deleted = await db.delete(schema.promotions)
    .where(eq(schema.promotions.id, routeParam(req, 'id'))).returning({ id: schema.promotions.id });
  if (deleted.length === 0) return res.status(404).json({ detail: 'Promotion not found' });
  res.json({ ok: true });
});

export default router;
