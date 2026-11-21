import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { and, eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { parseBroadcast } from '../src/lib/broadcast';
import { loginAdmin, onboardActiveProvider, registerUser } from './helpers';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const phone = () => `+9198${Math.floor(10000000 + Math.random() * 89999999)}`;

describe('admin: push notifications (broadcasts)', () => {
  it('checks the form: audience, title, message, link', () => {
    const base = { audience: 'everyone', title: 'Hello', body: 'Message' };
    expect(parseBroadcast(base).ok).toBe(true);
    expect(parseBroadcast({ ...base, audience: 'aliens' })).toMatchObject({ ok: false });
    expect(parseBroadcast({ ...base, title: '  ' })).toMatchObject({ ok: false, error: 'Write a title' });
    expect(parseBroadcast({ ...base, title: 'x'.repeat(66) })).toMatchObject({ ok: false });
    expect(parseBroadcast({ ...base, body: 'x'.repeat(241) })).toMatchObject({ ok: false });
    expect(parseBroadcast({ ...base, link: 'feed' })).toMatchObject({ ok: true, value: { link: 'feed' } });
    expect(parseBroadcast({ ...base, link: 'https://aanganerp.in/events' }).ok).toBe(true);
    expect(parseBroadcast({ ...base, link: 'javascript:alert(1)' })).toMatchObject({ ok: false });
    expect(parseBroadcast({ ...base, link: 'http://example.com' })).toMatchObject({ ok: false });
    expect(parseBroadcast({ ...base, audience: 'person' })).toMatchObject({ ok: false });
    expect(parseBroadcast({ ...base, audience: 'hosts', business_type: 'spaceship' })).toMatchObject({ ok: false });
    // A business type only narrows hosts.
    expect(parseBroadcast({ ...base, audience: 'travellers', business_type: 'cafe' })).toMatchObject({ ok: true, value: { businessType: null } });
  });

  it('sends to one person by phone, in any spelling, and it shows in their Activity with its link', async () => {
    const admin = await loginAdmin();
    const num = phone();
    const t = await registerUser({ name: 'Broadcast Bina', phone: num });
    const spaced = `${num.slice(3, 8)} ${num.slice(8)}`; // the ten digits, typed with a space

    const count = await request(app).get('/api/admin/broadcasts/audience').query({ audience: 'person', phone: spaced }).set(auth(admin));
    expect(count.status).toBe(200);
    expect(count.body).toMatchObject({ people: 1, devices: 0 });

    const sent = await request(app).post('/api/admin/broadcasts').set(auth(admin))
      .send({ audience: 'person', phone: spaced, title: 'Tea festival this weekend', body: 'Join us at Happy Valley.', link: 'feed' });
    expect(sent.status).toBe(201);
    expect(sent.body.broadcast).toMatchObject({ recipients: 1, audience: 'person', link: 'feed' });

    const feed = await request(app).get('/api/notifications').set(auth(t.token));
    const note = feed.body.items.find((n: any) => n.ref_id === sent.body.broadcast.id);
    expect(note).toMatchObject({ kind: 'announcement', title: 'Tea festival this weekend', body: 'Join us at Happy Valley.', link: 'feed', unread: true });

    // Opening it counts in the history.
    await request(app).patch(`/api/notifications/${note.id}/read`).set(auth(t.token));
    const history = await request(app).get('/api/admin/broadcasts').set(auth(admin));
    expect(history.status).toBe(200);
    expect(history.body.items.find((b: any) => b.id === sent.body.broadcast.id)).toMatchObject({ opened: 1, recipients: 1 });
    expect(history.body.options.links).toContain('feed');
  });

  it('says so when nobody has that number, and records nothing', async () => {
    const admin = await loginAdmin();
    const res = await request(app).post('/api/admin/broadcasts').set(auth(admin))
      .send({ audience: 'person', phone: '+919000000001', title: 'Hi', body: 'There' });
    expect(res.status).toBe(404);
    const rows = await db.select().from(schema.broadcasts).where(eq(schema.broadcasts.phone, '+919000000001'));
    expect(rows).toHaveLength(0);
  });

  it('keeps hosts and travellers apart, narrows hosts by business type, and never includes admins', async () => {
    const admin = await loginAdmin();
    const traveller = await registerUser({ name: 'Only Travelling' });
    const ownerOf = async (providerId: string) =>
      ({ user: { id: (await db.select().from(schema.providers).where(eq(schema.providers.id, providerId)))[0].userId } });
    const cafe = await ownerOf((await onboardActiveProvider({ name: 'Broadcast Cafe', businessType: 'cafe' })).providerId);
    const stay = await ownerOf((await onboardActiveProvider({ name: 'Broadcast Stay', businessType: 'homestay' })).providerId);

    const sendTo = async (body: Record<string, unknown>) => {
      const res = await request(app).post('/api/admin/broadcasts').set(auth(admin)).send({ title: `T ${uuidv4().slice(0, 6)}`, body: 'B', ...body });
      expect(res.status).toBe(201);
      const rows = await db.select({ userId: schema.notifications.userId }).from(schema.notifications)
        .where(and(eq(schema.notifications.refId, res.body.broadcast.id), eq(schema.notifications.kind, 'announcement')));
      return new Set(rows.map((r) => r.userId));
    };

    const cafes = await sendTo({ audience: 'hosts', business_type: 'cafe' });
    expect(cafes.has(cafe.user.id)).toBe(true);
    expect(cafes.has(stay.user.id)).toBe(false);
    expect(cafes.has(traveller.user.id)).toBe(false);

    const hosts = await sendTo({ audience: 'hosts' });
    expect(hosts.has(cafe.user.id) && hosts.has(stay.user.id)).toBe(true);
    expect(hosts.has(traveller.user.id)).toBe(false);

    const travellers = await sendTo({ audience: 'travellers' });
    expect(travellers.has(traveller.user.id)).toBe(true);
    expect(travellers.has(cafe.user.id)).toBe(false);

    const everyone = await sendTo({ audience: 'everyone' });
    expect(everyone.has(traveller.user.id) && everyone.has(cafe.user.id)).toBe(true);
    const admins = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.role, 'admin'));
    expect(admins.some((a) => everyone.has(a.id))).toBe(false);
  });

  it('is admin only', async () => {
    const t = await registerUser({ name: 'Not An Admin' });
    expect((await request(app).get('/api/admin/broadcasts').set(auth(t.token))).status).toBe(403);
    expect((await request(app).post('/api/admin/broadcasts').set(auth(t.token)).send({ audience: 'everyone', title: 'x', body: 'y' })).status).toBe(403);
  });
});
