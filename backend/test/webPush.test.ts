import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { isPushServiceUrl, parseSubscription, sendWebPushMessages, webSubscriptionsFor } from '../src/lib/webPush';
import { loginAdmin, registerUser } from './helpers';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const phone = () => `+9198${Math.floor(10000000 + Math.random() * 89999999)}`;

// The shapes a real browser's PushSubscription.toJSON() has.
const P256DH = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM';
const AUTH = 'tBHItJI5svbpez7KI4CCXg';
const sub = (id = Math.random().toString(36).slice(2)) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${id}`,
  expirationTime: null,
  keys: { p256dh: P256DH, auth: AUTH },
});

describe('website push notifications', () => {
  it('accepts only real push services, so the server never posts somewhere it should not', () => {
    expect(isPushServiceUrl('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(isPushServiceUrl('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(isPushServiceUrl('https://web.push.apple.com/QGx')).toBe(true);
    expect(isPushServiceUrl('https://wns2-par02p.notify.windows.com/w/?token=abc')).toBe(true);
    expect(isPushServiceUrl('http://fcm.googleapis.com/fcm/send/abc')).toBe(false);
    expect(isPushServiceUrl('https://fcm.googleapis.com:8443/x')).toBe(false);
    expect(isPushServiceUrl('https://evilfcm.googleapis.com.attacker.io/x')).toBe(false);
    expect(isPushServiceUrl('https://notfcm.googleapis.com.evil/x')).toBe(false);
    expect(isPushServiceUrl('https://169.254.169.254/latest/meta-data')).toBe(false);
    expect(isPushServiceUrl('https://localhost/x')).toBe(false);
    expect(isPushServiceUrl('not a url')).toBe(false);

    expect(parseSubscription(sub()).ok).toBe(true);
    expect(parseSubscription({ ...sub(), keys: { p256dh: 'short', auth: AUTH } }).ok).toBe(false);
    expect(parseSubscription({ ...sub(), keys: { p256dh: P256DH, auth: 'bad auth!' } }).ok).toBe(false);
    expect(parseSubscription(null).ok).toBe(false);
  });

  it('gives browsers the public key', async () => {
    const res = await request(app).get('/api/notifications/web-push/key');
    expect(res.status).toBe(200);
    expect(res.body.key).toMatch(/^B[A-Za-z0-9_-]{80,}$/);
  });

  it('registers a browser for the signed-in person, moves it on a new sign-in, and forgets it on sign-out', async () => {
    const a = await registerUser({ name: 'Push Asha', phone: phone() });
    const b = await registerUser({ name: 'Push Bikash', phone: phone() });
    const s = sub();

    expect((await request(app).post('/api/notifications/web-push').send(s)).status).toBe(401);
    expect((await request(app).post('/api/notifications/web-push').set(auth(a.token))
      .send({ ...s, endpoint: 'https://example.com/push' })).status).toBe(400);

    expect((await request(app).post('/api/notifications/web-push').set(auth(a.token)).send(s)).status).toBe(200);
    // Again from the same browser: still one row.
    expect((await request(app).post('/api/notifications/web-push').set(auth(a.token)).send(s)).status).toBe(200);
    let rows = await db.select().from(schema.webPushSubscriptions).where(eq(schema.webPushSubscriptions.endpoint, s.endpoint));
    expect(rows).toHaveLength(1);
    expect(rows[0].userId).toBe(a.user.id);

    // Someone else signs in on that browser and turns them on: it is theirs now.
    await request(app).post('/api/notifications/web-push').set(auth(b.token)).send(s);
    rows = await db.select().from(schema.webPushSubscriptions).where(eq(schema.webPushSubscriptions.endpoint, s.endpoint));
    expect(rows.map((r) => r.userId)).toEqual([b.user.id]);

    // Sign-out works even without a session.
    expect((await request(app).delete('/api/notifications/web-push').send({ endpoint: s.endpoint })).status).toBe(200);
    rows = await db.select().from(schema.webPushSubscriptions).where(eq(schema.webPushSubscriptions.endpoint, s.endpoint));
    expect(rows).toHaveLength(0);
  });

  it('keeps at most ten browsers per person', async () => {
    const a = await registerUser({ name: 'Many Browsers', phone: phone() });
    for (let i = 0; i < 12; i += 1) {
      await request(app).post('/api/notifications/web-push').set(auth(a.token)).send(sub(`many-${a.user.id}-${i}`));
    }
    expect(await webSubscriptionsFor([a.user.id])).toHaveLength(10);
  });

  it('sends the notification as JSON and forgets browsers the push service says are gone', async () => {
    const a = await registerUser({ name: 'Gone Browser', phone: phone() });
    const live = sub();
    const gone = sub();
    await request(app).post('/api/notifications/web-push').set(auth(a.token)).send(live);
    await request(app).post('/api/notifications/web-push').set(auth(a.token)).send(gone);

    const payloads: string[] = [];
    const send = async (to: { endpoint: string }, payload: string) => {
      payloads.push(payload);
      if (to.endpoint === gone.endpoint) throw Object.assign(new Error('Gone'), { statusCode: 410 });
      return { statusCode: 201 };
    };
    const subs = await webSubscriptionsFor([a.user.id]);
    const res = await sendWebPushMessages(
      subs.map((to) => ({ to, content: { title: 'New request', body: 'Asha wants to stay', data: { kind: 'booking_request', host: true } } })),
      'test',
      { send, force: true }
    );
    expect(res).toEqual({ devices: 2, ok: 1, failed: 1 });
    expect(JSON.parse(payloads[0])).toEqual({ title: 'New request', body: 'Asha wants to stay', data: { kind: 'booking_request', host: true } });
    expect((await webSubscriptionsFor([a.user.id])).map((s) => s.endpoint)).toEqual([live.endpoint]);
  });

  it('counts browsers in a broadcast audience', async () => {
    const admin = await loginAdmin();
    const num = phone();
    const a = await registerUser({ name: 'Broadcast Browser', phone: num });
    await request(app).post('/api/notifications/web-push').set(auth(a.token)).send(sub());
    const count = await request(app).get('/api/admin/broadcasts/audience').query({ audience: 'person', phone: num }).set(auth(admin));
    expect(count.body).toMatchObject({ people: 1, devices: 1, phones: 0, browsers: 1, with_app: 1 });
  });
});
