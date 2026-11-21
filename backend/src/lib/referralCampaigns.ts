import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';

import { db, schema } from '../db';
import { log } from '../config';
import { CODE_PREFIX, extendedExpiry } from './referrals';

/**
 * Referral codes the aangan team makes (admin → Referrals): "amitAangan26" for Amit, "MIRIKPOSTER"
 * for a poster run. Every account that signs up with one is recorded once, so the report can say
 * how many travellers and hosts each code brought, of which business type, and how many went live.
 *
 * They sit beside the codes every user has (lib/referrals.ts) and never replace them: a code typed
 * at sign-up is looked up here first, and only when it is not a campaign code does it go on to the
 * friend-referral rules.
 */

export type Audience = 'any' | 'traveller' | 'host';
export const AUDIENCES: Audience[] = ['any', 'traveller', 'host'];
export const CODE_MIN = 4;
/** The longest code the app carries in a link or a sign-in field (frontend cleanRef). */
export const CODE_MAX = 20;
export const MAX_REWARD_DAYS = 365;

/** "amit-Aangan26 " → "AMITAANGAN26": how two spellings of one code are matched. */
export function campaignKey(raw: unknown): string {
  return typeof raw === 'string' ? raw.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
}

/** A code as an admin types it: letters, digits and dashes, 4 to 20 of them. */
export function checkCustomCode(raw: unknown): { code: string; key: string } | { error: string } {
  if (typeof raw !== 'string') return { error: 'Write the code' };
  const code = raw.trim();
  if (!/^[A-Za-z0-9-]+$/.test(code)) return { error: 'Use only letters, numbers and dashes in the code' };
  const key = campaignKey(code);
  if (key.length < CODE_MIN || code.length > CODE_MAX) return { error: `The code must be ${CODE_MIN} to ${CODE_MAX} characters` };
  // A member's own code reads ANG26-XXXXXX; one shaped like it would be read as a friend referral.
  if (key.startsWith(CODE_PREFIX) && key.length === CODE_PREFIX.length + 6) return { error: 'That looks like a member\'s own code. Choose another.' };
  return { code, key };
}

const ALPHABET = 'ABCDEFGHJKLMNPQRTUVWXY2346789';
/** A code for when the admin leaves it empty: AANGAN- and five letters, easy to read out. */
export function randomCampaignCode(): string {
  const bytes = crypto.randomBytes(5);
  let out = '';
  for (let i = 0; i < 5; i += 1) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `AANGAN-${out}`;
}

/** True when the code is already a campaign code or matches a member's own code. */
export async function codeTaken(key: string): Promise<boolean> {
  const [campaign] = await db.select({ id: schema.referralCampaigns.id }).from(schema.referralCampaigns)
    .where(eq(schema.referralCampaigns.codeKey, key)).limit(1);
  if (campaign) return true;
  // A bare six-character code is how a member's code was shared before the prefix (referrals.ts).
  const memberKeys = key.length === 6 ? [key, `${CODE_PREFIX}${key}`] : [key];
  const [member] = await db.select({ id: schema.users.id }).from(schema.users)
    .where(sql`upper(regexp_replace(coalesce(${schema.users.referralCode}, ''), '[^A-Za-z0-9]', '', 'g')) in (${sql.join(memberKeys.map((k) => sql`${k}`), sql`, `)})`)
    .limit(1);
  return !!member;
}

export interface CampaignResult {
  /** The code is a campaign code (whether or not it counted). False: try it as a friend's code. */
  matched: boolean;
  recorded: boolean;
  reason?: 'paused' | 'ended' | 'full' | 'wrong_audience' | 'already_recorded';
  rewardDays?: number;
}

/**
 * Records a new account against the campaign code it signed up with.
 *
 * **Never throws and never blocks sign-up**, like redeemReferralCode: a paused code, a full one or
 * a database hiccup costs the count at worst, not the account.
 */
