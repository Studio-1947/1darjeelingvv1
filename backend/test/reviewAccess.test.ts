import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

// Store-review sign-in: the one number that may verify with a fixed code, so a Play or App Store
// reviewer can get into an app whose only credential is an SMS to an Indian phone.
//
// It is a deliberate backdoor, so what needs guarding is not that it works but that it stays
// NARROW — one number, one code, and no widening as the code is refactored. Everything here runs
// with MESSAGING_PROVIDER=msg91, i.e. MOCK_OTP false, because that is the only configuration in
// which this feature is meant to exist at all: under mock mode `123456` already logs in as
// anyone and the exception would be indistinguishable from the rule.
//
// vi.stubEnv + vi.resetModules() + dynamic import is how config.ts (which reads process.env at
// module-evaluation time) is re-evaluated. Same approach as otpRealProvider.test.ts.

const REVIEW_PHONE = '+919000077777';
const REVIEW_OTP = 'k7Qm2ZxP9rLt4W';

let app: typeof import('../src/app').app;
let db: typeof import('../src/db').db;
let schema: typeof import('../src/db').schema;
let setProviderForTests: typeof import('../src/messaging').setProviderForTests;
let reviewPool: { end: () => Promise<void> };

beforeAll(async () => {
  vi.stubEnv('MESSAGING_PROVIDER', 'msg91');
  vi.stubEnv('MSG91_AUTH_KEY', 'test-auth-key-for-reviewAccess');
  vi.stubEnv('MSG91_TEMPLATE_ID', 'test-template-id-for-reviewAccess');
  vi.stubEnv('REVIEW_PHONE', REVIEW_PHONE);
  vi.stubEnv('REVIEW_OTP', REVIEW_OTP);

  vi.resetModules();

  const appModule = await import('../src/app');
  const dbModule = await import('../src/db');
  const messagingModule = await import('../src/messaging');

  app = appModule.app;
  db = dbModule.db;
  schema = dbModule.schema;
  setProviderForTests = messagingModule.setProviderForTests;
  reviewPool = dbModule.pool;
});

afterAll(async () => {
  vi.unstubAllEnvs();
  // The dynamic import above created a second pg Pool against the same database; the static one
  // from test/setup.ts is closed by its own afterAll.
  await reviewPool.end();
});

describe('the reviewer can sign in', () => {
  it('accepts the fixed code for the review number, with no stored OTP row', async () => {
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: REVIEW_PHONE, otp: REVIEW_OTP, name: 'Play Reviewer' });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.user.phone).toBe(REVIEW_PHONE);
  });

  it('sends nothing when the review number asks for a code', async () => {
    // A real dispatch here would spend from the daily budget and deliver a code to a number the
    // reviewer does not hold — and it would not be the code the Play Console gave them.
    let dispatches = 0;
    const previous = setProviderForTests({
      name: 'stub-counting-provider',
      init() {},
      async sendOtp() {
        dispatches += 1;
        return { ref: 'stub-ref', channel: 'sms' };
      },
    });

    try {
      const res = await request(app).post('/api/auth/otp/send').send({ phone: REVIEW_PHONE });

      expect(res.status).toBe(200);
      expect(res.body.sent).toBe(true);
      expect(dispatches).toBe(0);
      expect(res.body).not.toHaveProperty('mock_otp');

      // Nor should it have written a code that could later be verified.
      const rows = await db.select().from(schema.otps).where(eq(schema.otps.phone, REVIEW_PHONE));
      expect(rows).toHaveLength(0);
    } finally {
      setProviderForTests(previous);
    }
  });
});

describe('the exception does not widen', () => {
  it('rejects the review code from any other number', async () => {
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: '+919000066666', otp: REVIEW_OTP, name: 'Not The Reviewer' });

    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });

  it('rejects a wrong code from the review number', async () => {
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: REVIEW_PHONE, otp: 'k7Qm2ZxP9rLt4X', name: 'Play Reviewer' });

    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });

  it('rejects a respelling of the review number', async () => {
    // The match is exact, not phoneKey(), which folds several spellings onto one number. A
    // reviewer types what the console tells them to type; anything looser is how a narrow
    // exception stops being narrow.
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: '9000077777', otp: REVIEW_OTP, name: 'Respelled' });

    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });

  it('still rejects 123456 — this feature does not reopen the universal bypass', async () => {
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: REVIEW_PHONE, otp: '123456', name: 'Play Reviewer' });

    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();
  });
});

// Imported late so the top-level `eq` does not shadow the dynamic schema import above.
import { eq } from 'drizzle-orm';
