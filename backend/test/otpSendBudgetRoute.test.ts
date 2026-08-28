import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { sql } from 'drizzle-orm';

// POST /api/auth/otp/send consults the daily budget only when rate limiting is on, and rate
// limiting is off under APP_ENV=test so the rest of the suite can request codes freely. This file
// turns it on for its own module graph — vi.stubEnv + vi.resetModules() + dynamic import, the same
// approach as otpRealProvider.test.ts, and safe because vitest gives each file its own graph.
//
// The per-minute limiters (5/min per IP, 3/min per phone) come on with it, so the daily ceiling is
// reached by seeding the counter row rather than by sending eleven times — eleven requests would
// trip the per-minute limiter first and prove nothing about the daily one.

// Pulled in statically: neither depends on RATE_LIMIT_ENABLED, so the copy from the test file's
// own module graph is the same one the re-imported route will use.
import { OTP_MAX_SENDS_PER_PHONE_PER_DAY } from '../src/config';
import { utcDay } from '../src/lib/otpSendBudget';

let app: typeof import('../src/app').app;
let budgetDb: typeof import('../src/db').db;
let budgetPool: { end: () => Promise<void> };
let setProviderForTests: typeof import('../src/messaging').setProviderForTests;

// Sequential, and given room beyond the 15s global hookTimeout: re-importing the whole app graph
// costs real time on a cold cache, and doing it in parallel was what tipped it over.
beforeAll(async () => {
  vi.stubEnv('RATE_LIMIT_ENABLED', 'true');
  vi.resetModules();

  const appModule = await import('../src/app');
  const dbModule = await import('../src/db');
  const messagingModule = await import('../src/messaging');

  app = appModule.app;
  budgetDb = dbModule.db;
  budgetPool = dbModule.pool;
  setProviderForTests = messagingModule.setProviderForTests;
}, 60_000);

afterAll(async () => {
  vi.unstubAllEnvs();
  // The dynamic re-import above opened a second pg Pool against the same database; test/setup.ts
  // closes the one from its own static import, not this one.
  await budgetPool.end();
});

async function seedPhoneCounter(phone: string, count: number) {
  const day = utcDay(new Date());
  await budgetDb.execute(sql`
    INSERT INTO otp_send_counters (scope, day, count) VALUES (${`phone:${phone}`}, ${day}, ${count})
    ON CONFLICT (scope, day) DO UPDATE SET count = ${count}
  `);
}

async function counterFor(scope: string): Promise<number> {
  const day = utcDay(new Date());
  const result = await budgetDb.execute(
    sql`SELECT count FROM otp_send_counters WHERE scope = ${scope} AND day = ${day}`
  );
  const rows = (result as unknown as { rows: { count: number | string }[] }).rows;
  return rows.length ? Number(rows[0].count) : 0;
}

describe('POST /auth/otp/send daily budget', () => {
  it('sends normally while the number is under its daily budget', async () => {
    const phone = '+919100010001';

    const res = await request(app).post('/api/auth/otp/send').send({ phone });

    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
    expect(await counterFor(`phone:${phone}`)).toBe(1);
  });

  it('refuses with 429 and a Retry-After once the number is out of budget', async () => {
    const phone = '+919100010002';
    await seedPhoneCounter(phone, OTP_MAX_SENDS_PER_PHONE_PER_DAY);

    const res = await request(app).post('/api/auth/otp/send').send({ phone });

    expect(res.status).toBe(429);
    expect(res.body.detail).toMatch(/for this number today/i);
    // Without this the client has no way to tell a one-minute limit from a one-day one, and the
    // login screen's resend countdown would offer a retry that cannot succeed.
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('issues no OTP row when the send is refused', async () => {
    const phone = '+919100010003';
    await seedPhoneCounter(phone, OTP_MAX_SENDS_PER_PHONE_PER_DAY);

    await request(app).post('/api/auth/otp/send').send({ phone });

    const stored = await budgetDb.execute(sql`SELECT phone FROM otps WHERE phone = ${phone}`);
    expect((stored as unknown as { rows: unknown[] }).rows).toHaveLength(0);
  });

  it('refunds the reservation when the provider fails, so an outage costs no budget', async () => {
    const phone = '+919100010004';
    const previous = setProviderForTests({
      name: 'failing-provider',
      init() {},
      async sendOtp() {
        throw new Error('simulated provider outage');
      },
    });

    try {
      const res = await request(app).post('/api/auth/otp/send').send({ phone });
      expect(res.status).toBe(502);
    } finally {
      setProviderForTests(previous);
    }

    // The user asked for a code and got nothing. Charging them one of their ten for it would mean
    // a provider having a bad hour quietly locks people out for the rest of the day.
    expect(await counterFor(`phone:${phone}`)).toBe(0);
    expect(await counterFor('global')).toBe(0);
  });
});
