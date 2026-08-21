import { describe, it, expect, afterEach, vi } from 'vitest';

// vi.stubEnv + vi.resetModules() + a dynamic import is how config.ts (which reads process.env at
// module load and throws on bad production combinations) is exercised — same approach as
// configPayments.test.ts and otpRealProvider.test.ts.
//
// What is under test is the one production misconfiguration that costs every account at once:
// MESSAGING_PROVIDER=mock leaves the `123456` universal code live in auth.ts, so any phone number
// — registered or not, admin or not — logs in with a code that is printed in this repository. It
// used to log an error and boot anyway.

// Everything config.ts validates *before* it reaches the mock-OTP guard. Without these the import
// would fail earlier for an unrelated reason and the test would pass for the wrong one.
function stubProductionBaseline() {
  vi.stubEnv('APP_ENV', 'production');
  vi.stubEnv('JWT_SECRET', 'a_real_production_jwt_secret');
}

async function importConfig() {
  vi.resetModules();
  return import('../src/config');
}

describe('mock-OTP production guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('refuses to start when MESSAGING_PROVIDER is unset in production', async () => {
    stubProductionBaseline();
    vi.stubEnv('MESSAGING_PROVIDER', '');

    // The default is mock. Silence must not select the bypass.
    await expect(importConfig()).rejects.toThrow(/ALLOW_MOCK_OTP=true/);
  });

  it('refuses to start on an explicit MESSAGING_PROVIDER=mock in production', async () => {
    stubProductionBaseline();
    vi.stubEnv('MESSAGING_PROVIDER', 'mock');

    // Naming the provider states "no SMS gateway yet". It does not state "anyone may log in as
    // anyone", and this guard is the only place that second thing can be said.
    await expect(importConfig()).rejects.toThrow(/ALLOW_MOCK_OTP=true/);
  });

  it('refuses ALLOW_MOCK_OTP values that are not a literal true', async () => {
    stubProductionBaseline();
    vi.stubEnv('MESSAGING_PROVIDER', 'mock');

    for (const value of ['1', 'yes', 'TRUE ', 'false', '   ']) {
      vi.stubEnv('ALLOW_MOCK_OTP', value);
      const shouldPass = value.trim().toLowerCase() === 'true';

      if (shouldPass) {
        // 'TRUE ' — case and surrounding whitespace are an operator's typing, not a different answer.
        await expect(importConfig()).rejects.not.toThrow(/ALLOW_MOCK_OTP=true/);
      } else {
        await expect(importConfig()).rejects.toThrow(/ALLOW_MOCK_OTP=true/);
      }
    }
  });

  it('allows an explicit ALLOW_MOCK_OTP=true in production — the staging stack', async () => {
    stubProductionBaseline();
    vi.stubEnv('MESSAGING_PROVIDER', 'mock');
    vi.stubEnv('ALLOW_MOCK_OTP', 'true');

    // Later production checks (CORS, MinIO, admin credentials) may still reject this environment.
    // What matters is that the failure is no longer *this* one: an operator who said what they
    // meant gets past the guard.
    await expect(importConfig()).rejects.not.toThrow(/ALLOW_MOCK_OTP=true/);
  });

  it('does not fire for a real provider in production, with or without the flag', async () => {
    stubProductionBaseline();
    vi.stubEnv('MESSAGING_PROVIDER', 'msg91');

    await expect(importConfig()).rejects.not.toThrow(/ALLOW_MOCK_OTP=true/);
  });

  it('still defaults to the mock provider outside production, so dev and test need no configuration', async () => {
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('MESSAGING_PROVIDER', '');

    const config = await importConfig();
    expect(config.MESSAGING_PROVIDER).toBe('mock');
    expect(config.MOCK_OTP).toBe(true);
    // The flag is a production-only gate; it says nothing about dev, where the bypass is the point.
    expect(config.ALLOW_MOCK_OTP).toBe(false);
  });
});
