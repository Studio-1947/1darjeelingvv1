import { Router, Request, Response } from 'express';
import { createHash, createPublicKey, type JsonWebKeyInput } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { eq } from 'drizzle-orm';

import { db, schema } from '../db';
import { rateLimiter } from '../middleware/rateLimiter';
import { makeToken } from '../middleware/auth';
import { toPublicUser } from '../lib/publicUser';
import { APPLE_AUDIENCES, log } from '../config';

const router = Router();

/**
 * Sign in with Apple.
 *
 * App Store guideline 4.8: an app that offers a third-party login (aangan offers Google) must also
 * offer Sign in with Apple. The iPhone app gets an identity token from Apple and posts it here; it
 * is checked against Apple's published keys, for our bundle id, and turned into an aangan session.
 * Verifying needs no secret, only APPLE_CLIENT_IDS (defaults to the app's bundle id).
 */

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const KEYS_TTL_MS = 6 * 60 * 60 * 1000;

type AppleJwk = JsonWebKeyInput['key'] & { kid: string };
let keyCache: { keys: AppleJwk[]; at: number } | null = null;

async function appleKeys(forceRefresh = false): Promise<AppleJwk[]> {
  if (!forceRefresh && keyCache && Date.now() - keyCache.at < KEYS_TTL_MS) return keyCache.keys;
  const res = await fetch(APPLE_KEYS_URL, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Apple keys answered ${res.status}`);
  const json = (await res.json()) as { keys: AppleJwk[] };
  keyCache = { keys: json.keys, at: Date.now() };
  return json.keys;
}

type AppleClaims = { sub: string; email?: string; email_verified?: boolean | string; nonce?: string };

/** Exported for tests: verifies an Apple identity token and returns its claims. */
export async function verifyAppleToken(idToken: string, rawNonce?: string): Promise<AppleClaims> {
  const decoded = jwt.decode(idToken, { complete: true });
  const kid = decoded && typeof decoded === 'object' ? decoded.header.kid : undefined;
  if (!kid) throw new Error('token has no key id');

  let jwk = (await appleKeys()).find((k) => k.kid === kid);
  // Apple rotates keys; a token signed with a new one means our cache is stale.
  if (!jwk) jwk = (await appleKeys(true)).find((k) => k.kid === kid);
  if (!jwk) throw new Error('token signed with an unknown Apple key');

  const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
  const claims = jwt.verify(idToken, publicKey, {
    algorithms: ['RS256'],
    issuer: APPLE_ISSUER,
    audience: APPLE_AUDIENCES as [string, ...string[]],
  }) as AppleClaims;

  // The app sends Apple the SHA-256 of a one-time value and us the value itself, so a token
  // lifted from somewhere else cannot be replayed here.
  if (rawNonce !== undefined) {
    const expected = createHash('sha256').update(rawNonce).digest('hex');
    if (claims.nonce !== expected) throw new Error('nonce does not match');
  }
  return claims;
}

/**
 * @openapi
 * /auth/apple:
 *   post:
 *     summary: Sign in with Apple (iPhone app)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [identity_token]
 *             properties:
 *               identity_token: { type: string, description: "From AppleAuthentication.signInAsync" }
 *               raw_nonce: { type: string, description: "The value whose SHA-256 was sent to Apple as the nonce" }
 *               name: { type: string, description: "Apple shares the name on the first sign-in only" }
 *               role: { type: string, enum: [tourist, provider] }
 *     responses:
 *       200: { description: Signed in }
 *       400: { description: Invalid or expired token }
 */
router.post('/', rateLimiter(10, 60 * 1000, 'apple_auth'), async (req: Request, res: Response) => {
  const { identity_token, raw_nonce, name, role = 'tourist' } = req.body ?? {};
  if (typeof identity_token !== 'string' || !identity_token) {
    return res.status(400).json({ detail: 'identity_token is required' });
  }

  let claims: AppleClaims;
  try {
    claims = await verifyAppleToken(identity_token, typeof raw_nonce === 'string' ? raw_nonce : undefined);
  } catch (err) {
    log.error(`[auth/apple] token rejected: ${(err as Error).message}`);
    return res.status(400).json({ detail: 'Invalid or expired Apple sign-in. Please try again.' });
  }

  const roleToUse = ['tourist', 'provider'].includes(role) ? role : 'tourist';
  const syntheticPhone = `apple:${claims.sub}`;
  const email = claims.email && String(claims.email_verified) !== 'false' ? claims.email : null;

  // The Apple id is the stable key. An existing account with the same verified email (from OTP
  // sign-up plus a profile email, or from Google) is the same person and is reused.
  let [user] = await db.select().from(schema.users).where(eq(schema.users.phone, syntheticPhone)).limit(1);
  if (!user && email) {
    [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  }

  if (!user) {
    const displayName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 100) : 'Apple User';
    user = {
      id: uuidv4(),
      phone: syntheticPhone,
      name: displayName,
      role: roleToUse,
      providerPaid: false,
      email,
      language: null,
      avatar: null,
      createdAt: new Date().toISOString(),
      supportExpiresAt: null,
      password: null,
      phoneVerifiedAt: null,
      interests: [],
      referralCode: null,
    };
    await db.insert(schema.users).values(user);
    log.info(`[auth/apple] created user ${user.id}`);
  }

  const token = makeToken(user.id, user.phone, user.role);
  return res.json({ token, user: toPublicUser(user) });
});

export default router;
