import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { eq } from 'drizzle-orm';
import { nextPhone } from './helpers';

/**
 * `/auth/otp/send` used to check only that `phone` was present. Any string was reserved against
 * the daily OTP budget and handed to the messaging provider, and in mock mode the universal code
 * then verified it — so an account could exist whose identity was "not-a-number", and the
 * per-phone limits keyed on that raw string could be reset by picking a different one.
 */

const JUNK = [
  'not-a-number',
  'e2e-not-a-phone',
  '98765abcde',
  "'; DROP TABLE users; --",
  '+',
  '   ',
  '1234567',
  '1234567890123456',
];

describe('POST /auth/otp/send rejects what is not a phone number', () => {
  it.each(JUNK)('refuses %j', async (phone) => {
    const res = await request(app).post('/api/auth/otp/send').send({ phone });
    expect(res.status).toBe(400);
    expect(res.body.detail).toMatch(/phone number/i);
  });

  it('spends nothing on a rejected number — no OTP row is written', async () => {
    await request(app).post('/api/auth/otp/send').send({ phone: 'not-a-number' });
    const [row] = await db
      .select()
      .from(schema.otps)
      .where(eq(schema.otps.phone, 'not-a-number'))
      .limit(1);
    expect(row).toBeUndefined();
  });

  it('still accepts every spelling a real person might type', async () => {
    const digits = nextPhone().replace(/\D/g, '').slice(-10);
    for (const phone of [`+91${digits}`, `+91 ${digits}`, digits, `0${digits}`]) {
      const res = await request(app).post('/api/auth/otp/send').send({ phone });
      expect(res.status, phone).toBe(200);
    }
  });
});

describe('POST /auth/otp/verify rejects what is not a phone number', () => {
  it('will not mint a session for junk, even with the universal mock code', async () => {
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone: 'not-a-number', otp: '123456', name: 'Garbage Identity' });

    expect(res.status).toBe(400);
    expect(res.body.token).toBeUndefined();

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.phone, 'not-a-number'))
      .limit(1);
    expect(user).toBeUndefined();
  });
});

describe('POST /providers/onboard requires a reachable contact number', () => {
  async function signedIn() {
    const phone = nextPhone();
    await request(app).post('/api/auth/otp/send').send({ phone });
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone, otp: '123456', name: 'Norbu Lama' });
    return res.body.token as string;
  }

  const base = {
    business_name: 'Norbu Homestay',
    business_type: 'homestay',
    description: 'A family homestay above the Lebong valley.',
    location: 'Lebong, Darjeeling',
  };

  it('refuses a contact_phone travellers could not call', async () => {
    const token = await signedIn();
    const res = await request(app)
      .post('/api/providers/onboard')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...base, contact_phone: 'call me maybe' });

    expect(res.status).toBe(400);
    expect(res.body.detail).toMatch(/phone number/i);
  });

  it('accepts a real one', async () => {
    const token = await signedIn();
    const res = await request(app)
      .post('/api/providers/onboard')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...base, contact_phone: '+919876543210' });

    expect(res.status).toBe(200);
    expect(res.body.provider.contact_phone).toBe('+919876543210');
  });
});
