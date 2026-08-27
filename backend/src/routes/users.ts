import { Router, Request, Response } from 'express';
import { db, schema } from '../db';
import { REFERRAL_REWARD_DAYS } from '../config';
import { eq } from 'drizzle-orm';
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
// referrals existed get one the first time they open the invite screen — no backfill needed.
router.get('/me/referrals', authenticateToken, async (req: Request, res: Response) => {
  const code = await assignReferralCode(req.user.id);
  const joined = await countReferrals(req.user.id);
  res.json({ code, joined, reward_days: REFERRAL_REWARD_DAYS });
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
  // Covers listings filed under the user's id *and* under their provider id — see the helper.
  await deleteListingsOwnedBy(uid);
  // Cascading deletes on schema will clean up providers, bookings, and payments, but let's be explicit
  await db.delete(schema.providers).where(eq(schema.providers.userId, uid));
  await db.delete(schema.bookings).where(eq(schema.bookings.userId, uid));
  await db.delete(schema.payments).where(eq(schema.payments.userId, uid));
  await db.delete(schema.users).where(eq(schema.users.id, uid));

  res.json({ deleted: true });
});

export default router;
