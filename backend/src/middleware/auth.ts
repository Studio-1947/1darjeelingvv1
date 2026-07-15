import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { JWT_SECRET } from '../config';

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, originalHash] = storedHash.split(':');
  if (!salt || !originalHash) return false;
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return hash === originalHash;
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
