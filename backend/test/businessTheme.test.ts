import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../src/app';
import { db, schema } from '../src/db';
import { onboardActiveProvider } from './helpers';
import { profilePatchFrom, themeOf } from '../src/lib/hostProfile';

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
const me = (token: string) => request(app).get('/api/providers/me').set(auth(token));
const patchTheme = (token: string, theme: unknown) =>
  request(app).patch('/api/providers/me').set(auth(token)).send({ profile: { theme } });

describe('business theme colour (prototype palette.js "For my business")', () => {
  it('accepts a palette key or a #RRGGBB colour, and refuses anything else', () => {
    expect(profilePatchFrom('homestay', { theme: 'tea' })).toEqual({ theme: 'tea' });
    expect(profilePatchFrom('driver', { theme: '#3f5a8a' })).toEqual({ theme: '#3F5A8A' });
    expect(profilePatchFrom('cafe', { theme: '' })).toEqual({ theme: '' });
    expect(profilePatchFrom('shop', { theme: 'neon' })).toHaveProperty('error');
    expect(profilePatchFrom('guide', { theme: '#12345' })).toHaveProperty('error');
    expect(profilePatchFrom('guide', { theme: 7 })).toHaveProperty('error');
    expect(themeOf('studio1947')).toBe('studio1947');
    expect(themeOf('url(javascript:1)')).toBeUndefined();
  });

  it('saves the theme through PATCH /providers/me and returns it from /providers/me and the public page', async () => {
    const { token } = await onboardActiveProvider({ name: 'Tinted Host' });
    expect((await me(token)).body.provider.theme).toBeNull();

    const saved = await patchTheme(token, 'rhodo');
    expect(saved.status).toBe(200);
    expect(saved.body.provider.theme).toBe('rhodo');

    const provider = (await me(token)).body.provider;
    expect(provider.theme).toBe('rhodo');
    const page = await request(app).get(`/api/providers/page/homestay/${provider.slug}`);
    expect(page.status).toBe(200);
    expect(page.body.page.theme).toBe('rhodo');

    expect((await patchTheme(token, '#5e7f4f')).body.provider.theme).toBe('#5E7F4F');
    expect((await request(app).get(`/api/providers/page/homestay/${provider.slug}`)).body.page.theme).toBe('#5E7F4F');

    // Cleared: the page follows aangan's own colours again.
    expect((await patchTheme(token, '')).body.provider.theme).toBeNull();
    expect((await request(app).get(`/api/providers/page/homestay/${provider.slug}`)).body.page.theme).toBeUndefined();
  });

  it('refuses a theme that is not a palette or a colour', async () => {
    const { token } = await onboardActiveProvider({ name: 'Garish Host' });
    const res = await patchTheme(token, 'red; background:url(x)');
    expect(res.status).toBe(400);
    expect((await me(token)).body.provider.theme).toBeNull();
  });
});

describe('"N are in" on the home List your business card', () => {
  it('counts the active hosts and shows up to three faces of public hosts who set a photo', async () => {
    const empty = await request(app).get('/api/app/host-signup');
    expect(empty.status).toBe(200);
    expect(empty.body).toMatchObject({ live_hosts: 0, recent_hosts: [] });

    const hosts = [];
    for (let i = 0; i < 5; i++) hosts.push(await onboardActiveProvider({ name: `Face Host ${i}` }));
    // Four of the five set a photo.
    for (let i = 0; i < 4; i++) {
      const r = await request(app).patch('/api/providers/me').set(auth(hosts[i].token))
        .send({ profile: { host_avatar: `https://cdn.test/face-${i}.jpg` } });
      expect(r.status).toBe(200);
    }
    // One with a photo is still waiting for the document check: public all the same (like the prototype).
    await db.update(schema.providers).set({ approvalRequired: true, kycStatus: 'pending' })
      .where(eq(schema.providers.id, hosts[3].providerId));
    // A host who has not paid is not counted.
    await db.update(schema.providers).set({ status: 'pending_payment' }).where(eq(schema.providers.id, hosts[4].providerId));

    const res = await request(app).get('/api/app/host-signup');
    expect(res.status).toBe(200);
    expect(res.body.live_hosts).toBe(4);
    expect(res.body.recent_hosts).toHaveLength(3);
    const avatars = res.body.recent_hosts.map((h: any) => h.avatar);
    expect(avatars.every((a: string) => /^https:\/\/cdn\.test\/face-[0-3]\.jpg$/.test(a))).toBe(true);
    expect(res.body.recent_hosts[0]).toEqual({ name: expect.any(String), avatar: expect.any(String) });
    // Nothing private: no phone numbers or ids.
    expect(JSON.stringify(res.body.recent_hosts)).not.toMatch(/\+91/);
  });
});
