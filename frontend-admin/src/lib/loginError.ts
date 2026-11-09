/**
 * What the admin sign-in says when it fails. It used to say "Invalid admin credentials" for every
 * failure, including when the server could not be reached at all, which sent people hunting for a
 * password problem that was really a connection problem (audit 2026-11-08).
 */
export function loginErrorMessage(e: any): string {
  const status: number | undefined = e?.response?.status;
  const detail: unknown = e?.response?.data?.detail;
  if (!e?.response) return 'Could not reach the server. Check your connection and try again.';
  if (typeof detail === 'string' && detail.trim()) return detail;
  if (status === 401 || status === 403) return 'Invalid admin credentials';
  if (status === 429) return 'Too many attempts. Wait a minute and try again.';
  if (status && status >= 500) return 'The server had a problem. Try again in a moment.';
  return 'Sign-in failed. Try again.';
}
