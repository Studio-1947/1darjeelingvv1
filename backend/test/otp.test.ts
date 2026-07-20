import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { setProviderForTests, getProvider, MessageDeliveryError } from '../src/messaging';
import { nextPhone } from './helpers';

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
