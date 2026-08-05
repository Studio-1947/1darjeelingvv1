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

/**
 * A date-input value as a Date at local midnight, or null.
 *
 * `new Date('2026-08-20')` is parsed as UTC midnight, so formatting it anywhere
 * west of Greenwich prints the 19th. Building from the parts keeps the day the
 * day the visitor picked, wherever they are reading from.
 */
export function parseDate(date: string): Date | null {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return null;
  const t = new Date(y, m - 1, d);
  return Number.isNaN(t.getTime()) ? null : t;
}

/** One date in the active language: `20 Aug`. Falls back to the raw value if unparseable. */
export function formatDay(date: string, locale = 'en'): string {
  const d = parseDate(date);
  if (!d) return date || '';
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/**
 * A stay as one string: `20 - 22 Aug` inside a month, `28 Aug - 2 Sep` across
 * one. Returns '' unless both ends are set - callers word the half-filled cases
 * themselves, since "from the 20th" and "until the 22nd" are different prompts.
 */
export function formatRange(checkIn: string, checkOut: string, locale = 'en'): string {
  const a = parseDate(checkIn);
  const b = parseDate(checkOut);
  if (!a || !b) return '';
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    return `${a.getDate()} - ${b.getDate()} ${a.toLocaleDateString(locale, { month: 'short' })}`;
  }
  return `${formatDay(checkIn, locale)} - ${formatDay(checkOut, locale)}`;
}
