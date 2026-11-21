import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { app } from '../src/app';

// A stand-in for Apple: our own key, published the way appleid.apple.com/auth/keys publishes its own.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const KID = 'test-key-1';
const realFetch = globalThis.fetch;

beforeAll(() => {
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (String(url).startsWith('https://appleid.apple.com/auth/keys')) {
      return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
    }
    return realFetch(url, init);
  });
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function appleToken(claims: Record<string, unknown>, opts: { aud?: string; iss?: string } = {}) {
  return jwt.sign(claims, privateKey, {
    algorithm: 'RS256',
    keyid: KID,
    issuer: opts.iss ?? 'https://appleid.apple.com',
    audience: opts.aud ?? 'io.aangan.app',
    expiresIn: '5m',
  });
}

describe('Sign in with Apple', () => {
  it('creates an account on first sign-in and returns the same one after', async () => {
    const token = appleToken({ sub: 'apple-user-1', email: 'guest@privaterelay.appleid.com', email_verified: 'true' });
    const first = await request(app).post('/api/auth/apple').send({ identity_token: token, name: 'Pema Lepcha' });
    expect(first.status).toBe(200);
    expect(first.body.token).toBeTruthy();
    expect(first.body.user.name).toBe('Pema Lepcha');

    // Apple sends the name only once; a later sign-in must not need it.
    const again = await request(app).post('/api/auth/apple').send({ identity_token: appleToken({ sub: 'apple-user-1' }) });
    expect(again.status).toBe(200);
    expect(again.body.user.id).toBe(first.body.user.id);
  });

  it('checks the nonce when one is sent', async () => {
    const raw = 'one-time-value';
    const nonce = createHash('sha256').update(raw).digest('hex');
    const ok = await request(app).post('/api/auth/apple')
      .send({ identity_token: appleToken({ sub: 'apple-user-2', nonce }), raw_nonce: raw });
    expect(ok.status).toBe(200);
    const bad = await request(app).post('/api/auth/apple')
      .send({ identity_token: appleToken({ sub: 'apple-user-2', nonce }), raw_nonce: 'something-else' });
    expect(bad.status).toBe(400);
  });

  it('refuses a token for another app or from another issuer', async () => {
    const otherApp = await request(app).post('/api/auth/apple')
      .send({ identity_token: appleToken({ sub: 'x' }, { aud: 'com.someone.else' }) });
    expect(otherApp.status).toBe(400);
    const otherIssuer = await request(app).post('/api/auth/apple')
      .send({ identity_token: appleToken({ sub: 'x' }, { iss: 'https://evil.example' }) });
    expect(otherIssuer.status).toBe(400);
  });

  it('needs a token', async () => {
    const res = await request(app).post('/api/auth/apple').send({});
    expect(res.status).toBe(400);
  });
});
