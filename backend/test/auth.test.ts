import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { eq } from 'drizzle-orm';
import { db, schema } from '../src/db';
import { nextPhone, registerUser } from './helpers';

describe('auth', () => {
  it('sends a mock OTP outside production', async () => {
    const phone = nextPhone();
    const res = await request(app).post('/api/auth/otp/send').send({ phone });
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
    expect(res.body.mock_otp).toMatch(/^\d{6}$/);
  });

  it('rejects otp/send with no phone', async () => {
    const res = await request(app).post('/api/auth/otp/send').send({});
    expect(res.status).toBe(400);
  });

  it('verifies with the returned mock OTP and creates a new user', async () => {
    const phone = nextPhone();
    const sendRes = await request(app).post('/api/auth/otp/send').send({ phone });
    const otp = sendRes.body.mock_otp;

    const verifyRes = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone, otp, name: 'Ada Lovelace', role: 'tourist' });

    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.token).toBeTruthy();
    expect(verifyRes.body.user.name).toBe('Ada Lovelace');
    expect(verifyRes.body.user.role).toBe('tourist');
  });

  it('accepts the universal 123456 code outside production', async () => {
    const { user } = await registerUser({ name: 'Grace Hopper' });
    expect(user.name).toBe('Grace Hopper');
  });

  it('rejects an invalid OTP', async () => {
    const phone = nextPhone();
    await request(app).post('/api/auth/otp/send').send({ phone });
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone, otp: '000000', name: 'Someone' });
    expect(res.status).toBe(400);
  });

  it('requires a name for first-time registration', async () => {
    const phone = nextPhone();
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone, otp: '123456' });
    expect(res.status).toBe(400);
  });

  it('reuses the same user id across logins for the same phone', async () => {
    const phone = nextPhone();
    const first = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone, otp: '123456', name: 'Repeat User' });
    const second = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone, otp: '123456' });
    expect(second.status).toBe(200);
    expect(second.body.user.id).toBe(first.body.user.id);
  });

  it('rejects /auth/me without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the current user for a valid token', async () => {
    const { token, user } = await registerUser({ name: 'Token Holder' });
    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.user.id).toBe(user.id);
  });

  it('logs the hardcoded admin in with correct credentials', async () => {
    const res = await request(app)
      .post('/api/auth/admin/login')
      .send({ phone: 'admin', password: 'test_admin_password' });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('admin');
  });

  it('rejects admin login with the wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/admin/login')
      .send({ phone: 'admin', password: 'wrong_password' });
    expect(res.status).toBe(401);
  });

  it('records when the user ticked I Agree, once, and does not require it from older apps', async () => {
    const phone = nextPhone();
    const first = await request(app).post('/api/auth/otp/verify').send({ phone, otp: '123456', name: 'Consenting Guest', consent: true });
    expect(first.status).toBe(200);
    const [row] = await db.select().from(schema.users).where(eq(schema.users.phone, phone));
    expect(row.termsAcceptedAt).toBeTruthy();

    const again = await request(app).post('/api/auth/otp/verify').send({ phone, otp: '123456', consent: true });
    expect(again.status).toBe(200);
    const [same] = await db.select().from(schema.users).where(eq(schema.users.phone, phone));
    expect(same.termsAcceptedAt).toBe(row.termsAcceptedAt);

    const oldApp = nextPhone();
    const legacy = await request(app).post('/api/auth/otp/verify').send({ phone: oldApp, otp: '123456', name: 'Old App User' });
    expect(legacy.status).toBe(200);
    const [noConsent] = await db.select().from(schema.users).where(eq(schema.users.phone, oldApp));
    expect(noConsent.termsAcceptedAt).toBeNull();
  });
});
