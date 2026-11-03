import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { nextPhone, onboardActiveProvider, registerUser } from './helpers';

/**
 * The board's "Multiple Owners": the main owner adds a co-owner by phone, the co-owner signs in
 * with their own OTP and runs the same business; plan payments and the owner list stay with the
 * main owner.
 */

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const signIn = async (phone: string, name = 'Co Owner') => {
  const r = await request(app).post('/api/auth/otp/verify').send({ phone, otp: '123456', name });
  expect(r.status).toBe(200);
  return { token: r.body.token as string, user: r.body.user };
};

describe('co-owners', () => {
  it('lets a co-owner sign in later and run the same business', async () => {
    const owner = await onboardActiveProvider({ name: 'Main Owner' });
    const phone = nextPhone();

    const add = await request(app).post('/api/providers/me/owners').set(auth(owner.token)).send({ phone, name: 'Sonam' });
    expect(add.status).toBe(201);
    expect(add.body.owners.map((o: any) => [o.role, o.joined])).toEqual([['owner', true], ['co_owner', false]]);

    const co = await signIn(phone, 'Sonam Bhutia');
    expect(co.user.role).toBe('provider');

    const me = await request(app).get('/api/providers/me').set(auth(co.token));
    expect(me.body.provider.id).toBe(owner.providerId);
    expect(me.body.provider.access).toBe('co_owner');

    // Same bookings inbox and the same profile edits.
    const inbox = await request(app).get('/api/bookings/provider').set(auth(co.token));
    expect(inbox.status).toBe(200);
    const edit = await request(app).patch('/api/providers/me').set(auth(co.token)).send({ profile: { host_bio: 'Edited by the co-owner' } });
    expect(edit.status).toBe(200);
    const seen = await request(app).get('/api/providers/me').set(auth(owner.token));
    expect(seen.body.provider.extras.host_bio).toBe('Edited by the co-owner');

    const list = await request(app).get('/api/providers/me/owners').set(auth(owner.token));
    expect(list.body.owners[1]).toMatchObject({ role: 'co_owner', joined: true, name: 'Sonam Bhutia' });
  });

  it('links an existing account straight away, matching the number however it was typed', async () => {
    const owner = await onboardActiveProvider({ name: 'Owner Two' });
    const phone = nextPhone();
    const existing = await registerUser({ name: 'Already Here', phone });
    const spaced = phone.replace(/^\+91/, '').replace(/(\d{5})(\d{5})/, '$1 $2');
    const add = await request(app).post('/api/providers/me/owners').set(auth(owner.token)).send({ phone: spaced });
    expect(add.status).toBe(201);
    expect(add.body.owners[1].joined).toBe(true);
    const me = await request(app).get('/api/providers/me').set(auth(existing.token));
    expect(me.body.provider?.id).toBe(owner.providerId);
  });

  it('keeps adding and removing owners, and paying, with the main owner', async () => {
    const owner = await onboardActiveProvider({ name: 'Owner Three' });
    const phone = nextPhone();
    await request(app).post('/api/providers/me/owners').set(auth(owner.token)).send({ phone });
    const co = await signIn(phone);

    const coAdds = await request(app).post('/api/providers/me/owners').set(auth(co.token)).send({ phone: nextPhone() });
    expect(coAdds.status).toBe(403);

    const coPays = await request(app).post('/api/payments/order').set(auth(co.token))
      .send({ flow: 'provider_renewal', reference_id: owner.providerId });
    expect(coPays.status).toBe(403);

    const list = await request(app).get('/api/providers/me/owners').set(auth(owner.token));
    const memberId = list.body.owners[1].id;
    const removed = await request(app).delete(`/api/providers/me/owners/${memberId}`).set(auth(owner.token));
    expect(removed.status).toBe(200);
    expect(removed.body.owners).toHaveLength(1);

    const after = await request(app).get('/api/providers/me').set(auth(co.token));
    expect(after.body.provider).toBeNull();
    const who = await request(app).get('/api/auth/me').set(auth(co.token));
    expect(who.body.user.role).toBe('tourist');
  });

  it('lets a co-owner leave on their own', async () => {
    const owner = await onboardActiveProvider({ name: 'Owner Four' });
    const phone = nextPhone();
    await request(app).post('/api/providers/me/owners').set(auth(owner.token)).send({ phone });
    const co = await signIn(phone);
    const list = await request(app).get('/api/providers/me/owners').set(auth(co.token));
    expect(list.body.access).toBe('co_owner');
    const mine = list.body.owners.find((o: any) => o.you);
    expect(mine.role).toBe('co_owner');
    const leave = await request(app).delete(`/api/providers/me/owners/${mine.id}`).set(auth(co.token));
    expect(leave.status).toBe(200);
    expect((await request(app).get('/api/providers/me').set(auth(co.token))).body.provider).toBeNull();
  });

  it('refuses your own number, duplicates, someone with their own business, and a sixth co-owner', async () => {
    const owner = await onboardActiveProvider({ name: 'Owner Five' });
    const other = await onboardActiveProvider({ name: 'Other Business' });
    const send = (phone: string) => request(app).post('/api/providers/me/owners').set(auth(owner.token)).send({ phone });

    expect((await send(owner.phone)).status).toBe(400);
    expect((await send('not a phone')).status).toBe(400);
    expect((await send(other.phone)).status).toBe(409);

    const first = nextPhone();
    expect((await send(first)).status).toBe(201);
    expect((await send(first)).status).toBe(409);
    for (let i = 0; i < 4; i++) expect((await send(nextPhone())).status).toBe(201);
    expect((await send(nextPhone())).status).toBe(409);
  });

  it('stops a co-owner from starting a second business of their own', async () => {
    const owner = await onboardActiveProvider({ name: 'Owner Six' });
    const phone = nextPhone();
    await request(app).post('/api/providers/me/owners').set(auth(owner.token)).send({ phone });
    const co = await signIn(phone);
    const onboard = await request(app).post('/api/providers/onboard').set(auth(co.token)).send({
      business_name: 'Side business', business_type: 'cafe', description: 'x', location: 'Darjeeling', contact_phone: phone,
    });
    expect(onboard.status).toBe(409);
  });
});
