import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

// This file exercises the OTP flow with a REAL (non-mock) provider selected, which is the
// branch every other test file never touches: they all run with MESSAGING_PROVIDER unset,
// so MOCK_OTP is always true and the `123456` universal code is always live. If a future
// refactor dropped the `MOCK_OTP &&` conjunct guarding that bypass (auth.ts), every other
// test in the suite would stay green while every account became reachable with `123456`.
// This file is the guard against that regression.
//
// vi.stubEnv + vi.resetModules() + a dynamic import is how config.ts (which reads
// process.env at module-evaluation time) and everything downstream of it get re-evaluated
// under MESSAGING_PROVIDER=msg91. Vitest gives each test file its own module graph
// (fileParallelism: false, default isolate), so this cannot bleed into other test files —
// but the env is still restored in afterAll for hygiene.

let app: typeof import('../src/app').app;
let setProviderForTests: typeof import('../src/messaging').setProviderForTests;
let realProviderPool: { end: () => Promise<void> };

beforeAll(async () => {
  vi.stubEnv('MESSAGING_PROVIDER', 'msg91');
  vi.stubEnv('MSG91_AUTH_KEY', 'test-auth-key-for-otpRealProvider');
  vi.stubEnv('MSG91_TEMPLATE_ID', 'test-template-id-for-otpRealProvider');

  vi.resetModules();

  const appModule = await import('../src/app');
  const messagingModule = await import('../src/messaging');
  const dbModule = await import('../src/db');

  app = appModule.app;
  setProviderForTests = messagingModule.setProviderForTests;
  realProviderPool = dbModule.pool;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  // The dynamic re-import above pulled in a fresh copy of src/db (a second pg Pool to the
  // same database). Close it explicitly — the original pool from test/setup.ts's static
  // import is closed by its own afterAll.
  await realProviderPool.end();
});

describe('OTP flow with MESSAGING_PROVIDER=msg91 (real provider selected)', () => {
  it('rejects the 123456 universal code with no stored row — lockout regression guard', async () => {
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: '+919000099999', otp: '123456', name: 'Should Not Log In' });

    // Under a real provider, 123456 must be an ordinary (wrong) guess against a non-existent
    // row, i.e. a plain 400 — never a successful login.
    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });

  it('a successful send response contains no mock_otp key and no hint key', async () => {
    const previous = setProviderForTests({
      name: 'stub-real-provider',
      init() {},
      async sendOtp() {
        // No real network call — this is the test seam recommended for exactly this purpose.
        return { ref: 'stub-ref', channel: 'sms' };
      },
    });

    try {
      const res = await request(app)
        .post('/api/auth/otp/send')
        .send({ phone: '+919000088888' });

      expect(res.status).toBe(200);
      expect(res.body.sent).toBe(true);
      expect(res.body).not.toHaveProperty('mock_otp');
      expect(res.body).not.toHaveProperty('hint');
    } finally {
      setProviderForTests(previous);
    }
  });
});
