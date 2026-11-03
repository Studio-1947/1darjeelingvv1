export const OTP_COUNTRIES = [
  { code: '+91', iso: 'IN', country: 'India', flag: '🇮🇳', nationalDigits: 10 },
  { code: '+977', iso: 'NP', country: 'Nepal', flag: '🇳🇵', nationalDigits: 10 },
  { code: '+880', iso: 'BD', country: 'Bangladesh', flag: '🇧🇩', nationalDigits: 10 },
  { code: '+975', iso: 'BT', country: 'Bhutan', flag: '🇧🇹', nationalDigits: 8 },
] as const;

export type OtpCountry = (typeof OTP_COUNTRIES)[number];

/**
 * The national digits of what was typed or autofilled. Browsers autofill "+91 98765 43210" (or
 * "919876543210", or "098765 43210") into the number box; the country code and a trunk 0 are
 * dropped so the box holds just the 10 digits.
 */
export function nationalPhone(raw: string, country: OtpCountry): string {
  let digits = raw.replace(/\D/g, '');
  const cc = country.code.slice(1);
  const hadPlus = raw.trim().startsWith('+');
  if (digits.length > country.nationalDigits && digits.startsWith(cc) && (hadPlus || digits.length === cc.length + country.nationalDigits)) {
    digits = digits.slice(cc.length);
  } else if (hadPlus && digits.startsWith(cc)) {
    digits = digits.slice(cc.length);
  }
  if (digits.length > country.nationalDigits && digits.startsWith('0')) digits = digits.replace(/^0+/, '');
  return digits.slice(0, country.nationalDigits);
}

export function otpPhone(raw: string, country: OtpCountry): string | null {
  const national = nationalPhone(raw, country);
  return national.length === country.nationalDigits ? `${country.code}${national}` : null;
}
