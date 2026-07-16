import { Router, Request, Response } from 'express';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';

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
  res.json({ user: updatedUser });
});

// Delete User Account and cleanup
router.delete('/me', authenticateToken, async (req: Request, res: Response) => {
  const uid = req.user.id;
  const phone = req.user.phone;

  // Manual deletions for non-strictly linked tables
  await db.delete(schema.otps).where(eq(schema.otps.phone, phone));
  await db.delete(schema.listings).where(eq(schema.listings.providerId, uid));
  // Cascading deletes on schema will clean up providers, bookings, and payments, but let's be explicit
  await db.delete(schema.providers).where(eq(schema.providers.userId, uid));
  await db.delete(schema.bookings).where(eq(schema.bookings.userId, uid));
  await db.delete(schema.payments).where(eq(schema.payments.userId, uid));
  await db.delete(schema.users).where(eq(schema.users.id, uid));

  res.json({ deleted: true });
});

export default router;
