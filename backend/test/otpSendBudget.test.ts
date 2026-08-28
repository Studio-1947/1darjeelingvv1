import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { db } from '../src/db';
import {
  reserveOtpSend,
  utcDay,
  secondsUntilUtcMidnight,
} from '../src/lib/otpSendBudget';
import { OTP_MAX_SENDS_PER_DAY, OTP_MAX_SENDS_PER_PHONE_PER_DAY } from '../src/config';

// The budget is off under APP_ENV=test (it follows RATE_LIMIT_ENABLED), so every call here passes
// `enabled: true` — the same seam middleware/rateLimiter.ts uses to stay testable without making
// every other test file account for its OTP spend.
const ON = { enabled: true };

async function countFor(scope: string, day: string): Promise<number> {
  const result = await db.execute(
    sql`SELECT count FROM otp_send_counters WHERE scope = ${scope} AND day = ${day}`
  );
  const rows = (result as unknown as { rows: { count: number | string }[] }).rows;
  return rows.length ? Number(rows[0].count) : 0;
}

describe('utcDay / secondsUntilUtcMidnight', () => {
  it('keys on the UTC calendar day, not the local one', () => {
    // 23:30 UTC on the 5th is already the 6th in IST (UTC+5:30). The counter must not roll over
    // early for an Indian operator, or late — the reset point has to be one fixed instant.
    expect(utcDay(new Date('2026-08-05T23:30:00.000Z'))).toBe('2026-08-05');
    expect(utcDay(new Date('2026-08-06T00:00:00.000Z'))).toBe('2026-08-06');
  });

  it('reports the seconds left until the counters roll over', () => {
    expect(secondsUntilUtcMidnight(new Date('2026-08-05T23:59:00.000Z'))).toBe(60);
    expect(secondsUntilUtcMidnight(new Date('2026-08-05T00:00:00.000Z'))).toBe(24 * 60 * 60);
  });

  it('never reports zero, so Retry-After is always a usable instruction', () => {
    expect(secondsUntilUtcMidnight(new Date('2026-08-05T23:59:59.999Z'))).toBeGreaterThan(0);
  });
});

describe('per-phone daily budget', () => {
  it('allows exactly the configured number of sends, then refuses', async () => {
    const phone = '+919000010001';
    const now = new Date('2026-08-05T10:00:00.000Z');

    for (let i = 0; i < OTP_MAX_SENDS_PER_PHONE_PER_DAY; i++) {
      const verdict = await reserveOtpSend(phone, { ...ON, now });
      expect(verdict.ok, `send ${i + 1} of ${OTP_MAX_SENDS_PER_PHONE_PER_DAY} should be allowed`).toBe(true);
    }

    const overflow = await reserveOtpSend(phone, { ...ON, now });
    expect(overflow.ok).toBe(false);
    if (overflow.ok) return;
    expect(overflow.scope).toBe('phone');
    expect(overflow.limit).toBe(OTP_MAX_SENDS_PER_PHONE_PER_DAY);
    expect(overflow.retryAfterSeconds).toBe(secondsUntilUtcMidnight(now));
  });

  it('budgets each phone separately — one number cannot exhaust another', async () => {
    const now = new Date('2026-08-05T10:00:00.000Z');
    const victim = '+919000010002';
    const other = '+919000010003';

    for (let i = 0; i < OTP_MAX_SENDS_PER_PHONE_PER_DAY + 3; i++) {
      await reserveOtpSend(victim, { ...ON, now });
    }

    expect((await reserveOtpSend(other, { ...ON, now })).ok).toBe(true);
  });

  it('rolls over at the UTC day boundary', async () => {
    const phone = '+919000010004';
    const day1 = new Date('2026-08-05T23:59:00.000Z');
    const day2 = new Date('2026-08-06T00:01:00.000Z');

    for (let i = 0; i < OTP_MAX_SENDS_PER_PHONE_PER_DAY; i++) {
      await reserveOtpSend(phone, { ...ON, now: day1 });
    }
    expect((await reserveOtpSend(phone, { ...ON, now: day1 })).ok).toBe(false);

    // Two minutes later, on the other side of midnight, the same number is welcome again.
    expect((await reserveOtpSend(phone, { ...ON, now: day2 })).ok).toBe(true);
  });

  it('survives a restart — the count is in the database, not in the process', async () => {
    const phone = '+919000010005';
    const now = new Date('2026-08-05T10:00:00.000Z');

    for (let i = 0; i < OTP_MAX_SENDS_PER_PHONE_PER_DAY; i++) {
      await reserveOtpSend(phone, { ...ON, now });
    }

    // There is no in-memory state to clear, which is the whole point: the assertion is that the
    // stored counter alone is enough to keep refusing. A redeploy changes nothing here.
    expect(await countFor(`phone:${phone}`, utcDay(now))).toBe(OTP_MAX_SENDS_PER_PHONE_PER_DAY);
    expect((await reserveOtpSend(phone, { ...ON, now })).ok).toBe(false);
  });
});

