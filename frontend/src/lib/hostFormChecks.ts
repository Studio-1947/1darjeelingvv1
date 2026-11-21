/**
 * Checks for the host setup forms, shown next to the field before saving.
 * The backend repeats its own checks; these only stop a host sending something half-filled.
 */

/** An Indian mobile number: 10 digits starting 6-9, with or without +91 / 0 in front. */
export function isValidPhone(raw: string): boolean {
  let d = (raw || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return /^[6-9]\d{9}$/.test(d);
}

export const MIN_PRICE = 100;
/** The most any one price can be, in whole rupees (user decision 2026-11-21). The backend checks the same (backend/src/lib/priceCap.ts). */
export const MAX_PRICE = 50000;

/** Keeps only digits and holds a typed price at MAX_PRICE, for price inputs that store text. */
export function capPrice(raw: string): string {
  const d = (raw || '').replace(/[^\d]/g, '');
  return d && Number(d) > MAX_PRICE ? String(MAX_PRICE) : d;
}

/** null when fine, else a reason key under ob.check.* */
export function priceProblem(raw: string): null | 'price_missing' | 'price_whole' | 'price_range' {
  const v = (raw || '').trim();
  if (!v) return 'price_missing';
  if (!/^\d+$/.test(v)) return 'price_whole';
  const n = Number(v);
  if (n < MIN_PRICE || n > MAX_PRICE) return 'price_range';
  return null;
}
