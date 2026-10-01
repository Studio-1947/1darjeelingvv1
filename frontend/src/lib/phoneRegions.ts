export const OTP_COUNTRIES = [
  { code: '+91', country: 'India', flag: '🇮🇳', nationalDigits: 10 },
  { code: '+977', country: 'Nepal', flag: '🇳🇵', nationalDigits: 10 },
  { code: '+880', country: 'Bangladesh', flag: '🇧🇩', nationalDigits: 10 },
  { code: '+975', country: 'Bhutan', flag: '🇧🇹', nationalDigits: 8 },
] as const;

export type OtpCountry = (typeof OTP_COUNTRIES)[number];

export function nationalPhone(raw: string, country: OtpCountry): string {
  return raw.replace(/\D/g, '').slice(0, country.nationalDigits);
}

export function otpPhone(raw: string, country: OtpCountry): string | null {
  const national = nationalPhone(raw, country);
  return national.length === country.nationalDigits ? `${country.code}${national}` : null;
}
