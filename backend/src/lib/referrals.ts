import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

import { db, schema } from '../db';
import { log, REFERRAL_REWARD_DAYS } from '../config';

/**
 * Invite codes and what redeeming one is worth.
 *
 * The app has advertised "bring a friend, both travel longer" since before anything could
 * honour it: the code was derived client-side from the user's first name, nothing recorded a
 * redemption, and no reward was ever applied. This is the other half.
 *
 * Two rules shape everything here:
 *
 *  1. **A referral is recorded once, at signup, and never again.** `referrals.referee_id` is
 *     unique at the DB level, so two concurrent registrations quoting the same code cannot both
 *     be credited, and a user cannot be "re-referred" later to farm another reward.
 *  2. **A reward can only lengthen a pass.** Both sides go through the same monotonic extension
 *     the paid renewal uses, so redeeming can never shorten access someone already had.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Unambiguous when read aloud or off a screen: no O/0, I/1, S/5, or Z/2, which is the whole
 * point of a code a traveller reads to a friend across a table. Z was the one pair that got
 * missed — its own test caught it, but only on the ~18% of runs that happened to draw a Z.
 * 29^6 is ~6e8 — sparse enough that the retry loop below effectively never runs twice at this
 * app's scale.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXY2346789';
const CODE_LENGTH = 6;

function randomCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

/**
 * Normalises a code as typed. People send these over WhatsApp, so they arrive with stray
 * spaces, in lower case, and sometimes with the old `NAME-1D` shape pasted around them.
 */
export function normaliseCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Mints a code that is not already taken.
 *
 * The uniqueness that matters is the DB constraint, not this loop: two registrations can
 * generate the same string between the check and the insert. Callers must treat a unique
 * violation on insert as "try again", which is what `assignReferralCode` does.
 */
export async function generateReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = randomCode();
    const [taken] = await db
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.referralCode, code))
      .limit(1);
    if (!taken) return code;
  }
  // Astronomically unlikely at any realistic user count; a loud failure beats an ambiguous code.
  throw new Error('[referrals] could not generate an unused referral code after 8 attempts');
}

/**
 * Gives a user a code if they do not have one, and returns it.
 *
 * Idempotent, and safe to call on every read of the referral screen — which is how accounts
 * created before this feature existed get one, without a backfill migration that would have to
 * generate a million unique strings in a single statement.
 */
export async function assignReferralCode(userId: string): Promise<string> {
  const [existing] = await db
    .select({ code: schema.users.referralCode })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  if (existing?.code) return existing.code;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = await generateReferralCode();
    try {
      await db.update(schema.users).set({ referralCode: code }).where(eq(schema.users.id, userId));
      return code;
    } catch (err) {
      // Unique violation: someone else took this string in the gap. Try another.
      if (attempt === 4) throw err;
    }
  }
  throw new Error('[referrals] could not assign a referral code');
}

/** Monotonic, exactly like computeSupportExpiry — a reward may only push the expiry outwards. */
function extendedExpiry(existing: string | null | undefined, days: number, now: Date): string {
  const nowMs = now.getTime();
  const existingMs = existing ? Date.parse(existing) : NaN;
  const base = Number.isNaN(existingMs) || existingMs < nowMs ? nowMs : existingMs;
  return new Date(base + days * DAY_MS).toISOString();
}

export interface RedemptionResult {
  ok: boolean;
  /** Why it was declined. Server-side only — the route never blocks a signup on this. */
  reason?: 'unknown_code' | 'self_referral' | 'already_referred';
  rewardDays?: number;
}

/**
 * Applies a code to a newly created account.
 *
 * **Never throws, and never blocks registration.** This runs inside the signup path, after the
 * account exists. A mistyped code, a race, or a database hiccup must cost the user their reward
 * at worst — not their account. Every decline is returned as a reason and logged, so a support
 * question has an answer.
 */
export async function redeemReferralCode(
  refereeId: string,
  rawCode: unknown,
  now: Date = new Date()
): Promise<RedemptionResult> {
  const code = normaliseCode(rawCode);
  if (!code) return { ok: false, reason: 'unknown_code' };

  try {
    const [referrer] = await db
      .select({ id: schema.users.id, supportExpiresAt: schema.users.supportExpiresAt })
      .from(schema.users)
      .where(eq(schema.users.referralCode, code))
      .limit(1);

    if (!referrer) return { ok: false, reason: 'unknown_code' };
    // Reading your own code back to yourself is not a referral.
    if (referrer.id === refereeId) return { ok: false, reason: 'self_referral' };

    const [already] = await db
      .select({ id: schema.referrals.id })
      .from(schema.referrals)
      .where(eq(schema.referrals.refereeId, refereeId))
      .limit(1);
    if (already) return { ok: false, reason: 'already_referred' };

    const [referee] = await db
      .select({ id: schema.users.id, supportExpiresAt: schema.users.supportExpiresAt })
      .from(schema.users)
      .where(eq(schema.users.id, refereeId))
      .limit(1);
    if (!referee) return { ok: false, reason: 'unknown_code' };

    const days = REFERRAL_REWARD_DAYS;

    // The ledger row goes in FIRST. Its unique constraint on referee_id is what makes this safe
    // under concurrency: if a second request slipped past the check above, this insert fails and
    // no reward is applied twice.
    await db.insert(schema.referrals).values({
      id: uuidv4(),
      referrerId: referrer.id,
      refereeId,
      code,
      rewardDays: days,
      createdAt: now.toISOString(),
    });

    await db
      .update(schema.users)
      .set({ supportExpiresAt: extendedExpiry(referrer.supportExpiresAt, days, now) })
      .where(eq(schema.users.id, referrer.id));
    await db
      .update(schema.users)
      .set({ supportExpiresAt: extendedExpiry(referee.supportExpiresAt, days, now) })
      .where(eq(schema.users.id, refereeId));

    log.info(`[referrals] ${code} redeemed — both sides extended by ${days} days`);
    return { ok: true, rewardDays: days };
  } catch (err) {
    // Includes the unique-violation race above, which is a correct outcome, not a fault.
    log.error(`[referrals] could not redeem "${code}": ${(err as Error).message}`);
    return { ok: false, reason: 'already_referred' };
  }
}

/** How many accounts this user has actually brought in. */
export async function countReferrals(referrerId: string): Promise<number> {
  const rows = await db
    .select({ id: schema.referrals.id })
    .from(schema.referrals)
    .where(eq(schema.referrals.referrerId, referrerId));
  return rows.length;
}
