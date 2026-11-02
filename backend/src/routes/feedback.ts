import { Router, Request, Response } from 'express';
import { desc, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.get('/host-feedback', authenticateToken, async (req: Request, res: Response) => {
  const [provider] = await db.select({ id: schema.providers.id })
    .from(schema.providers).where(eq(schema.providers.userId, req.user.id)).limit(1);
  if (!provider) return res.status(404).json({ detail: 'Provider profile not found' });
  const items = await db.select().from(schema.hostFeedback)
    .where(eq(schema.hostFeedback.providerId, provider.id)).orderBy(desc(schema.hostFeedback.createdAt)).limit(10);
  res.json({ items: items.map((row) => ({ id: row.id, message: row.message, status: row.status, created_at: row.createdAt })) });
});

router.post('/host-feedback', authenticateToken, async (req: Request, res: Response) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (message.length < 10 || message.length > 2000) return res.status(400).json({ detail: 'Feedback must be between 10 and 2,000 characters.' });
  const [provider] = await db.select({ id: schema.providers.id })
    .from(schema.providers).where(eq(schema.providers.userId, req.user.id)).limit(1);
  if (!provider) return res.status(404).json({ detail: 'Provider profile not found' });
  const [item] = await db.insert(schema.hostFeedback).values({ id: uuidv4(), userId: req.user.id, providerId: provider.id, message, status: 'open', createdAt: new Date().toISOString() }).returning();
  res.status(201).json({ feedback: { id: item.id, message: item.message, status: item.status, created_at: item.createdAt } });
});

export default router;
