import { LIFETIME_SUPPORT_EXPIRY } from '../config';

export interface SupportUser {
  role: string;
  providerPaid?: boolean | null;
  supportExpiresAt?: string | null;
}

/**
 * Exemption means "has already paid us"  not "claims to be a business".
 *
 * `role` flips to 'provider' the moment /providers/onboard is submitted, which is BEFORE the
 * host registration fee is paid. Exempting on role alone would therefore let any tourist submit
 * that form, flip their own role, and use the platform for free. `providerPaid` is the fact
 * that actually distinguishes them.
 */
export function isExemptFromSupport(user: SupportUser): boolean {
  if (user.role === 'admin') return true;
  return user.role === 'provider' && user.providerPaid === true;
}

/** A stored value that is absent or unparseable means "not active"  never throw on bad data. */
export function isSupportActive(user: SupportUser, now: Date = new Date()): boolean {
  if (!user.supportExpiresAt) return false;
  const expiry = Date.parse(user.supportExpiresAt);
  if (Number.isNaN(expiry)) return false;
  return expiry > now.getTime();
}

/**
 * The expiry a settled tourist pass is given. The pass is a one-time ₹1 payment for life, so this
 * no longer depends on what was stored before: whatever time a user had (a referral reward, an
 * old yearly pass), paying replaces it with a date that never arrives.
 */
export function lifetimeSupportExpiry(): string {
  return LIFETIME_SUPPORT_EXPIRY;
}
