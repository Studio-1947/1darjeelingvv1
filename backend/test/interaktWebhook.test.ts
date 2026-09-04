import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';

const SECRET = 'test_interakt_webhook_secret';

function signed(payload: unknown) {
  const raw = JSON.stringify(payload);
  const signature = `sha256=${crypto.createHmac('sha256', SECRET).update(raw).digest('hex')}`;
  return { raw, signature };
}

describe('Interakt delivery webhook', () => {
  it('rejects an invalid signature before parsing or recording the event', async () => {
    const res = await request(app)
      .post('/api/webhooks/interakt')
      .set('Content-Type', 'application/json')
      .set('Interakt-Signature', 'sha256=not-a-real-signature')
      .send(JSON.stringify({ event: 'message_api_delivered', callbackData: 'aangan:otp:challenge-1' }));

    expect(res.status).toBe(401);
  });

  it('accepts a signed API-template delivery status', async () => {
    const { raw, signature } = signed({ event: 'message_api_delivered', callbackData: 'aangan:otp:challenge-1' });
    const res = await request(app)
      .post('/api/webhooks/interakt')
      .set('Content-Type', 'application/json')
      .set('Interakt-Signature', signature)
      .send(raw);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});
