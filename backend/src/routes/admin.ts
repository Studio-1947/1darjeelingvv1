import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import * as schema from '../schema';
import { eq, and, count } from 'drizzle-orm';
import { SEED_LISTINGS } from '../seed_data';
import { authenticateToken, requireAdmin, hashPassword } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { ADMIN_BOOTSTRAP_SECRET } from '../config';
import { recomputeKycStatus } from './kyc';

const router = Router();

// ============ ADMIN / DEV / SEED ROUTES ============
let isSeeding = false;

/**
 * @openapi
 * /admin/seed:
 *   post:
 *     summary: Seed sample listings (admin only)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Seed result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 seeded: { type: integer }
 *                 total_in_seed: { type: integer }
 *       403:
 *         description: Not an admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// Admin Seed listings
router.post('/admin/seed', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  if (isSeeding) {
    return res.json({ seeded: 0, total_in_seed: SEED_LISTINGS.length, message: 'Seeding already in progress' });
  }
  isSeeding = true;

  try {
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
  } finally {
    isSeeding = false;
  }
});

/**
 * @openapi
 * /admin/stats:
 *   get:
 *     summary: Get platform-wide counts
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Counts
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 users: { type: integer }
 *                 providers: { type: integer }
 *                 listings: { type: integer }
 *                 bookings: { type: integer }
 *                 payments: { type: integer, description: "Count of payments with status=paid" }
 *       403:
 *         description: Not an admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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

/**
 * @openapi
 * /admin/bootstrap:
 *   post:
 *     summary: Promote the current user to the first DB-backed admin
 *     description: Only works while no admin user exists yet, and requires ADMIN_BOOTSTRAP_SECRET to match.
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [secret, password]
 *             properties:
 *               secret: { type: string }
 *               password: { type: string, description: "New admin password to set on this user" }
 *     responses:
 *       200:
 *         description: User promoted to admin
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *                 user_id: { type: string }
 *       400:
 *         description: Missing password
 *       403:
 *         description: Admin already exists, or invalid bootstrap secret
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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

/**
 * @openapi
 * /admin/listings:
 *   get:
 *     summary: List all listings
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: All listings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Listing' }
 */
// Admin Listings List
router.get('/admin/listings', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const items = await db.select().from(schema.listings);
  res.json({ items });
});

/**
 * @openapi
 * /admin/listings/{id}:
 *   delete:
 *     summary: Delete a listing
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 */
// Admin Listings Delete
router.delete('/admin/listings/:id', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const { id } = req.params;
  await db.delete(schema.listings).where(eq(schema.listings.id, id as any));
  res.json({ ok: true });
});

/**
 * @openapi
 * /admin/users:
 *   get:
 *     summary: List all users with their provider status
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: All users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items: { type: object }
 */
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

/**
 * @openapi
 * /admin/users/{id}:
 *   delete:
 *     summary: Delete a user (admins cannot be deleted this way)
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *       403:
 *         description: Cannot delete an admin user
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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

/**
 * @openapi
 * /admin/providers/{id}/status:
 *   put:
 *     summary: Update a provider's status
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [pending_payment, active] }
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok: { type: boolean }
 *       400:
 *         description: Missing status
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
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

/**
 * @openapi
 * /admin/bookings:
 *   get:
 *     summary: List all bookings
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: All bookings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items: { $ref: '#/components/schemas/Booking' }
 */
// Admin Bookings List
router.get('/admin/bookings', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const items = await db.select().from(schema.bookings);
  res.json({ items });
});

/**
 * @openapi
 * /admin/payments:
 *   get:
 *     summary: List all payments
 *     tags: [Admin]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: All payments
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items: { type: object }
 */
// Admin Payments List
router.get('/admin/payments', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const items = await db.select().from(schema.payments);
  res.json({ items });
});

// GET /admin/kyc?status=pending — list KYC documents with provider/user context
router.get('/admin/kyc', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const statusFilter = typeof req.query.status === 'string' ? req.query.status : undefined;
  const rows = await db.select().from(schema.kycDocuments);
  const providers = await db.select().from(schema.providers);
  const users = await db.select().from(schema.users);
  const pById = new Map(providers.map(p => [p.id, p]));
  const uById = new Map(users.map(u => [u.id, u]));

  const documents = rows
    .filter(d => !statusFilter || d.status === statusFilter)
    .map(d => {
      const p = pById.get(d.providerId);
      const u = p ? uById.get(p.userId) : undefined;
      return {
        id: d.id,
        provider_id: d.providerId,
        doc_type: d.docType,
        status: d.status,
        rejection_reason: d.rejectionReason,
        uploaded_at: d.uploadedAt,
        business_name: p?.businessName || null,
        business_type: p?.businessType || null,
        owner_name: u?.name || null,
        file_url: `/api/providers/kyc/${d.id}/file`,
      };
    });
  res.json({ documents });
});

// POST /admin/kyc/:id/review — approve or reject a document
router.post('/admin/kyc/:id/review', authenticateToken, requireAdmin, async (req: Request, res: Response) => {
  const { decision, reason } = req.body || {};
  if (decision !== 'approve' && decision !== 'reject') {
    return res.status(400).json({ detail: "decision must be 'approve' or 'reject'" });
  }
  const [doc] = await db.select().from(schema.kycDocuments).where(eq(schema.kycDocuments.id, req.params.id as any)).limit(1);
  if (!doc) return res.status(404).json({ detail: 'Not found' });

  const status = decision === 'approve' ? 'approved' : 'rejected';
  await db.update(schema.kycDocuments).set({
    status,
    rejectionReason: decision === 'reject' ? (reason || null) : null,
    reviewedAt: new Date().toISOString(),
    reviewedBy: req.user.id,
  }).where(eq(schema.kycDocuments.id, doc.id));

  const kycStatus = await recomputeKycStatus(doc.providerId);
  res.json({
    document: { id: doc.id, doc_type: doc.docType, status, rejection_reason: decision === 'reject' ? (reason || null) : null },
    provider_kyc_status: kycStatus,
  });
});

export default router;
