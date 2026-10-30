import { SUPPORT_PASS_DAYS } from '../config';

const DAY_MS = 24 * 60 * 60 * 1000;

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
 * The expiry a settled tourist pass is given. Paying early extends from the current expiry;
 * paying after it lapses starts a fresh one-year pass from the settlement time.
 */
export function computeSupportPassExpiry(existing: string | null | undefined, now: Date = new Date()): string {
  const nowMs = now.getTime();
  const existingMs = existing ? Date.parse(existing) : NaN;
  const baseMs = Number.isNaN(existingMs) || existingMs < nowMs ? nowMs : existingMs;
  return new Date(baseMs + SUPPORT_PASS_DAYS * DAY_MS).toISOString();
}
