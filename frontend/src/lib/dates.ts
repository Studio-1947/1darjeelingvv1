/**
 * Helpers for `<input type="date">` values, which are always `YYYY-MM-DD`.
 *
 * Everything here works on the string form rather than Date objects: parsing
 * `'2026-07-27'` with `new Date()` lands on UTC midnight, so anywhere west of
 * Greenwich would read it back as the 26th. Splitting the parts instead keeps
 * "today" the user's today and keeps day arithmetic off the timezone.
 */

const pad = (n: number) => String(n).padStart(2, '0');

/** Today in the user's own timezone, as a date-input value. */
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `date` shifted by `n` days, or '' if it isn't a usable date-input value. */
export function addDays(date: string, n: number): string {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return '';
  // UTC arithmetic so a DST boundary can't turn +1 day into +23 hours.
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** True when both dates are set and check-out is not strictly after check-in. */
export function isBadRange(checkIn: string, checkOut: string): boolean {
  return Boolean(checkIn && checkOut && checkOut <= checkIn);
}
