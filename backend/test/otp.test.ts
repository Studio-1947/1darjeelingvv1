import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { setProviderForTests, getProvider, MessageDeliveryError } from '../src/messaging';
import { nextPhone } from './helpers';
import { db, schema } from '../src/db';
import { eq } from 'drizzle-orm';
import { OTP_MAX_ATTEMPTS } from '../src/config';

const realProvider = getProvider();

afterEach(() => {
  setProviderForTests(realProvider);
});

function failingProvider(message: string) {
  return {
    name: 'failing',
    init() {},
    async sendOtp(): Promise<{ ref?: string }> {
      throw new MessageDeliveryError('failing', message);
    },
  };
}

describe('POST /auth/otp/send delivery', () => {
  it('returns the mock code while the mock provider is active', async () => {
    const res = await request(app).post('/api/auth/otp/send').send({ phone: nextPhone() });

    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
    expect(res.body.mock_otp).toMatch(/^\d{6}$/);
  });

  it('returns 502 and does not claim sent when delivery fails', async () => {
    setProviderForTests(failingProvider('provider exploded'));

    const res = await request(app).post('/api/auth/otp/send').send({ phone: nextPhone() });

    // The whole point of this layer: an undelivered code can never be reported as sent.
    expect(res.status).toBe(502);
    expect(res.body.sent).toBeUndefined();
    expect(res.body.detail).toBe('Could not send OTP, please try again');
  });

  it('does not leak the provider diagnostic to the client', async () => {
    setProviderForTests(failingProvider('authkey rejected: secret-abc'));

    const res = await request(app).post('/api/auth/otp/send').send({ phone: nextPhone() });

    expect(res.status).toBe(502);
    expect(JSON.stringify(res.body)).not.toContain('secret-abc');
    expect(JSON.stringify(res.body)).not.toContain('authkey');
  });

  it('still requires a phone number', async () => {
    const res = await request(app).post('/api/auth/otp/send').send({});
    expect(res.status).toBe(400);
  });

  it('keeps a previously issued OTP valid after a resend delivery failure', async () => {
    const phone = nextPhone();

    const firstSend = await request(app).post('/api/auth/otp/send').send({ phone });
    expect(firstSend.status).toBe(200);
    const originalOtp = firstSend.body.mock_otp as string;

    setProviderForTests(failingProvider('provider exploded'));

    const resend = await request(app).post('/api/auth/otp/send').send({ phone });
    expect(resend.status).toBe(502);

    const verify = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone, otp: originalOtp, name: 'Resend Test User' });

    expect(verify.status).toBe(200);
    expect(verify.body.token).toBeTruthy();
  });
});

async function issueOtp(phone: string): Promise<string> {
  const res = await request(app).post('/api/auth/otp/send').send({ phone });
  return res.body.mock_otp as string;
}

describe('POST /auth/otp/verify expiry', () => {
  it('rejects a code older than the TTL', async () => {
    const phone = nextPhone();
    const otp = await issueOtp(phone);

    // Backdate the issue time past the 300s window.
    const stale = new Date(Date.now() - 301 * 1000).toISOString();
    await db.update(schema.otps).set({ createdAt: stale }).where(eq(schema.otps.phone, phone));

    const res = await request(app).post('/api/auth/otp/verify').send({ phone, otp, name: 'Expired User' });

    expect(res.status).toBe(400);
    expect(res.body.detail).toMatch(/expired/i);
  });

  it('accepts a code inside the TTL', async () => {
    const phone = nextPhone();
    const otp = await issueOtp(phone);

    const res = await request(app).post('/api/auth/otp/verify').send({ phone, otp, name: 'Fresh User' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});

describe('POST /auth/otp/verify attempt cap', () => {
  it('increments attempts on each wrong guess', async () => {
    const phone = nextPhone();
    await issueOtp(phone);

    await request(app).post('/api/auth/otp/verify').send({ phone, otp: '000000' });
    await request(app).post('/api/auth/otp/verify').send({ phone, otp: '000001' });

    const [rec] = await db.select().from(schema.otps).where(eq(schema.otps.phone, phone)).limit(1);
    expect(rec.attempts).toBe(2);
  });

  it('returns 429 once the cap is reached, even for the correct code', async () => {
    const phone = nextPhone();
    const otp = await issueOtp(phone);

    for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
      await request(app).post('/api/auth/otp/verify').send({ phone, otp: '000000' });
    }

    const res = await request(app).post('/api/auth/otp/verify').send({ phone, otp, name: 'Brute User' });

    expect(res.status).toBe(429);
    expect(res.body.detail).toMatch(/too many/i);
  });

  it('resets the attempt counter when a new code is issued', async () => {
    const phone = nextPhone();
    await issueOtp(phone);
    await request(app).post('/api/auth/otp/verify').send({ phone, otp: '000000' });

    const fresh = await issueOtp(phone);
    const [rec] = await db.select().from(schema.otps).where(eq(schema.otps.phone, phone)).limit(1);
    expect(rec.attempts).toBe(0);

    const res = await request(app).post('/api/auth/otp/verify').send({ phone, otp: fresh, name: 'Reset User' });
    expect(res.status).toBe(200);
  });

  it('clears the row on successful verification', async () => {
    const phone = nextPhone();
    const otp = await issueOtp(phone);

    await request(app).post('/api/auth/otp/verify').send({ phone, otp, name: 'Clean User' });

    const rows = await db.select().from(schema.otps).where(eq(schema.otps.phone, phone));
    expect(rows).toHaveLength(0);
  });

  it('still honours the universal code with no stored row while mocking', async () => {
    // Regression guard for the ordering bug caught in spec review: the universal bypass must
    // precede the stored-row checks, because test helpers log in without calling /otp/send.
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: nextPhone(), otp: '123456', name: 'Universal User' });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });
});
