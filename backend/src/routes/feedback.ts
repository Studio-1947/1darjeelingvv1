import { Router, Request, Response } from 'express';
import { desc, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { myProvider } from '../lib/hostAccess';

const router = Router();

router.get('/host-feedback', authenticateToken, async (req: Request, res: Response) => {
  const provider = await myProvider(req.user.id);
  if (!provider) return res.status(404).json({ detail: 'Provider profile not found' });
  const items = await db.select().from(schema.hostFeedback)
    .where(eq(schema.hostFeedback.providerId, provider.id)).orderBy(desc(schema.hostFeedback.createdAt)).limit(10);
  res.json({ items: items.map((row) => ({ id: row.id, message: row.message, status: row.status, created_at: row.createdAt })) });
});

router.post('/host-feedback', authenticateToken, async (req: Request, res: Response) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (message.length < 10 || message.length > 2000) return res.status(400).json({ detail: 'Feedback must be between 10 and 2,000 characters.' });
  const provider = await myProvider(req.user.id);
  if (!provider) return res.status(404).json({ detail: 'Provider profile not found' });
  const [item] = await db.insert(schema.hostFeedback).values({ id: uuidv4(), userId: req.user.id, providerId: provider.id, message, status: 'open', createdAt: new Date().toISOString() }).returning();
  res.status(201).json({ feedback: { id: item.id, message: item.message, status: item.status, created_at: item.createdAt } });
});

/**
 * Feedback for aangan itself (the board's traveller dashboard): anyone signed in, a message and an
 * optional 1-5 rating. Read by the team in the admin console.
 */
router.get('/feedback/aangan', authenticateToken, async (req: Request, res: Response) => {
  const items = await db.select().from(schema.appFeedback)
    .where(eq(schema.appFeedback.userId, req.user.id)).orderBy(desc(schema.appFeedback.createdAt)).limit(10);
  res.json({ items: items.map((row) => ({ id: row.id, rating: row.rating, message: row.message, status: row.status, created_at: row.createdAt })) });
});

router.post('/feedback/aangan', authenticateToken, rateLimiter(10, 60 * 60 * 1000, 'app_feedback'), async (req: Request, res: Response) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (message.length < 5 || message.length > 2000) return res.status(400).json({ detail: 'Feedback must be between 5 and 2,000 characters.' });
  const raw = req.body?.rating;
  const rating = raw === undefined || raw === null || raw === '' ? null : Number(raw);
  if (rating !== null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) return res.status(400).json({ detail: 'Rating must be 1 to 5.' });
  const [item] = await db.insert(schema.appFeedback)
    .values({ id: uuidv4(), userId: req.user.id, rating, message, status: 'open', createdAt: new Date().toISOString() })
    .returning();
  res.status(201).json({ feedback: { id: item.id, rating: item.rating, message: item.message, status: item.status, created_at: item.createdAt } });
});

/** Every piece of feedback for aangan, newest first (admin). */
router.get('/feedback/aangan/all', authenticateToken, requireAdmin, async (_req: Request, res: Response) => {
  const items = await db.select({ f: schema.appFeedback, name: schema.users.name, phone: schema.users.phone })
    .from(schema.appFeedback).innerJoin(schema.users, eq(schema.users.id, schema.appFeedback.userId))
    .orderBy(desc(schema.appFeedback.createdAt)).limit(200);
  res.json({ items: items.map(({ f, name, phone }) => ({ id: f.id, rating: f.rating, message: f.message, status: f.status, created_at: f.createdAt, user: { name, phone } })) });
});

export default router;
