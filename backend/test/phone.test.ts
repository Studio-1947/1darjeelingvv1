import { describe, it, expect } from 'vitest';
import { isPlausiblePhone, phoneKey } from '../src/lib/phone';

/**
 * The website's phone field is free text with no mask, so production accounts exist under every
 * spelling a person might type. The filter has to reject junk without rejecting any of them.
 */
describe('isPlausiblePhone', () => {
  it('accepts the shapes real users have actually signed up with', () => {
    for (const input of [
      '+919876543210',
      '+91 98765 43210',
      '9876543210',
      '09876543210',
      '098765-43210',
      '(+91) 98765 43210',
      '+1 415 555 2671',
    ]) {
      expect(isPlausiblePhone(input), input).toBe(true);
    }
  });

  it('rejects what is not a number at all', () => {
    for (const input of [
      'not-a-number',
      'e2e-not-a-phone',
      '',
      '   ',
      '+',
      '++91987654321',
      '98765abcde',
      "'; DROP TABLE users; --",
      '☠☠☠☠☠☠☠☠',
    ]) {
      expect(isPlausiblePhone(input), input).toBe(false);
    }
  });

  it('rejects lengths outside E.164', () => {
    expect(isPlausiblePhone('1234567')).toBe(false);          // 7 digits
    expect(isPlausiblePhone('1234567890123456')).toBe(false); // 16 digits
    expect(isPlausiblePhone('12345678')).toBe(true);          // 8, the floor
    expect(isPlausiblePhone('123456789012345')).toBe(true);   // 15, the ceiling
  });

  it('rejects anything that is not a string', () => {
    for (const input of [null, undefined, 919876543210, {}, [], true]) {
      expect(isPlausiblePhone(input as unknown), String(input)).toBe(false);
    }
  });
});

describe('phoneKey', () => {
  it('collapses the spellings of one Indian mobile onto a single key', () => {
    const canonical = '+919876543210';
    for (const input of [
      '+919876543210',
      '+91 98765 43210',
      '+91-98765-43210',
      ' +919876543210 ',
      '9876543210',
      '98765 43210',
      '09876543210',
      '(0) 98765-43210',
    ]) {
      expect(phoneKey(input), input).toBe(canonical);
    }
  });

  it('keeps different numbers apart', () => {
    expect(phoneKey('+919876543210')).not.toBe(phoneKey('+919876543211'));
  });

  it('does not guess a country for a number that never named one', () => {
    // Eleven digits, no plus, not an Indian trunk-prefixed mobile: normalised only by stripping
    // separators, rather than being invented into +91.
    expect(phoneKey('12345678901')).toBe('+12345678901');
  });

  it('leaves an explicitly international number alone', () => {
    expect(phoneKey('+1 415 555 2671')).toBe('+14155552671');
  });

  it('returns null for junk, so it cannot launder a bad value into a key', () => {
    for (const input of ['not-a-number', '', '   ', '+', 'abc', null, undefined]) {
      expect(phoneKey(input as unknown), String(input)).toBeNull();
    }
  });

  it('will not key a number that is too short or too long', () => {
    expect(phoneKey('1234567')).toBeNull();
    expect(phoneKey('1234567890123456')).toBeNull();
  });
});
