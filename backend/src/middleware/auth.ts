import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { JWT_SECRET } from '../config';

// OWASP's floor for PBKDF2-HMAC-SHA512. (The widely-quoted 600,000 is the SHA256 figure — using
// it here would be ~3x the intended work factor for no benefit.) Measured ~120ms per hash, which
// is fine for admin login: it happens rarely and is exactly the operation worth making slow.
const PBKDF2_DIGEST = 'sha512';
const PBKDF2_ITERATIONS = 210_000;
const PBKDF2_KEYLEN = 64;

// Hashes are self-describing — `pbkdf2$<digest>$<iterations>$<salt>$<hash>` — so the work factor
// can be raised later without locking out existing users: verification reads the parameters from
// the stored value rather than assuming today's constants.
const PREFIX = 'pbkdf2';

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length || bufA.length === 0) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST).toString('hex');
  return `${PREFIX}$${PBKDF2_DIGEST}$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  if (!storedHash) return false;

  if (storedHash.startsWith(`${PREFIX}$`)) {
    const [, digest, iterationsRaw, salt, expected] = storedHash.split('$');
    const iterations = Number(iterationsRaw);
    if (!digest || !Number.isInteger(iterations) || iterations <= 0 || !salt || !expected) return false;
    const keylen = Buffer.from(expected, 'hex').length;
    const actual = crypto.pbkdf2Sync(password, salt, iterations, keylen, digest).toString('hex');
    return timingSafeEqualHex(actual, expected);
  }

  // Legacy `salt:hash` at 1,000 iterations. Still accepted so existing admins can log in; that
  // login transparently re-hashes them (see needsRehash + routes/auth.ts).
  const [salt, originalHash] = storedHash.split(':');
  if (!salt || !originalHash) return false;
  const actual = crypto.pbkdf2Sync(password, salt, 1000, 64, PBKDF2_DIGEST).toString('hex');
  return timingSafeEqualHex(actual, originalHash);
}

/** True when a stored hash predates the current parameters and should be upgraded on next login. */
export function needsRehash(storedHash: string): boolean {
  return !storedHash?.startsWith(`${PREFIX}$${PBKDF2_DIGEST}$${PBKDF2_ITERATIONS}$`);
}

declare global {
  namespace Express {
    interface Request {
      user?: any;
    }
  }
}

export function makeToken(userId: string, phone: string, role: string): string {
  return jwt.sign({ sub: userId, phone, role }, JWT_SECRET, { expiresIn: '30d' });
}

export async function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ detail: 'Missing token' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (payload.sub === 'admin-system') {
      req.user = {
        id: 'admin-system',
        name: 'System Administrator',
        phone: 'admin',
        role: 'admin',
        createdAt: new Date().toISOString()
      };
      return next();
    }
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, payload.sub)).limit(1);
    if (!user) {
      return res.status(401).json({ detail: 'User not found' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ detail: 'Invalid token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ detail: 'Admin only' });
  }
  next();
}
