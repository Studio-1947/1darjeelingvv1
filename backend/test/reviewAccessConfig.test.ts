import { describe, it, expect, afterEach, vi } from 'vitest';

// The boot-time validation on REVIEW_PHONE / REVIEW_OTP.
//
// This is a standing credential with no expiry, and the verify rate limiter that would otherwise
// slow an attacker down is per-process and in-memory — so it resets on every deploy and is blind
// to a second container. The length of the code is what actually protects it, which is why a
// weak value fails the boot instead of producing a warning nobody reads.
//
// vi.stubEnv + vi.resetModules() + dynamic import, same as configPayments.test.ts: config.ts
// reads process.env at module-evaluation time.

async function importConfig() {
  vi.resetModules();
  return import('../src/config');
}

describe('REVIEW_PHONE / REVIEW_OTP validation', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('is off, and harmless, when neither is set', async () => {
    const config = await importConfig();
    expect(config.REVIEW_PHONE).toBeNull();
    expect(config.REVIEW_OTP).toBe('');
  });

  it('refuses a phone with no code', async () => {
    vi.stubEnv('REVIEW_PHONE', '+919000077777');
    await expect(importConfig()).rejects.toThrow(/must be set together/);
  });

  it('refuses a code with no phone', async () => {
    vi.stubEnv('REVIEW_OTP', 'k7Qm2ZxP9rLt4W');
    await expect(importConfig()).rejects.toThrow(/must be set together/);
  });

  it('refuses a REVIEW_PHONE that is not a phone number', async () => {
    vi.stubEnv('REVIEW_PHONE', 'reviewer');
    vi.stubEnv('REVIEW_OTP', 'k7Qm2ZxP9rLt4W');
    await expect(importConfig()).rejects.toThrow(/not a phone number/);
  });

  it('refuses a short code', async () => {
    vi.stubEnv('REVIEW_PHONE', '+919000077777');
    vi.stubEnv('REVIEW_OTP', '123456');
    await expect(importConfig()).rejects.toThrow(/at least 10 characters/);
  });

  it('refuses a code that is one character repeated', async () => {
    vi.stubEnv('REVIEW_PHONE', '+919000077777');
    vi.stubEnv('REVIEW_OTP', '0000000000');
    await expect(importConfig()).rejects.toThrow(/guessable sequence/);
  });

  it('refuses a straight run off the number pad', async () => {
    vi.stubEnv('REVIEW_PHONE', '+919000077777');
    vi.stubEnv('REVIEW_OTP', '1234567890');
    await expect(importConfig()).rejects.toThrow(/guessable sequence/);
  });

  it('accepts a long random code, and exports both', async () => {
    vi.stubEnv('REVIEW_PHONE', '+919000077777');
    vi.stubEnv('REVIEW_OTP', 'k7Qm2ZxP9rLt4W');

    const config = await importConfig();
    expect(config.REVIEW_PHONE).toBe('+919000077777');
    expect(config.REVIEW_OTP).toBe('k7Qm2ZxP9rLt4W');
  });

  it('tolerates surrounding whitespace, which is how a copied value usually arrives', async () => {
    vi.stubEnv('REVIEW_PHONE', '  +919000077777 ');
    vi.stubEnv('REVIEW_OTP', ' k7Qm2ZxP9rLt4W  ');

    const config = await importConfig();
    expect(config.REVIEW_PHONE).toBe('+919000077777');
    expect(config.REVIEW_OTP).toBe('k7Qm2ZxP9rLt4W');
  });
});
