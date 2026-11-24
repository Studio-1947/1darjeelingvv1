import { describe, it, expect } from 'vitest';
import { gstDraftError, gstPayload, isValidGstin, normaliseGstin } from './gstin';

describe('GSTIN check (same rule as backend/src/lib/gstin.ts)', () => {
  it('accepts valid GSTINs, in any case and with spaces', () => {
    expect(isValidGstin('27AAPFU0939F1ZV')).toBe(true);
    expect(isValidGstin('19aaffw1529d1z8')).toBe(true);
    expect(normaliseGstin('19 abcde-1234f1zx')).toBe('19ABCDE1234F1ZX');
  });

  it('refuses a wrong check character or shape', () => {
    expect(isValidGstin('27AAPFU0939F1ZA')).toBe(false);
    expect(isValidGstin('27AAPFU0939F1Z')).toBe(false);
  });

  it('only checks the fields when the host turned GST on', () => {
    expect(gstDraftError({ on: false, gstin: 'x', legalName: '' })).toBeNull();
    expect(gstDraftError({ on: true, gstin: 'x', legalName: 'Hill View' })).toBe('gstin');
    expect(gstDraftError({ on: true, gstin: '27AAPFU0939F1ZV', legalName: ' ' })).toBe('name');
    expect(gstPayload({ on: false, gstin: '27AAPFU0939F1ZV', legalName: 'A' })).toBeNull();
    expect(gstPayload({ on: true, gstin: '27aapfu0939f1zv', legalName: ' Pine Cabs ' })).toEqual({ gstin: '27AAPFU0939F1ZV', legal_name: 'Pine Cabs' });
  });
});
