export const SUPPORT_ROUTE = '/support';

export interface SupportUser {
  role: string;
  providerPaid?: boolean | null;
  supportExpiresAt?: string | null;
}

/**
 * Mirrors backend/src/lib/support.ts. Kept in step deliberately: this one decides what the user
 * SEES, the server's decides what the user may DO. The server is always the authority — if the
 * two ever disagree, the 402 interceptor below corrects the client.
 */
export function isExemptFromSupport(user: SupportUser): boolean {
  if (user.role === 'admin') return true;
  return user.role === 'provider' && user.providerPaid === true;
}

export function isSupportActive(user: SupportUser): boolean {
  if (!user.supportExpiresAt) return false;
  const expiry = Date.parse(user.supportExpiresAt);
  if (Number.isNaN(expiry)) return false;
  return expiry > Date.now();
}

/** Logged-out visitors never need it — public browsing stays free. */
export function needsSupport(user: SupportUser | null | undefined): boolean {
  if (!user) return false;
  return !isExemptFromSupport(user) && !isSupportActive(user);
}
