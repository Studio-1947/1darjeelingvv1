import { SUPPORT_DURATION_DAYS } from '../config';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SupportUser {
  role: string;
  providerPaid?: boolean | null;
  supportExpiresAt?: string | null;
}

/**
 * Exemption means "has already paid us" — not "claims to be a business".
 *
 * `role` flips to 'provider' the moment /providers/onboard is submitted, which is BEFORE the
 * ₹99 registration fee is paid. Exempting on role alone would therefore let any tourist submit
 * that form, flip their own role, and use the platform for free. `providerPaid` is the fact
 * that actually distinguishes them.
 */
export function isExemptFromSupport(user: SupportUser): boolean {
  if (user.role === 'admin') return true;
  return user.role === 'provider' && user.providerPaid === true;
}

/** A stored value that is absent or unparseable means "not active" — never throw on bad data. */
export function isSupportActive(user: SupportUser, now: Date = new Date()): boolean {
  if (!user.supportExpiresAt) return false;
  const expiry = Date.parse(user.supportExpiresAt);
  if (Number.isNaN(expiry)) return false;
  return expiry > now.getTime();
}

/**
 * Monotonic by construction: the expiry can only move forward.
 *
 * Two consequences that are both deliberate. Renewing early extends the remaining window
 * rather than truncating it, so nobody is punished for paying ahead of time. And a payment
 * settled twice — the webhook and the browser callback race by design — can never shorten
 * someone's access, even if settlePaymentOnce's guard were ever bypassed.
 */
export function computeSupportExpiry(
  existing: string | null | undefined,
  now: Date = new Date()
): string {
  const nowMs = now.getTime();
  const existingMs = existing ? Date.parse(existing) : NaN;
  const base = Number.isNaN(existingMs) || existingMs < nowMs ? nowMs : existingMs;
  return new Date(base + SUPPORT_DURATION_DAYS * DAY_MS).toISOString();
}
