import { Router, Request, Response } from 'express';
import { db, schema } from '../db';
import { REFERRAL_REWARD_DAYS } from '../config';
import { and, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth';
import { deleteListingsOwnedBy, deleteKycFilesOwnedBy } from '../lib/accountCleanup';
import { toPublicUser } from '../lib/publicUser';
import { assignReferralCode, countReferrals } from '../lib/referrals';

const router = Router();

// ============ USERS ============

/**
 * @openapi
 * /users/me:
 *   patch:
 *     summary: Update the current user's profile
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               language: { type: string }
 *               avatar: { type: string }
 *               interests: { type: array, items: { type: string } }
 *     responses:
 *       200:
 *         description: Updated user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user: { $ref: '#/components/schemas/User' }
 *   delete:
 *     summary: Delete the current user's account and all associated data
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Account deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deleted: { type: boolean }
 */
// Update User Profile
router.patch('/me', authenticateToken, async (req: Request, res: Response) => {
  const patch = req.body || {};
  const allowed = ['name', 'email', 'language', 'avatar'];
  const updateFields: Record<string, any> = {};

  // Interests are a short list of plain ids. Validated rather than trusted: this lands in a jsonb
  // column and is echoed back to every client, so anything but short strings is refused outright.
  if (patch.interests !== undefined) {
    const ids = patch.interests;
    const ok = Array.isArray(ids) && ids.length <= 20 &&
      ids.every((i: unknown) => typeof i === 'string' && /^[a-z0-9_-]{1,32}$/i.test(i));
    if (!ok) {
      return res.status(400).json({ detail: 'interests must be an array of up to 20 short ids' });
    }
    updateFields.interests = [...new Set(ids as string[])];
  }

  for (const key of allowed) {
    if (patch[key] !== undefined) {
      updateFields[key] = patch[key];
    }
  }

  if (Object.keys(updateFields).length > 0) {
    await db.update(schema.users).set(updateFields).where(eq(schema.users.id, req.user.id));
  }

  const [updatedUser] = await db.select().from(schema.users).where(eq(schema.users.id, req.user.id)).limit(1);
  res.json({ user: toPublicUser(updatedUser) });
});

/**
 * @openapi
 * /users/me/referrals:
 *   get:
 *     summary: The caller's invite code and how many accounts it has brought in
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: Code and count
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 code: { type: string }
 *                 joined: { type: integer }
 *                 reward_days: { type: integer }
 */
// The code is assigned lazily here as well as at registration, so accounts created before
// referrals existed get one the first time they open the invite screen  no backfill needed.
router.get('/me/referrals', authenticateToken, async (req: Request, res: Response) => {
  const code = await assignReferralCode(req.user.id);
  const joined = await countReferrals(req.user.id);
  res.json({ code, joined, reward_days: REFERRAL_REWARD_DAYS });
});

/**
 * @openapi
 * /users/me/vouchers:
 *   get:
 *     summary: Get all available discount vouchers for the caller
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: List of available vouchers
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string }
 *                   discountPercentage: { type: integer }
 *                   tier: { type: integer }
 *                   createdAt: { type: string }
 */
router.get('/me/vouchers', authenticateToken, async (req: Request, res: Response) => {
  const availableVouchers = await db
    .select()
    .from(schema.vouchers)
    .where(
      and(
        eq(schema.vouchers.userId, req.user.id),
        eq(schema.vouchers.status, 'available')
      )
    );
  res.json(availableVouchers);
});

// Delete User Account and cleanup
router.delete('/me', authenticateToken, async (req: Request, res: Response) => {
  const uid = req.user.id;
  const phone = req.user.phone;

  // Manual deletions for non-strictly linked tables
  await db.delete(schema.otps).where(eq(schema.otps.phone, phone));
  // Before the provider rows go: the kyc_documents rows cascade off them, and once they are
  // gone there is no way left to find the identity documents those rows point at in storage.
  await deleteKycFilesOwnedBy(uid);
  // Covers listings filed under the user's id *and* under their provider id  see the helper.
  await deleteListingsOwnedBy(uid);
  // Cascading deletes on schema will clean up providers, bookings, and payments, but let's be explicit
  await db.delete(schema.providers).where(eq(schema.providers.userId, uid));
  await db.delete(schema.bookings).where(eq(schema.bookings.userId, uid));
  await db.delete(schema.payments).where(eq(schema.payments.userId, uid));
  await db.delete(schema.users).where(eq(schema.users.id, uid));

  res.json({ deleted: true });
});

/**
 * @openapi
 * /users/me/push-token:
 *   post:
 *     summary: Register this device's push token
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, platform]
 *             properties:
 *               token: { type: string }
 *               platform: { type: string, enum: [ios, android, web] }
 *     responses:
 *       200: { description: Registered }
 *   delete:
 *     summary: Remove a push token, e.g. on sign-out
 *     tags: [Users]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200: { description: Removed }
 */
// A token belongs to a device, and a device changes hands: if someone else signs in on the same
// phone the token moves to them, rather than leaving the previous account receiving their alerts.
router.post('/me/push-token', authenticateToken, async (req: Request, res: Response) => {
  const { token, platform } = req.body || {};
  if (typeof token !== 'string' || token.length < 10 || token.length > 300) {
    return res.status(400).json({ detail: 'A valid push token is required' });
  }
  if (!['ios', 'android', 'web'].includes(platform)) {
    return res.status(400).json({ detail: 'platform must be ios, android or web' });
  }
  const now = new Date().toISOString();
  await db.insert(schema.pushTokens)
    .values({ id: uuidv4(), userId: req.user.id, token, platform, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: schema.pushTokens.token,
      set: { userId: req.user.id, platform, updatedAt: now },
    });
  res.json({ ok: true });
});

router.delete('/me/push-token', authenticateToken, async (req: Request, res: Response) => {
  const token = typeof req.body?.token === 'string' ? req.body.token : String(req.query.token || '');
  if (!token) return res.status(400).json({ detail: 'token is required' });
  await db.delete(schema.pushTokens)
    .where(and(eq(schema.pushTokens.token, token), eq(schema.pushTokens.userId, req.user.id)));
  res.json({ ok: true });
});

export default router;
