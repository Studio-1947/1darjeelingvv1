import { describe, it, expect } from 'vitest';
import { capPrice, isValidPhone, priceProblem } from './hostFormChecks';

describe('host form checks', () => {
  it('accepts Indian mobile numbers in the usual shapes', () => {
    expect(isValidPhone('98765 43210')).toBe(true);
    expect(isValidPhone('+91 98765 43210')).toBe(true);
    expect(isValidPhone('098765 43210')).toBe(true);
    expect(isValidPhone('12345 67890')).toBe(false);
    expect(isValidPhone('98765')).toBe(false);
  });

  it('wants a whole price per head between ₹100 and ₹50,000', () => {
    expect(priceProblem('')).toBe('price_missing');
    expect(priceProblem('1500.5')).toBe('price_whole');
    expect(priceProblem('-5')).toBe('price_whole');
    expect(priceProblem('50')).toBe('price_range');
    expect(priceProblem('1500')).toBeNull();
    expect(priceProblem('50000')).toBeNull();
    expect(priceProblem('50001')).toBe('price_range');
  });

  it('holds a typed price at ₹50,000 and keeps only digits', () => {
    expect(capPrice('60000')).toBe('50000');
    expect(capPrice('50000')).toBe('50000');
    expect(capPrice('1,500')).toBe('1500');
    expect(capPrice('')).toBe('');
  });
});
