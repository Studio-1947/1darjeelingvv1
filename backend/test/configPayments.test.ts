import { describe, it, expect, afterEach, vi } from 'vitest';

// vi.stubEnv + vi.resetModules() + a dynamic import is how config.ts (which reads process.env at
// module load and throws on bad production combinations) is exercised — same approach as
// otpRealProvider.test.ts.

// Everything config.ts validates *before* it reaches the MOCK_PAYMENTS guard. Without these the
// import would fail earlier for an unrelated reason and the test would pass for the wrong one.
function stubProductionBaseline() {
  vi.stubEnv('APP_ENV', 'production');
  vi.stubEnv('JWT_SECRET', 'a_real_production_jwt_secret');
}

async function importConfig() {
  vi.resetModules();
  return import('../src/config');
}

describe('MOCK_PAYMENTS production guard', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('refuses to start when MOCK_PAYMENTS is unset in production', async () => {
    stubProductionBaseline();
    vi.stubEnv('MOCK_PAYMENTS', '');

    await expect(importConfig()).rejects.toThrow(/MOCK_PAYMENTS must be set explicitly/);
  });

  it('refuses to start when MOCK_PAYMENTS is only whitespace in production', async () => {
    stubProductionBaseline();
    vi.stubEnv('MOCK_PAYMENTS', '   ');

    await expect(importConfig()).rejects.toThrow(/MOCK_PAYMENTS must be set explicitly/);
  });

  it('allows an explicit MOCK_PAYMENTS=true in production — the documented pre-go-live state', async () => {
    stubProductionBaseline();
    vi.stubEnv('MOCK_PAYMENTS', 'true');

    // Later production checks (CORS, MinIO, admin credentials) may still reject this environment.
    // What matters is that the failure is no longer *this* one: an operator who said what they
    // meant gets past the guard.
    await expect(importConfig()).rejects.not.toThrow(/MOCK_PAYMENTS must be set explicitly/);
  });

  it('still defaults to true outside production, so dev and test need no configuration', async () => {
    vi.stubEnv('APP_ENV', 'development');
    vi.stubEnv('MOCK_PAYMENTS', '');

    const config = await importConfig();
    expect(config.MOCK_PAYMENTS).toBe(true);
  });
});
