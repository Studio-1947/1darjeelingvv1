import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import * as schema from '../schema';
import { eq, and, count } from 'drizzle-orm';
import { SEED_LISTINGS } from '../seed_data';
import { authenticateToken, requireAdmin, hashPassword } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { IS_PROD, ADMIN_BOOTSTRAP_SECRET } from '../config';

const router = Router();

// ============ ADMIN / DEV / SEED ROUTES ============

// Dev Seed listings (Only available in development)
router.post('/dev/seed', async (req: Request, res: Response) => {
  if (IS_PROD) {
    return res.status(403).json({ detail: 'Not available in production' });
  }

  let inserted = 0;
  for (const item of SEED_LISTINGS) {
    const exists = await db.select()
      .from(schema.listings)
      .where(and(eq(schema.listings.title, item.title), eq(schema.listings.type, item.type)))
      .limit(1);

    if (exists.length > 0) {
      continue;
    }

    const doc = {
      id: uuidv4(),
      title: item.title,
      type: item.type,
      description: item.description,
      location: item.location,
      price: item.price,
      image: item.image,
      tags: item.tags,
      providerId: 'admin-seed-provider',
      extras: item.extras || {},
      createdAt: new Date().toISOString()
    };
    await db.insert(schema.listings).values(doc);
    inserted++;
  }

  res.json({ seeded: inserted, total_in_seed: SEED_LISTINGS.length });
});

// Admin Seed listings
router.post('/admin/seed', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  let inserted = 0;
  for (const item of SEED_LISTINGS) {
    const exists = await db.select()
      .from(schema.listings)
      .where(and(eq(schema.listings.title, item.title), eq(schema.listings.type, item.type)))
      .limit(1);

    if (exists.length > 0) {
      continue;
    }

    const doc = {
      id: uuidv4(),
      title: item.title,
      type: item.type,
      description: item.description,
      location: item.location,
      price: item.price,
      image: item.image,
      tags: item.tags,
      providerId: 'admin-seed-provider',
      extras: item.extras || {},
      createdAt: new Date().toISOString()
    };
    await db.insert(schema.listings).values(doc);
    inserted++;
  }

  res.json({ seeded: inserted, total_in_seed: SEED_LISTINGS.length });
});

// Admin Stats
router.get('/admin/stats', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const usersCount = await db.select({ value: count() }).from(schema.users);
  const providersCount = await db.select({ value: count() }).from(schema.providers);
  const listingsCount = await db.select({ value: count() }).from(schema.listings);
  const bookingsCount = await db.select({ value: count() }).from(schema.bookings);
  const paymentsCount = await db.select({ value: count() }).from(schema.payments).where(eq(schema.payments.status, 'paid'));

  res.json({
    users: usersCount[0]?.value || 0,
    providers: providersCount[0]?.value || 0,
    listings: listingsCount[0]?.value || 0,
    bookings: bookingsCount[0]?.value || 0,
    payments: paymentsCount[0]?.value || 0
  });
});

// Admin Bootstrap
router.post('/admin/bootstrap', rateLimiter(3, 60 * 60 * 1000, 'admin_bootstrap'), authenticateToken, async (req: Request, res: Response) => {
  const { secret, password } = req.body;
  const adminCountResult = await db.select({ value: count() }).from(schema.users).where(eq(schema.users.role, 'admin'));
  const adminCount = adminCountResult[0]?.value || 0;

  if (adminCount > 0) {
    return res.status(403).json({ detail: 'Admin already exists' });
  }

  const expectedSecret = ADMIN_BOOTSTRAP_SECRET;
  if (!expectedSecret || secret !== expectedSecret) {
    return res.status(403).json({ detail: 'Invalid bootstrap secret' });
  }

  if (!password || password.trim() === '') {
    return res.status(400).json({ detail: 'Password is required for bootstrap' });
  }

  const hashedPassword = hashPassword(password);
  await db.update(schema.users)
    .set({ role: 'admin', password: hashedPassword })
    .where(eq(schema.users.id, req.user.id));
  res.json({ ok: true, user_id: req.user.id });
});

// Admin Listings List
router.get('/admin/listings', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const items = await db.select().from(schema.listings);
  res.json({ items });
});

// Admin Listings Delete
router.delete('/admin/listings/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  await db.delete(schema.listings).where(eq(schema.listings.id, id as any));
  res.json({ ok: true });
});

// Admin Users List
router.get('/admin/users', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const items = await db.select({
    id: schema.users.id,
    name: schema.users.name,
    phone: schema.users.phone,
    role: schema.users.role,
    email: schema.users.email,
    createdAt: schema.users.createdAt,
    providerId: schema.providers.id,
    providerStatus: schema.providers.status,
    businessName: schema.providers.businessName,
  })
  .from(schema.users)
  .leftJoin(schema.providers, eq(schema.users.id, schema.providers.userId));
  res.json({ items });
});

// Admin Users Delete
router.delete('/admin/users/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const [targetUser] = await db.select().from(schema.users).where(eq(schema.users.id, id as any)).limit(1);
  if (targetUser && targetUser.role === 'admin') {
    return res.status(403).json({ detail: 'Cannot delete admin user' });
  }
  await db.delete(schema.users).where(eq(schema.users.id, id as any));
  res.json({ ok: true });
});

// Admin Providers status update
router.put('/admin/providers/:id/status', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  const { status } = req.body;
  if (!status) {
    return res.status(400).json({ detail: 'Status is required' });
  }
  await db.update(schema.providers).set({ status }).where(eq(schema.providers.id, id as any));
  res.json({ ok: true });
});

// Admin Bookings List
router.get('/admin/bookings', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const items = await db.select().from(schema.bookings);
  res.json({ items });
});

// Admin Payments List
router.get('/admin/payments', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const items = await db.select().from(schema.payments);
  res.json({ items });
});

export default router;