export async function recordCampaignSignup(userId: string, rawCode: unknown, joinedAs: 'traveller' | 'host', now = new Date()): Promise<CampaignResult> {
  const key = campaignKey(rawCode);
  if (!key) return { matched: false, recorded: false };
  try {
    const [c] = await db.select().from(schema.referralCampaigns).where(eq(schema.referralCampaigns.codeKey, key)).limit(1);
    if (!c) return { matched: false, recorded: false };
    if (!c.active) return { matched: true, recorded: false, reason: 'paused' };
    if (c.endsAt && Date.parse(c.endsAt) < now.getTime()) return { matched: true, recorded: false, reason: 'ended' };
    if (c.audience !== 'any' && c.audience !== joinedAs) return { matched: true, recorded: false, reason: 'wrong_audience' };
    if (c.maxUses != null) {
      const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.campaignSignups).where(eq(schema.campaignSignups.campaignId, c.id));
      if (n >= c.maxUses) return { matched: true, recorded: false, reason: 'full' };
    }
    // Only a traveller's pass can be lengthened; a host's plan is not a reward to hand out here.
    const rewardDays = joinedAs === 'traveller' ? c.rewardDays : 0;
    // The row first: its unique user_id is what stops one account being counted twice.
    await db.insert(schema.campaignSignups).values({
      id: uuidv4(), campaignId: c.id, userId, joinedAs, rewardDays, createdAt: now.toISOString(),
    });
    if (rewardDays > 0) {
      const [u] = await db.select({ supportExpiresAt: schema.users.supportExpiresAt }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
      await db.update(schema.users).set({ supportExpiresAt: extendedExpiry(u?.supportExpiresAt, rewardDays, now) }).where(eq(schema.users.id, userId));
    }
    log.info(`[campaigns] ${c.code}: new ${joinedAs} recorded`);
    return { matched: true, recorded: true, rewardDays };
  } catch (err) {
    log.error(`[campaigns] could not record "${key}": ${(err as Error).message}`);
    return { matched: true, recorded: false, reason: 'already_recorded' };
  }
}

/** Business types a host can have (providers.business_type), in the order the report lists them. */
export const BUSINESS_TYPES = ['homestay', 'driver', 'guide', 'cafe', 'shop'] as const;

export interface SignupRow {
  campaignId: string;
  userId: string;
  name: string;
  phone: string;
  joinedAs: string;
  createdAt: string;
  businessName: string | null;
  businessType: string | null;
  live: boolean;
}

/**
 * Every campaign sign-up with what the account is now: a host is anyone with a business (signed up
 * as one, or a traveller who listed one later), with its type, and live when it is active and its
 * documents are verified (the same rule as listings.ts provider_verified).
 */
export async function signupRows(campaignId?: string): Promise<SignupRow[]> {
  const rows = await db.select({
    campaignId: schema.campaignSignups.campaignId,
    userId: schema.campaignSignups.userId,
    joinedAs: schema.campaignSignups.joinedAs,
    createdAt: schema.campaignSignups.createdAt,
    name: schema.users.name,
    phone: schema.users.phone,
    businessName: schema.providers.businessName,
    businessType: schema.providers.businessType,
    status: schema.providers.status,
    kycStatus: schema.providers.kycStatus,
  })
    .from(schema.campaignSignups)
    .innerJoin(schema.users, eq(schema.users.id, schema.campaignSignups.userId))
    .leftJoin(schema.providers, eq(schema.providers.userId, schema.campaignSignups.userId))
    .where(campaignId ? eq(schema.campaignSignups.campaignId, campaignId) : sql`true`);
  return rows.map((r) => ({
    campaignId: r.campaignId,
    userId: r.userId,
    name: r.name,
    phone: r.phone,
    joinedAs: r.joinedAs,
    createdAt: r.createdAt,
    businessName: r.businessName ?? null,
    businessType: r.businessType ?? null,
    live: r.status === 'active' && r.kycStatus === 'verified',
  }));
}

export interface CampaignCounts {
  uses: number;
  travellers: number;
  hosts: number;
  hosts_live: number;
  by_type: Record<string, number>;
  last_used_at: string | null;
}

/** Totals for a set of sign-up rows: travellers, hosts by business type, hosts live. */
export function countRows(rows: SignupRow[]): CampaignCounts {
  const byType: Record<string, number> = Object.fromEntries(BUSINESS_TYPES.map((t) => [t, 0]));
  let hosts = 0;
  let live = 0;
  let last: string | null = null;
  for (const r of rows) {
    if (r.businessType) {
      hosts += 1;
      byType[r.businessType] = (byType[r.businessType] || 0) + 1;
      if (r.live) live += 1;
    }
    if (!last || r.createdAt > last) last = r.createdAt;
  }
  return { uses: rows.length, travellers: rows.length - hosts, hosts, hosts_live: live, by_type: byType, last_used_at: last };
}

/** A campaign row as the admin API sends it. */
export function toAdminCampaign(c: typeof schema.referralCampaigns.$inferSelect, counts: CampaignCounts) {
  return {
    id: c.id, code: c.code, name: c.name, audience: c.audience, reward_days: c.rewardDays,
    ends_at: c.endsAt, max_uses: c.maxUses, active: c.active, created_at: c.createdAt,
    ...counts,
  };
}

/** Is this code paused, ended or full: what the admin list shows beside "active". */
export function campaignState(c: typeof schema.referralCampaigns.$inferSelect, uses: number, now = new Date()): 'active' | 'paused' | 'ended' | 'full' {
  if (!c.active) return 'paused';
  if (c.endsAt && Date.parse(c.endsAt) < now.getTime()) return 'ended';
  if (c.maxUses != null && uses >= c.maxUses) return 'full';
  return 'active';
}
