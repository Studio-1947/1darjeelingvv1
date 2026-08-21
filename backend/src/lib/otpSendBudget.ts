import { sql } from 'drizzle-orm';
import { db } from '../db';
import {
  log,
  RATE_LIMIT_ENABLED,
  OTP_MAX_SENDS_PER_DAY,
  OTP_MAX_SENDS_PER_PHONE_PER_DAY,
} from '../config';

/**
 * Daily spend caps on OTP delivery.
 *
 * This is the durable half of the OTP rate limiting; middleware/rateLimiter.ts is the volatile
 * half. The middleware caps how FAST codes can be requested and forgets everything on restart.
 * This caps how MANY are sent in a day and remembers across deploys, because the thing it is
 * protecting is a bill rather than a brute-force window, and a bill does not reset when the
 * container does. See the config comment on OTP_MAX_SENDS_PER_DAY for why that distinction
 * starts to matter the moment MESSAGING_PROVIDER stops being `mock`.
 *
 * Counting is a reservation, taken before delivery is attempted and released if delivery fails:
 * an SMS that never went out should not consume the budget for one that would.
 */

export type OtpSendReservation =
  | { ok: true; release: () => Promise<void> }
  | { ok: false; scope: 'phone' | 'global'; limit: number; retryAfterSeconds: number };

/** UTC calendar day, 'YYYY-MM-DD'. UTC and not local time so the reset point does not move. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/** Seconds until the counters roll over, for the Retry-After header. */
export function secondsUntilUtcMidnight(now: Date): number {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((midnight - now.getTime()) / 1000));
}

/**
 * Increment one counter and return its new value.
 *
 * Written as a single INSERT ... ON CONFLICT DO UPDATE ... RETURNING so the read and the write
 * are one statement: two concurrent sends cannot both read 9, both write 10, and both proceed.
 * The increment happens before the comparison, which means a request that is over the limit still
 * advances the counter. That is harmless — it is already over — and it keeps the statement atomic.
 */
async function increment(scope: string, day: string): Promise<number> {
  const result = await db.execute(sql`
    INSERT INTO otp_send_counters (scope, day, count)
    VALUES (${scope}, ${day}, 1)
    ON CONFLICT (scope, day) DO UPDATE SET count = otp_send_counters.count + 1
    RETURNING count
  `);
  return Number((result as unknown as { rows: { count: number | string }[] }).rows[0].count);
}

async function decrement(scope: string, day: string): Promise<void> {
  await db.execute(sql`
    UPDATE otp_send_counters SET count = GREATEST(count - 1, 0)
    WHERE scope = ${scope} AND day = ${day}
  `);
}

/**
 * Yesterday's rows are dead weight — one per phone that ever requested a code. Swept on the first
 * send of each UTC day (the only moment the global counter comes back as 1), which is one delete
 * per day rather than a scheduled job to operate or a row that accumulates forever.
 */
async function sweepPreviousDays(day: string): Promise<void> {
  await db.execute(sql`DELETE FROM otp_send_counters WHERE day < ${day}`);
}

/**
 * Claim one OTP send against both the per-phone and the global daily budget.
 *
 * On success the caller MUST either let the send stand or call `release()` if delivery failed.
 *
 * @param opts.enabled overrides RATE_LIMIT_ENABLED. Same seam as rateLimiter's `opts.enabled`:
 *   the budget is off under APP_ENV=test, so tests that want to exercise it turn it on explicitly
 *   rather than every other test in the suite having to budget its OTPs.
 */
export async function reserveOtpSend(
  phone: string,
  opts: { enabled?: boolean; now?: Date } = {}
): Promise<OtpSendReservation> {
  const enabled = opts.enabled ?? RATE_LIMIT_ENABLED;
  if (!enabled) {
    return { ok: true, release: async () => {} };
  }

  const now = opts.now ?? new Date();
  const day = utcDay(now);
  const phoneScope = `phone:${phone}`;

  // Per-phone first: it is the limit a real person can plausibly hit, and hitting it should not
  // also spend from the global budget that protects everyone else.
  const phoneCount = await increment(phoneScope, day);
  if (phoneCount > OTP_MAX_SENDS_PER_PHONE_PER_DAY) {
    return {
      ok: false,
      scope: 'phone',
      limit: OTP_MAX_SENDS_PER_PHONE_PER_DAY,
      retryAfterSeconds: secondsUntilUtcMidnight(now),
    };
  }

  const globalCount = await increment('global', day);
  if (globalCount === 1) {
    await sweepPreviousDays(day);
  }
  if (globalCount > OTP_MAX_SENDS_PER_DAY) {
    // Give the per-phone unit back: this caller did nothing wrong and should not lose one of
    // their ten because the platform as a whole ran out.
    await decrement(phoneScope, day);
    // Loud, because by the time this fires every login on the platform is already failing. It is
    // either an attack in progress or a limit set below real traffic, and both need a human.
    log.error(
      `[otp] global daily send budget exhausted (${OTP_MAX_SENDS_PER_DAY}/day, UTC ${day}). ` +
      `No further OTPs will be sent today. Investigate before raising OTP_MAX_SENDS_PER_DAY.`
    );
    return {
      ok: false,
      scope: 'global',
      limit: OTP_MAX_SENDS_PER_DAY,
      retryAfterSeconds: secondsUntilUtcMidnight(now),
    };
  }

  return {
    ok: true,
    release: async () => {
      await decrement(phoneScope, day);
      await decrement('global', day);
    },
  };
}
