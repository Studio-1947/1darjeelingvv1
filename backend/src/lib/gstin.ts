/**
 * A host's GST registration, optional, given when they pay for their yearly plan so the payment can
 * be invoiced to their GSTIN (a B2B invoice they can claim input tax credit on, and that we report
 * as B2B in our GST returns). The same rule runs in the web app (frontend/src/lib/gstin.ts).
 *
 * A GSTIN is 15 characters: 2-digit state code, the 10-character PAN, the entity number (1-9 or
 * A-Z), the letter Z, and a check character (base-36, weights 1 and 2 alternating).
 */
export type GstBilling = {
  gstin: string;
  /** The legal name registered against the GSTIN, as it goes on the invoice. */
  legal_name: string;
  /** The first two digits of the GSTIN: the place of supply (19 is West Bengal). */
  state_code: string;
};

const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/** Upper case, no spaces or dashes: how a GSTIN is stored and compared. */
export function normaliseGstin(raw: unknown): string {
  return typeof raw === 'string' ? raw.toUpperCase().replace(/[\s-]/g, '') : '';
}

function checkChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const product = CHARS.indexOf(first14[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARS[(36 - (sum % 36)) % 36];
}

/** State codes in use: 01-38, plus 97 (other territory) and 99 (centre jurisdiction). */
function validState(code: string): boolean {
  const n = Number(code);
  return (n >= 1 && n <= 38) || n === 97 || n === 99;
}

export function isValidGstin(raw: unknown): boolean {
  const g = normaliseGstin(raw);
  return GSTIN_SHAPE.test(g) && validState(g.slice(0, 2)) && checkChar(g.slice(0, 14)) === g[14];
}

/**
 * Reads `gst` from a payment request body.
 *   - undefined: the host said nothing; keep what is saved.
 *   - null: the host is not GST-registered; clear what is saved.
 *   - { gstin, legal_name }: check it, and return the cleaned value.
 */
export function parseGstInput(input: unknown): { value: GstBilling | null | undefined } | { error: string } {
  if (input === undefined) return { value: undefined };
  if (input === null) return { value: null };
  if (typeof input !== 'object') return { error: 'GST details are not in the right form' };
  const { gstin, legal_name } = input as Record<string, unknown>;
  const g = normaliseGstin(gstin);
  if (!isValidGstin(g)) return { error: 'That GSTIN is not valid. Check the 15 characters on your GST certificate.' };
  const name = typeof legal_name === 'string' ? legal_name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 120) return { error: 'Enter the legal name registered with your GSTIN' };
  return { value: { gstin: g, legal_name: name, state_code: g.slice(0, 2) } };
}
