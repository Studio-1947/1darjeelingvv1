import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { readAccountPatch, MAX_NAME_LEN } from '../src/lib/accountFields';
import { registerUser } from './helpers';

/** Audits 2026-11-06 and -08: PATCH /users/me stored name, email, photo and language as sent. */
const patchMe = (token: string, body: Record<string, unknown>) =>
  request(app).patch('/api/users/me').set('Authorization', `Bearer ${token}`).send(body);

describe('readAccountPatch', () => {
  it('trims and keeps good values', () => {
    expect(readAccountPatch({ name: '  Pema   Sherpa ', email: ' pema@example.com ', avatar: 'https://cdn.example.com/a.jpg', language: 'hi' }))
      .toEqual({ patch: { name: 'Pema Sherpa', email: 'pema@example.com', avatar: 'https://cdn.example.com/a.jpg', language: 'hi' } });
  });
  it('clears email and photo with null or an empty string', () => {
    expect(readAccountPatch({ email: '', avatar: null })).toEqual({ patch: { email: null, avatar: null } });
  });
  it('refuses bad values', () => {
    for (const body of [
      { name: 'x'.repeat(MAX_NAME_LEN + 1) }, { name: '   ' }, { name: 42 },
      { email: 'not-an-email' }, { email: 'a@b' }, { email: 5 },
      { avatar: 'javascript:alert(1)' }, { avatar: 'data:image/png;base64,AAA' }, { avatar: 'ftp://x/y.jpg' },
      { language: 'zz-not-a-language' }, { language: 'English' },
    ]) {
      expect('error' in readAccountPatch(body), JSON.stringify(body)).toBe(true);
    }
  });
  it('ignores fields that were not sent', () => {
    expect(readAccountPatch({})).toEqual({ patch: {} });
  });
});

describe('PATCH /users/me', () => {
  it('refuses a 5,000-letter name, a bad email, a javascript: photo and an unknown language', async () => {
    const { token } = await registerUser({ name: 'Field Tester' });
    for (const body of [{ name: 'x'.repeat(5000) }, { email: 'not-an-email' }, { avatar: 'javascript:alert(1)' }, { language: 'zz-not-a-language' }]) {
      expect((await patchMe(token, body)).status, JSON.stringify(body).slice(0, 40)).toBe(400);
    }
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(me.body.user.name).toBe('Field Tester');
  });

  it('still saves what the website and app send', async () => {
    const { token } = await registerUser({ name: 'Real Person' });
    // The website's Edit profile form.
    const web = await patchMe(token, { name: 'Real Person', email: 'real@example.com', avatar: 'https://aanganerp.in/one-darjeeling/a.jpg', whatsapp: null, gender: null, age: null, address: null, pincode: null, interests: ['nature'], liked_foods: [], traveller_type: null, diet: null });
    expect(web.status).toBe(200);
    expect(web.body.user.email).toBe('real@example.com');
    // The app's form leaves email out when empty; the website sends null to clear it.
    expect((await patchMe(token, { name: 'Real Person', email: undefined })).status).toBe(200);
    const cleared = await patchMe(token, { email: null, avatar: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.user.email).toBeNull();
  });

  it('cannot change role or other fields through the profile', async () => {
    const { token } = await registerUser({ name: 'Not Admin' });
    const res = await patchMe(token, { role: 'admin', phone: '+911111111111' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('tourist');
  });
});

describe('sign-up name', () => {
  it('refuses a name longer than the limit', async () => {
    const res = await request(app).post('/api/auth/otp/verify').send({ phone: '+919812300001', otp: '123456', name: 'y'.repeat(500) });
    expect(res.status).toBe(400);
  });
});
