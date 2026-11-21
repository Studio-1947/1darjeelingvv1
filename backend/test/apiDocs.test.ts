import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';

// Audit 2026-11-08: the live site served the full API map at /api-docs and told every caller it
// runs Express. Docs are now off in production unless API_DOCS=true, and the header is gone.
// Same stubEnv + resetModules + dynamic import approach as configPayments.test.ts.
function stubProduction() {
  vi.stubEnv('APP_ENV', 'production');
  vi.stubEnv('JWT_SECRET', 'a_real_production_jwt_secret');
  // A staging-style stack: production rules, mock messages (allowed explicitly).
  vi.stubEnv('MESSAGING_PROVIDER', 'mock');
  vi.stubEnv('ALLOW_MOCK_OTP', 'true');
  vi.stubEnv('MOCK_PAYMENTS', 'true');
  vi.stubEnv('NOTIFY_BOOKINGS', 'false');
  vi.stubEnv('CORS_ORIGINS', 'https://aanganerp.in');
  vi.stubEnv('MINIO_PUBLIC_URL', 'https://aanganerp.in');
  vi.stubEnv('MINIO_ACCESS_KEY', 'a_real_access_key');
  vi.stubEnv('MINIO_SECRET_KEY', 'a_real_secret_key');
  vi.stubEnv('ADMIN_BOOTSTRAP_SECRET', 'a_real_bootstrap_secret');
  vi.stubEnv('ADMIN_PASSWORD', 'a_real_admin_password');
}

async function load() {
  vi.resetModules();
  const config = await import('../src/config');
  const { app } = await import('../src/app');
  return { config, app };
}

describe('API docs and the X-Powered-By header', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('serves the docs outside production, without X-Powered-By', async () => {
    const { config, app } = await load();
    expect(config.API_DOCS_ENABLED).toBe(true);
    const res = await request(app).get('/api-docs.json');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('hides the docs in production', async () => {
    stubProduction();
    const { config, app } = await load();
    expect(config.API_DOCS_ENABLED).toBe(false);
    expect((await request(app).get('/api-docs.json')).status).toBe(404);
    expect((await request(app).get('/api-docs/')).status).toBe(404);
    const health = await request(app).get('/api/health');
    expect(health.headers['x-powered-by']).toBeUndefined();
  });

  it('refuses to start in production with a glued MINIO_PUBLIC_URL (audit 2026-11-08)', async () => {
    stubProduction();
    vi.stubEnv('MINIO_PUBLIC_URL', 'https://1darjeeling.in,https//aaganerp.in');
    await expect(load()).rejects.toThrow(/MINIO_PUBLIC_URL must be one http\(s\) origin/);
  });

  it('can be turned back on in production with API_DOCS=true', async () => {
    stubProduction();
    vi.stubEnv('API_DOCS', 'true');
    const { config } = await load();
    expect(config.API_DOCS_ENABLED).toBe(true);
  });
});