describe('global daily budget', () => {
  it('refuses once the platform-wide ceiling is reached, whatever the phone', async () => {
    const now = new Date('2026-08-05T10:00:00.000Z');
    const day = utcDay(now);

    // Seeding the global row directly rather than making OTP_MAX_SENDS_PER_DAY real calls: the
    // ceiling is 1000 by default and the behaviour under test is the comparison, not the loop.
    await db.execute(sql`
      INSERT INTO otp_send_counters (scope, day, count) VALUES ('global', ${day}, ${OTP_MAX_SENDS_PER_DAY})
    `);

    const verdict = await reserveOtpSend('+919000020001', { ...ON, now });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.scope).toBe('global');
    expect(verdict.limit).toBe(OTP_MAX_SENDS_PER_DAY);
  });

  it('refunds the per-phone unit when the global budget is what ran out', async () => {
    const now = new Date('2026-08-05T10:00:00.000Z');
    const day = utcDay(now);
    const phone = '+919000020002';

    await db.execute(sql`
      INSERT INTO otp_send_counters (scope, day, count) VALUES ('global', ${day}, ${OTP_MAX_SENDS_PER_DAY})
    `);

    await reserveOtpSend(phone, { ...ON, now });

    // The caller did nothing wrong. Losing one of their ten because the platform as a whole was
    // out would turn a global outage into a lingering per-user penalty that outlives it.
    expect(await countFor(`phone:${phone}`, day)).toBe(0);
  });
});

describe('reservations', () => {
  it('release() hands back both units, so a failed delivery costs nothing', async () => {
    const now = new Date('2026-08-05T10:00:00.000Z');
    const day = utcDay(now);
    const phone = '+919000030001';

    const verdict = await reserveOtpSend(phone, { ...ON, now });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;

    expect(await countFor(`phone:${phone}`, day)).toBe(1);
    const globalAfterReserve = await countFor('global', day);

    await verdict.release();

    expect(await countFor(`phone:${phone}`, day)).toBe(0);
    expect(await countFor('global', day)).toBe(globalAfterReserve - 1);
  });

  it('never lets a counter go negative', async () => {
    const now = new Date('2026-08-05T10:00:00.000Z');
    const day = utcDay(now);
    const phone = '+919000030002';

    const verdict = await reserveOtpSend(phone, { ...ON, now });
    if (!verdict.ok) throw new Error('expected the first send of the day to be allowed');

    // A double release should not manufacture budget. GREATEST(count - 1, 0) is what stops a
    // retry path that released twice from handing out free sends for the rest of the day.
    await verdict.release();
    await verdict.release();

    expect(await countFor(`phone:${phone}`, day)).toBe(0);
  });

  it('is a no-op when disabled, and touches no rows at all', async () => {
    const now = new Date('2026-08-05T10:00:00.000Z');
    const phone = '+919000030003';

    for (let i = 0; i < OTP_MAX_SENDS_PER_PHONE_PER_DAY + 5; i++) {
      const verdict = await reserveOtpSend(phone, { enabled: false, now });
      expect(verdict.ok).toBe(true);
    }

    expect(await countFor(`phone:${phone}`, utcDay(now))).toBe(0);
  });
});

describe('housekeeping', () => {
  it('sweeps previous days on the first send of a new one', async () => {
    const yesterday = new Date('2026-08-05T10:00:00.000Z');
    const today = new Date('2026-08-06T10:00:00.000Z');

    await reserveOtpSend('+919000040001', { ...ON, now: yesterday });
    expect(await countFor('global', utcDay(yesterday))).toBe(1);

    // The first send of a new UTC day is the one moment the global counter comes back as 1, which
    // is what triggers the sweep — no scheduled job, and no row per phone accumulating forever.
    await reserveOtpSend('+919000040002', { ...ON, now: today });

    expect(await countFor('global', utcDay(yesterday))).toBe(0);
    expect(await countFor('phone:+919000040001', utcDay(yesterday))).toBe(0);
    expect(await countFor('global', utcDay(today))).toBe(1);
  });
});
