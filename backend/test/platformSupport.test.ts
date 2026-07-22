import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { nextPhone } from './helpers';

describe('support column', () => {
  // Registers through the raw endpoint rather than the registerUser helper on purpose: a later
  // task makes that helper pay the fee by default, and this test must keep describing a user
  // who has never paid.
  it('starts a newly registered tourist with no support expiry', async () => {
    const phone = nextPhone();
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone, otp: '123456', name: 'Fresh Tourist' });

    expect(res.status).toBe(200);
    expect(res.body.user.supportExpiresAt).toBeNull();
  });
});
