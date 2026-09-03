/**
 * Phone numbers, as they arrive and as we count them.
 *
 * `/auth/otp/send` used to check that `phone` was present and never that it was a phone number.
 * An arbitrary string was accepted, reserved against the daily OTP budget, and handed to the
 * messaging provider — and on a mock-mode server the universal code then verified it, so an
 * account could exist whose identity was `not-a-number`.
 *
 * There are two separate jobs here, and conflating them is what makes this risky:
 *
 *   isPlausiblePhone — could this string be a phone number at all? Used to reject junk at the
 *   edge. Deliberately permissive about *shape*, because the website's phone field is free text
 *   with no mask, so real people have signed up as "9876543210", "+91 98765 43210" and
 *   "098765 43210" and every one of those accounts must keep working.
 *
 *   phoneKey — what counts as "the same number" for a rate limit or a spend cap. The per-phone
 *   limiter and the ten-a-day budget used to key on the raw string, so those three spellings were
 *   three separate buckets for one person: a caller could reset their own limit just by adding a
 *   space. This collapses them.
 *
 * `phoneKey` is deliberately NOT used for lookup or storage. `users.phone` holds whatever was
 * typed at signup, and rewriting the lookup to a canonical form would stop an existing user from
 * finding their own account — they would sign in and land in a brand new one, leaving their
 * bookings behind. Migrating stored numbers is a separate, larger change with a data migration
 * behind it; this file does not attempt it.
 */

/** Everything a person might type between the digits. */
const SEPARATORS = /[\s()\-. ‐-―]/g;

/**
 * ITU-T E.164 caps a subscriber number at 15 digits. The floor is looser than any single
 * country's rule on purpose: this is a junk filter, not a numbering-plan validator, and being
 * strict here is how a legitimate foreign visitor gets locked out.
 */
const MIN_DIGITS = 8;
const MAX_DIGITS = 15;

/** Digits only, with a leading `+` preserved as a flag rather than a character. */
function parse(raw: unknown): { plus: boolean; digits: string } | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().replace(SEPARATORS, '');
  if (!trimmed) return null;

  const plus = trimmed.startsWith('+');
  const digits = plus ? trimmed.slice(1) : trimmed;

  // After the separators are gone, anything that is not a digit means this was never a number.
  if (!/^[0-9]+$/.test(digits)) return null;
  return { plus, digits };
}

/** Could this be a phone number? The bar a caller has to clear before we spend anything on them. */
export function isPlausiblePhone(raw: unknown): boolean {
  const parsed = parse(raw);
  if (!parsed) return false;
  const { digits } = parsed;
  return digits.length >= MIN_DIGITS && digits.length <= MAX_DIGITS;
}

/**
 * The canonical form of a number, for counting only.
 *
 * India is the platform's only market and both clients send +91, so the common national spellings
 * are folded onto it: a bare ten-digit mobile, and the same with a trunk `0` in front. Anything
 * else is normalised only as far as stripping separators, which still collapses the spacing
 * variants without guessing at a country that was never stated.
 *
 * Returns null for a string that is not plausibly a phone number, so a caller cannot use this to
 * launder junk into a key.
 */
export function phoneKey(raw: unknown): string | null {
  const parsed = parse(raw);
  if (!parsed) return null;

  let { digits } = parsed;
  const { plus } = parsed;

  if (!plus) {
    // "098765 43210" — a domestic trunk prefix on an Indian mobile.
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    // "9876543210" — Indian mobiles start 6-9 and are ten digits.
    if (digits.length === 10 && /^[6-9]/.test(digits)) digits = `91${digits}`;
  }

  if (digits.length < MIN_DIGITS || digits.length > MAX_DIGITS) return null;
  return `+${digits}`;
}
