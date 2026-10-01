import { describe, expect, it } from 'vitest';
import { OTP_COUNTRIES, otpPhone } from './phoneRegions';

describe('regional OTP numbers', () => {
  it.each([
    ['India', '98765 43210', '+919876543210'],
    ['Nepal', '981-234-5678', '+9779812345678'],
    ['Bangladesh', '1712 345678', '+8801712345678'],
    ['Bhutan', '1712 3456', '+97517123456'],
  ])('builds an unambiguous %s E.164 number', (name, input, expected) => {
    const country = OTP_COUNTRIES.find((item) => item.country === name)!;
    expect(otpPhone(input, country)).toBe(expected);
  });

  it('rejects an incomplete national number', () => {
    expect(otpPhone('1234', OTP_COUNTRIES[0])).toBeNull();
  });
});
