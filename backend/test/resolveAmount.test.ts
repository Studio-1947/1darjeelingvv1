import { describe, it, expect } from 'vitest';
import { resolveAmount } from '../src/lib/payments';
import { AMOUNTS, DONATION_MIN_PAISE, DONATION_MAX_PAISE } from '../src/config';

function ok(result: ReturnType<typeof resolveAmount>): number {
  if ('error' in result) {
    throw new Error(`expected an amount, got error: ${result.error.status} ${result.error.detail}`);
  }
  return result.amount;
}

function err(result: ReturnType<typeof resolveAmount>) {
  if (!('error' in result)) {
    throw new Error(`expected an error, got amount: ${result.amount}`);
  }
  return result.error;
}

describe('resolveAmount — fixed-price flows', () => {
  it('takes the amount from the server-side map', () => {
    expect(ok(resolveAmount('provider_registration', {}))).toBe(AMOUNTS.provider_registration);
    expect(ok(resolveAmount('booking_commission', {}))).toBe(AMOUNTS.booking_commission);
    expect(ok(resolveAmount('platform_support', {}))).toBe(AMOUNTS.platform_support);
  });

  it('ignores an amount supplied by the client', () => {
    // The whole point of the map. A client that names its own price for a fixed flow is
    // either confused or hostile; either way the body is not consulted.
    expect(ok(resolveAmount('platform_support', { amount: 1 }))).toBe(1200);
    expect(ok(resolveAmount('provider_registration', { amount: 1 }))).toBe(9900);
    expect(ok(resolveAmount('booking_commission', { amount: 999999 }))).toBe(100);
  });

  it('rejects an unknown flow', () => {
    expect(err(resolveAmount('not_a_real_flow', {})).status).toBe(400);
  });

  it('rejects a flow of the wrong type', () => {
    expect(err(resolveAmount(undefined as any, {})).status).toBe(400);
    expect(err(resolveAmount(null as any, {})).status).toBe(400);
  });
});

describe('resolveAmount — donation', () => {
  it('accepts a valid client-supplied amount', () => {
    expect(ok(resolveAmount('donation', { amount: 50000 }))).toBe(50000);
  });

  it('accepts both boundaries exactly', () => {
    expect(ok(resolveAmount('donation', { amount: DONATION_MIN_PAISE }))).toBe(DONATION_MIN_PAISE);
    expect(ok(resolveAmount('donation', { amount: DONATION_MAX_PAISE }))).toBe(DONATION_MAX_PAISE);
  });

  it('rejects the values just outside each boundary', () => {
    expect(err(resolveAmount('donation', { amount: DONATION_MIN_PAISE - 1 })).status).toBe(400);
    expect(err(resolveAmount('donation', { amount: DONATION_MAX_PAISE + 1 })).status).toBe(400);
  });

  it('rejects a missing amount', () => {
    expect(err(resolveAmount('donation', {})).status).toBe(400);
    expect(err(resolveAmount('donation', { amount: null })).status).toBe(400);
    expect(err(resolveAmount('donation', { amount: undefined })).status).toBe(400);
  });

  it('rejects a non-integer amount — paise are indivisible', () => {
    expect(err(resolveAmount('donation', { amount: 1050.5 })).status).toBe(400);
  });

  it('rejects NaN and Infinity', () => {
    expect(err(resolveAmount('donation', { amount: NaN })).status).toBe(400);
    expect(err(resolveAmount('donation', { amount: Infinity })).status).toBe(400);
    expect(err(resolveAmount('donation', { amount: -Infinity })).status).toBe(400);
  });

  it('rejects zero and negative amounts', () => {
    expect(err(resolveAmount('donation', { amount: 0 })).status).toBe(400);
    expect(err(resolveAmount('donation', { amount: -5000 })).status).toBe(400);
  });

  it('rejects a numeric string rather than coercing it', () => {
    // Coercion here would mean '1e9' or '  5000  ' quietly becoming a real charge.
    expect(err(resolveAmount('donation', { amount: '5000' })).status).toBe(400);
  });

  it('rejects objects and arrays', () => {
    expect(err(resolveAmount('donation', { amount: {} })).status).toBe(400);
    expect(err(resolveAmount('donation', { amount: [5000] })).status).toBe(400);
  });

  it('names the permitted range in the error, so the client can say something useful', () => {
    expect(err(resolveAmount('donation', { amount: 1 })).detail).toMatch(/10 and .*1,?00,?000|1000 and 10000000/);
  });

  it('is not present in the AMOUNTS map — a donation has no fixed price', () => {
    expect(AMOUNTS.donation).toBeUndefined();
  });

  it('tolerates a missing body entirely', () => {
    expect(err(resolveAmount('donation', undefined as any)).status).toBe(400);
    expect(err(resolveAmount('donation', null as any)).status).toBe(400);
  });
});
