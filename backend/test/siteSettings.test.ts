import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { resetSiteSettingsCache } from '../src/lib/siteSettings';
import { loginAdmin, registerUser } from './helpers';

const as = (token: string) => ({ Authorization: `Bearer ${token}` });
const status = async () => (await request(app).get('/api/app/status')).body.maintenance;

/** The maintenance switch on the admin panel's Overview tab (lib/siteSettings.ts). */
describe('admin maintenance switch', () => {
  beforeEach(() => resetSiteSettingsCache());
  afterEach(() => {
    vi.unstubAllEnvs();
    resetSiteSettingsCache();
  });

  it('is admin only', async () => {
    const { token } = await registerUser({ name: 'Not Admin' });
    expect((await request(app).get('/api/admin/settings/maintenance')).status).toBe(401);
    expect((await request(app).get('/api/admin/settings/maintenance').set(as(token))).status).toBe(403);
    const put = await request(app).put('/api/admin/settings/maintenance').set(as(token)).send({ enabled: true });
    expect(put.status).toBe(403);
    expect(await status()).toBe(false);
  });

  it('follows the .env default until an admin chooses', async () => {
    const admin = await loginAdmin();
    vi.stubEnv('MAINTENANCE', 'true');
    const res = await request(app).get('/api/admin/settings/maintenance').set(as(admin));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ enabled: true, source: 'env', env_default: true, updated_at: null });
    expect(await status()).toBe(true);
  });

  it('turns the website maintenance screen on and off, over the .env default', async () => {
    const admin = await loginAdmin();
    vi.stubEnv('MAINTENANCE', 'false');

    const on = await request(app).put('/api/admin/settings/maintenance').set(as(admin)).send({ enabled: true });
    expect(on.status).toBe(200);
    expect(on.body).toMatchObject({ enabled: true, source: 'admin', env_default: false });
    expect(on.body.updated_at).toEqual(expect.any(String));
    expect(await status()).toBe(true);

    // The admin's choice also beats an .env that says on.
    vi.stubEnv('MAINTENANCE', 'true');
    const off = await request(app).put('/api/admin/settings/maintenance').set(as(admin)).send({ enabled: false });
    expect(off.body).toMatchObject({ enabled: false, source: 'admin', env_default: true });
    expect(await status()).toBe(false);

    // Reset: back to the .env default.
    const reset = await request(app).put('/api/admin/settings/maintenance').set(as(admin)).send({ enabled: null });
    expect(reset.body).toMatchObject({ enabled: true, source: 'env' });
    expect(await status()).toBe(true);
  });

  it('refuses anything but true, false or null', async () => {
    const admin = await loginAdmin();
    for (const enabled of ['true', 1, undefined]) {
      const res = await request(app).put('/api/admin/settings/maintenance').set(as(admin)).send({ enabled });
      expect(res.status).toBe(400);
    }
  });
});
