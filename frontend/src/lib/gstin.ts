/**
 * The GSTIN check, the same rule as backend/src/lib/gstin.ts (which has the final say): 2-digit
 * state code, 10-character PAN, entity number, Z, and a base-36 check character.
 */
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const normaliseGstin = (raw: string) => raw.toUpperCase().replace(/[\s-]/g, '');

function checkChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

export function isValidGstin(raw: string): boolean {
  const g = normaliseGstin(raw);
  const state = Number(g.slice(0, 2));
  return GSTIN_SHAPE.test(g) && ((state >= 1 && state <= 38) || state === 97 || state === 99) && checkChar(g.slice(0, 14)) === g[14];
}

/** What the GST step holds: off (not GST-registered) or the GSTIN and its legal name. */
export type GstDraft = { on: boolean; gstin: string; legalName: string };

export const gstDraftFrom = (provider: any): GstDraft => ({
  on: !!provider?.gstin,
  gstin: provider?.gstin || '',
  legalName: provider?.gst_legal_name || '',
});

/** The problem with a draft, if any: which field, for the form to show under it. */
export function gstDraftError(d: GstDraft): 'gstin' | 'name' | null {
  if (!d.on) return null;
  if (!isValidGstin(d.gstin)) return 'gstin';
  const name = d.legalName.trim();
  if (name.length < 2 || name.length > 120) return 'name';
  return null;
}

/** The `gst` value a payment order sends: null when the host is not GST-registered. */
export const gstPayload = (d: GstDraft) => (d.on ? { gstin: normaliseGstin(d.gstin), legal_name: d.legalName.trim() } : null);
