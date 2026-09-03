import { describe, it, expect } from 'vitest';
import request from 'supertest';

import { app } from '../src/app';
import { db, schema } from '../src/db';
import { eq } from 'drizzle-orm';
import { registerUser, nextPhone } from './helpers';
import { normaliseCode } from '../src/lib/referrals';
import { REFERRAL_REWARD_DAYS } from '../src/config';

/**
 * Referrals: the reward the app has advertised since before anything could pay it out.
 *
 * The interesting cases are all abuse and all cheap to get wrong — self-referral, double
 * redemption, redeeming after the fact — so they are pinned here rather than left to the
 * happy path.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

async function codeFor(token: string): Promise<string> {
  const res = await request(app).get('/api/users/me/referrals').set('Authorization', `Bearer ${token}`);
  expect(res.status).toBe(200);
  return res.body.code;
}

async function expiryOf(userId: string): Promise<string | null> {
  const [row] = await db
    .select({ e: schema.users.supportExpiresAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return row?.e ?? null;
}

/** Registers a brand-new account quoting a code, without the support payment helpers. */
async function signUpWith(code: string | undefined, name: string) {
  const phone = nextPhone();
  const res = await request(app)
    .post('/api/auth/otp/verify')
    .send({ phone, otp: '123456', name, role: 'tourist', ...(code ? { referral_code: code } : {}) });
  expect(res.status).toBe(200);
  return { token: res.body.token as string, user: res.body.user, phone };
}

describe('invite codes', () => {
  it('gives every account a code, and the same one on every read', async () => {
    const { token } = await registerUser({ name: 'Code Holder' });
    const first = await codeFor(token);
    const second = await codeFor(token);

    expect(first).toMatch(/^[A-Z0-9]{6}$/);
    expect(second).toBe(first);
  });

  it('gives different accounts different codes', async () => {
    const a = await codeFor((await registerUser({ name: 'Ref A' })).token);
    const b = await codeFor((await registerUser({ name: 'Ref B' })).token);
    expect(a).not.toBe(b);
  });

  it('uses an alphabet with no lookalike characters', async () => {
    // A code is read aloud across a table; O/0 and I/1 are how that goes wrong.
    const code = await codeFor((await registerUser({ name: 'Readable' })).token);
    expect(code).not.toMatch(/[OISZ01]/);
  });

  it('normalises what people actually paste', () => {
    expect(normaliseCode('  ab2-c3d ')).toBe('AB2C3D');
    expect(normaliseCode('ASHA-1D')).toBe('ASHA1D');
    expect(normaliseCode('')).toBeNull();
    expect(normaliseCode(undefined)).toBeNull();
  });
});

describe('redeeming a code', () => {
  it('extends both sides and records the referral', async () => {
    const referrer = await registerUser({ name: 'Referrer' });
    const code = await codeFor(referrer.token);
    const before = await expiryOf(referrer.user.id);

    const referee = await signUpWith(code, 'Invited Friend');

    const after = await expiryOf(referrer.user.id);
    expect(Date.parse(after!) - Date.parse(before!)).toBeCloseTo(REFERRAL_REWARD_DAYS * DAY_MS, -4);

    // The invited account starts from nothing, so its pass runs from today.
    const refereeExpiry = await expiryOf(referee.user.id);
    expect(Date.parse(refereeExpiry!)).toBeGreaterThan(Date.now());

    const [row] = await db
      .select()
      .from(schema.referrals)
      .where(eq(schema.referrals.refereeId, referee.user.id));
    expect(row.referrerId).toBe(referrer.user.id);
    expect(row.rewardDays).toBe(REFERRAL_REWARD_DAYS);
  });

  it('accepts a code typed in lower case with punctuation', async () => {
    const referrer = await registerUser({ name: 'Sloppy Referrer' });
    const code = await codeFor(referrer.token);
    const before = await expiryOf(referrer.user.id);

    await signUpWith(`  ${code.toLowerCase()}- `, 'Sloppy Friend');

    expect(Date.parse((await expiryOf(referrer.user.id))!)).toBeGreaterThan(Date.parse(before!));
  });

  it('only lengthens a pass, never shortens one', async () => {
    // Monotonic, like the paid renewal: redeeming must not truncate access already held.
    const referrer = await registerUser({ name: 'Long Pass' });
    const code = await codeFor(referrer.token);
    const far = new Date(Date.now() + 900 * DAY_MS).toISOString();
    await db.update(schema.users).set({ supportExpiresAt: far }).where(eq(schema.users.id, referrer.user.id));

    await signUpWith(code, 'Late Friend');

    expect(Date.parse((await expiryOf(referrer.user.id))!)).toBeGreaterThan(Date.parse(far));
  });
});

describe('a code cannot be farmed', () => {
  it('refuses a code that does not exist, and still creates the account', async () => {
    // A mistyped code costs the reward, never the registration.
    const { token, user } = await signUpWith('ZZZZZZ', 'Typo Friend');
    expect(typeof token).toBe('string');
    const rows = await db.select().from(schema.referrals).where(eq(schema.referrals.refereeId, user.id));
    expect(rows).toHaveLength(0);
  });

  it('refuses self-referral', async () => {
    const me = await registerUser({ name: 'Self Referrer' });
    const code = await codeFor(me.token);
    const before = await expiryOf(me.user.id);

    // Signing in again with my own code is not a new account, so nothing is redeemed.
    const again = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: me.phone, otp: '123456', referral_code: code });
    expect(again.status).toBe(200);

    expect(await expiryOf(me.user.id)).toBe(before);
    const rows = await db.select().from(schema.referrals).where(eq(schema.referrals.refereeId, me.user.id));
    expect(rows).toHaveLength(0);
  });

  it('credits nothing on a returning sign-in, only at registration', async () => {
    const referrer = await registerUser({ name: 'Once Only' });
    const code = await codeFor(referrer.token);

    const friend = await signUpWith(code, 'Return Friend');
    const afterFirst = await expiryOf(referrer.user.id);

    // The friend signs in again, quoting the code a second time.
    const second = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: friend.phone, otp: '123456', referral_code: code });
    expect(second.status).toBe(200);

    expect(await expiryOf(referrer.user.id)).toBe(afterFirst);
    const rows = await db.select().from(schema.referrals).where(eq(schema.referrals.refereeId, friend.user.id));
    expect(rows).toHaveLength(1);
  });

  it('counts only real referrals', async () => {
    const referrer = await registerUser({ name: 'Counter' });
    const code = await codeFor(referrer.token);

    let res = await request(app).get('/api/users/me/referrals').set('Authorization', `Bearer ${referrer.token}`);
    expect(res.body.joined).toBe(0);

    await signUpWith(code, 'Friend One');
    await signUpWith(code, 'Friend Two');

    res = await request(app).get('/api/users/me/referrals').set('Authorization', `Bearer ${referrer.token}`);
    expect(res.body.joined).toBe(2);
    expect(res.body.reward_days).toBe(REFERRAL_REWARD_DAYS);
  });

  it('requires a token', async () => {
    const res = await request(app).get('/api/users/me/referrals');
    expect(res.status).toBe(401);
  });
});
