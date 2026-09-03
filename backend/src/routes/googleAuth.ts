import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Client } from 'google-auth-library';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { rateLimiter } from '../middleware/rateLimiter';
import { makeToken } from '../middleware/auth';
import { toPublicUser } from '../lib/publicUser';
import { log } from '../config';
import {
  GOOGLE_WEB_CLIENT_ID,
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
} from '../config';

const router = Router();

/**
 * Collect every Google client ID this server trusts. When a token arrives the SDK
 * picks the correct audience from this list automatically, so we do not need to
 * know which platform sent it — only that it was one of ours.
 */
const GOOGLE_CLIENT_IDS: string[] = [
  GOOGLE_WEB_CLIENT_ID,
  GOOGLE_ANDROID_CLIENT_ID,
  GOOGLE_IOS_CLIENT_ID,
].filter(Boolean);

const googleClient = GOOGLE_CLIENT_IDS.length > 0
  ? new OAuth2Client()
  : null;

/**
 * @openapi
 * /auth/google:
 *   post:
 *     summary: Sign in or register with a Google ID token
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idToken]
 *             properties:
 *               idToken: { type: string, description: "Google ID token from the client" }
 *               role: { type: string, enum: [tourist, provider], default: tourist }
 *     responses:
 *       200:
 *         description: Login success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 user: { $ref: '#/components/schemas/User' }
 *       400:
 *         description: Invalid or missing token
 *       502:
 *         description: Google verification failed
 */
router.post(
  '/',
  rateLimiter(10, 60 * 1000, 'google_auth'),
  async (req: Request, res: Response) => {
    const { idToken, role = 'tourist' } = req.body;

    if (!idToken) {
      return res.status(400).json({ detail: 'Google ID token is required' });
    }

    if (!googleClient) {
      log.error('[auth/google] Google OAuth is not configured — GOOGLE_WEB_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID, and GOOGLE_IOS_CLIENT_ID are all unset');
      return res.status(503).json({ detail: 'Google sign-in is not configured on this server' });
    }

    let payload: {
      sub: string;
      email?: string;
      name?: string;
      picture?: string;
    };

    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: GOOGLE_CLIENT_IDS,
      });
      const claims = ticket.getPayload();
      if (!claims) {
        return res.status(400).json({ detail: 'Invalid Google token' });
      }
      payload = {
        sub: claims.sub,
        email: claims.email,
        name: claims.name,
        picture: claims.picture,
      };
    } catch (err) {
      log.error(`[auth/google] Token verification failed: ${(err as Error).message}`);
      return res.status(400).json({ detail: 'Invalid or expired Google token' });
    }

    const SELF_ASSIGNABLE_ROLES = ['tourist', 'provider'];
    const roleToUse = SELF_ASSIGNABLE_ROLES.includes(role) ? role : 'tourist';

    // Look up by email — Google accounts are identified by email, not phone.
    // A user who signed up via OTP has their email set if they added one in profile.
    // A Google-only user gets a synthetic phone to satisfy the unique constraint.
    let [user] = payload.email
      ? await db.select().from(schema.users).where(eq(schema.users.email, payload.email)).limit(1)
      : [];

    if (!user) {
      // For a brand-new Google user, create an account. The phone field is required
      // by the schema, so use a google-prefixed synthetic value that will never
      // collide with a real number and will be obvious in the database.
      const syntheticPhone = `google:${payload.sub}`;
      const displayName = payload.name || 'Google User';

      user = {
        id: uuidv4(),
        phone: syntheticPhone,
        name: displayName,
        role: roleToUse,
        providerPaid: false,
        email: payload.email ?? null,
        language: null,
        avatar: payload.picture ?? null,
        createdAt: new Date().toISOString(),
        supportExpiresAt: null,
        password: null,
        referralCode: null,
      };

      await db.insert(schema.users).values(user);
      log.info(`[auth/google] Created new user ${user.id} via Google (${payload.email ?? 'no email'})`);
    } else {
      // Returning user — update avatar from Google if it changed.
      if (payload.picture && payload.picture !== user.avatar) {
        await db.update(schema.users)
          .set({ avatar: payload.picture })
          .where(eq(schema.users.id, user.id));
        user = { ...user, avatar: payload.picture };
      }
    }

    const token = makeToken(user.id, user.phone, user.role);
    return res.json({ token, user: toPublicUser(user) });
  }
);

export default router;
