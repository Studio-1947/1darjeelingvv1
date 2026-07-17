import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import request from 'supertest';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { eq } from 'drizzle-orm';
import { hashPassword, verifyPassword, needsRehash } from '../src/middleware/auth';

/** Reproduces the pre-2026-07-17 format exactly: `salt:hash`, PBKDF2-SHA512 @ 1,000 iterations. */
function legacyHash(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

describe('password hashing', () => {
  it('round-trips a password', () => {
    const stored = hashPassword('correct horse battery staple');
    expect(verifyPassword('correct horse battery staple', stored)).toBe(true);
  });

  it('rejects a wrong password', () => {
    const stored = hashPassword('correct horse battery staple');
    expect(verifyPassword('Correct Horse Battery Staple', stored)).toBe(false);
    expect(verifyPassword('', stored)).toBe(false);
  });

  it('stores parameters in the hash so the work factor can change later', () => {
    const stored = hashPassword('pw');
    expect(stored.startsWith('pbkdf2$sha512$210000$')).toBe(true);
    expect(stored.split('$')).toHaveLength(5);
  });

  it('uses a fresh salt per hash', () => {
    expect(hashPassword('same')).not.toBe(hashPassword('same'));
  });

  it('still verifies legacy 1,000-iteration hashes (no lockout on upgrade)', () => {
    const stored = legacyHash('old-admin-password');
    expect(verifyPassword('old-admin-password', stored)).toBe(true);
    expect(verifyPassword('wrong', stored)).toBe(false);
  });

  it('flags legacy hashes for rehash and current ones as fine', () => {
    expect(needsRehash(legacyHash('x'))).toBe(true);
    expect(needsRehash(hashPassword('x'))).toBe(false);
  });

  it('rejects malformed stored values instead of throwing', () => {
    expect(verifyPassword('pw', '')).toBe(false);
    expect(verifyPassword('pw', 'garbage')).toBe(false);
    expect(verifyPassword('pw', 'pbkdf2$sha512$notanumber$salt$hash')).toBe(false);
    expect(verifyPassword('pw', 'pbkdf2$sha512$210000$')).toBe(false);
  });
});

describe('admin login hash upgrade', () => {
  it('logs a legacy-hashed admin in and transparently upgrades their stored hash', async () => {
    const phone = '+919700000001';
    const password = 'legacy-admin-pw';
    const id = uuidv4();

    await db.insert(schema.users).values({
      id,
      phone,
      name: 'Legacy Admin',
      role: 'admin',
      providerPaid: false,
      email: null,
      language: null,
      avatar: null,
      createdAt: new Date().toISOString(),
      password: legacyHash(password),
    });

    const [before] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    expect(needsRehash(before.password!)).toBe(true);

    const res = await request(app).post('/api/auth/admin/login').send({ phone, password });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();

    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    expect(needsRehash(after.password!)).toBe(false);
    // Upgraded in place — the same password must still work against the new hash.
    expect(verifyPassword(password, after.password!)).toBe(true);

    const again = await request(app).post('/api/auth/admin/login').send({ phone, password });
    expect(again.status).toBe(200);
  });

  it('does not upgrade (or admit) on a failed login', async () => {
    const phone = '+919700000002';
    const id = uuidv4();
    const stored = legacyHash('right-pw');

    await db.insert(schema.users).values({
      id,
      phone,
      name: 'Legacy Admin 2',
      role: 'admin',
      providerPaid: false,
      email: null,
      language: null,
      avatar: null,
      createdAt: new Date().toISOString(),
      password: stored,
    });

    const res = await request(app).post('/api/auth/admin/login').send({ phone, password: 'wrong-pw' });
    expect(res.status).toBe(401);

    const [after] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
    expect(after.password).toBe(stored);
  });
});
