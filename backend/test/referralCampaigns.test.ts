import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { loginAdmin, nextPhone, registerUser } from './helpers';

// Codes are unique across the whole table and the table is not emptied between tests, so each test
// makes its own.
let n = 0;
const uniq = (base: string) => `${base}${Date.now().toString(36).slice(-4)}${(n += 1)}`.slice(0, 20);

async function makeCode(admin: string, body: Record<string, unknown>) {
  return request(app).post('/api/admin/referrals').set('Authorization', `Bearer ${admin}`).send(body);
}

/** Signs up a new account the way the sign-in screen does, with a referral code. */
async function signUp(code: string, role: 'tourist' | 'provider' = 'tourist', name = 'Code User') {
  const phone = nextPhone();
  const res = await request(app).post('/api/auth/otp/verify').send({ phone, otp: '123456', name, role, referral_code: code });
  expect(res.status).toBe(200);
  return { token: res.body.token as string, user: res.body.user, phone };
}

describe('admin referral codes', () => {
  it('makes a custom code, matched without case or dashes, and refuses a second one like it', async () => {
    const admin = await loginAdmin();
    const code = uniq('amitAangan');
    const made = await makeCode(admin, { code, name: 'Amit, field team Mirik' });
    expect(made.status).toBe(201);
    expect(made.body.item.code).toBe(code);
    expect(made.body.item.state).toBe('active');

    const again = await makeCode(admin, { code: code.toUpperCase().replace(/(.{4})/, '$1-'), name: 'Copy' });
    expect(again.status).toBe(409);
  });

  it('refuses a code with other characters, one too long, and one shaped like a member\'s own', async () => {
    const admin = await loginAdmin();
    expect((await makeCode(admin, { code: 'amit aangan', name: 'Amit' })).status).toBe(400);
    expect((await makeCode(admin, { code: 'x'.repeat(21), name: 'Amit' })).status).toBe(400);
    expect((await makeCode(admin, { code: 'ANG26-ABCDEF', name: 'Amit' })).status).toBe(400);
    expect((await makeCode(admin, { code: 'okcode1', name: '' })).status).toBe(400);
  });

  it('makes up a code when none is given', async () => {
    const admin = await loginAdmin();
    const made = await makeCode(admin, { name: 'Poster run' });
    expect(made.status).toBe(201);
    expect(made.body.item.code).toMatch(/^AANGAN-[A-Z0-9]{5}$/);
  });

  it('is admin only', async () => {
    const { token } = await registerUser({ name: 'Not Admin' });
    expect((await request(app).get('/api/admin/referrals').set('Authorization', `Bearer ${token}`)).status).toBe(403);
    expect((await request(app).post('/api/admin/referrals').set('Authorization', `Bearer ${token}`).send({ name: 'x' })).status).toBe(403);
  });

  it('counts travellers and hosts, hosts by business type and live, and lists who joined', async () => {
    const admin = await loginAdmin();
    const code = uniq('rahulAangan');
    const made = await makeCode(admin, { code, name: 'Rahul' });
    const id = made.body.item.id;

    // A traveller types it in another case; a host comes through a host link.
    await signUp(code.toLowerCase(), 'tourist', 'Traveller One');
    const host = await signUp(code, 'provider', 'Host One');
    const onboard = await request(app).post('/api/providers/onboard').set('Authorization', `Bearer ${host.token}`).send({
      business_name: 'Host One Homestay', business_type: 'homestay', description: 'Rooms with a view', location: 'Mirik', contact_phone: host.phone,
    });
    expect(onboard.status).toBe(200);
    await db.update(schema.providers).set({ status: 'active', kycStatus: 'verified' }).where(eq(schema.providers.id, onboard.body.provider.id));

    const report = await request(app).get(`/api/admin/referrals/${id}`).set('Authorization', `Bearer ${admin}`);
    expect(report.status).toBe(200);
    expect(report.body.item).toMatchObject({ uses: 2, travellers: 1, hosts: 1, hosts_live: 1 });
    expect(report.body.item.by_type.homestay).toBe(1);
    expect(report.body.signups.map((s: any) => s.type).sort()).toEqual(['host', 'traveller']);
    expect(report.body.signups.find((s: any) => s.type === 'host')).toMatchObject({ business_type: 'homestay', joined_as: 'host', live: true });

    const list = await request(app).get('/api/admin/referrals').set('Authorization', `Bearer ${admin}`);
    expect(list.body.items.find((i: any) => i.id === id)).toMatchObject({ uses: 2, travellers: 1, hosts: 1 });
  });

  it('a paused, full or host-only code does not count, and never stops the sign-up', async () => {
    const admin = await loginAdmin();
    const paused = (await makeCode(admin, { code: uniq('paused'), name: 'Paused' })).body.item;
    await request(app).patch(`/api/admin/referrals/${paused.id}`).set('Authorization', `Bearer ${admin}`).send({ active: false });
    await signUp(paused.code);

    const full = (await makeCode(admin, { code: uniq('full'), name: 'Full', max_uses: 1 })).body.item;
    await signUp(full.code);
    await signUp(full.code);

    const hostsOnly = (await makeCode(admin, { code: uniq('hosts'), name: 'Hosts', audience: 'host' })).body.item;
    await signUp(hostsOnly.code, 'tourist');

    const get = async (id: string) => (await request(app).get(`/api/admin/referrals/${id}`).set('Authorization', `Bearer ${admin}`)).body.item;
    expect((await get(paused.id)).uses).toBe(0);
    expect((await get(paused.id)).state).toBe('paused');
    expect((await get(full.id)).uses).toBe(1);
    expect((await get(full.id)).state).toBe('full');
    expect((await get(hostsOnly.id)).uses).toBe(0);
  });

  it('gives a traveller the code\'s reward days, and a member\'s own code still works as before', async () => {
    const admin = await loginAdmin();
    const gift = (await makeCode(admin, { code: uniq('gift'), name: 'Gift', reward_days: 30 })).body.item;
    const t = await signUp(gift.code, 'tourist');
    expect(t.user.supportExpiresAt ?? t.user.support_expires_at).toBeTruthy();

    const friend = await registerUser({ name: 'Friend Referrer' });
    const [row] = await db.select({ code: schema.users.referralCode }).from(schema.users).where(eq(schema.users.id, friend.user.id));
    const referred = await signUp(row.code!, 'tourist');
    const [ledger] = await db.select().from(schema.referrals).where(eq(schema.referrals.refereeId, referred.user.id));
    expect(ledger?.referrerId).toBe(friend.user.id);
  });
});
