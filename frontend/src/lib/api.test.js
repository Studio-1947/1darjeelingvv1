// Guards the production API base URL. REACT_APP_BACKEND_URL is inlined by CRA at
// build time; when it is absent (as it is in the Nginx image build) an unguarded
// template literal produces the literal string "undefined/api", which the browser
// resolves against the origin as https://<host>/undefined/api/...  nginx then
// serves that through the SPA catch-all and answers POSTs with 405 Not Allowed.
//
// Deliberately a .js file so it stays outside the production type-check.
import { afterEach, describe, expect, it, vi } from 'vitest';

const ENV_KEY = 'REACT_APP_BACKEND_URL';

describe('API_BASE', () => {
  const original = process.env[ENV_KEY];

  afterEach(() => {
    process.env[ENV_KEY] = original;
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const loadApiBase = async () => {
    vi.resetModules();
    return (await import('./api')).API_BASE;
  };

  it('falls back to a same-origin relative path when the backend URL is unset', async () => {
    delete process.env[ENV_KEY];
    vi.stubEnv('VITE_BACKEND_URL', '');
    const base = await loadApiBase();

    expect(base).toBe('/api');
    expect(base).not.toContain('undefined');
  });

  it('prefers an explicitly configured Vite backend URL', async () => {
    const { resolveBackendUrl } = await import('./api');
    expect(resolveBackendUrl('http://localhost:8000', 'http://legacy:8000')).toBe('http://localhost:8000');
  });

  it('supports the legacy build-time URL while deployments migrate', async () => {
    const { resolveBackendUrl } = await import('./api');
    expect(resolveBackendUrl(undefined, 'http://legacy:8000')).toBe('http://legacy:8000');
  });
});

describe('isSupportRequiredError', () => {
  const load = async () => (await import('./api')).isSupportRequiredError;

  it('recognises the support-required 402', async () => {
    const isSupportRequiredError = await load();
    expect(isSupportRequiredError({
      response: { status: 402, data: { code: 'support_required' } },
    })).toBe(true);
  });

  it('ignores a 402 that is not about support', async () => {
    const isSupportRequiredError = await load();
    expect(isSupportRequiredError({
      response: { status: 402, data: { code: 'something_else' } },
    })).toBe(false);
  });

  it('ignores other statuses and malformed errors', async () => {
    const isSupportRequiredError = await load();
    expect(isSupportRequiredError({ response: { status: 403, data: { code: 'support_required' } } })).toBe(false);
    expect(isSupportRequiredError({})).toBe(false);
    expect(isSupportRequiredError(null)).toBe(false);
  });
});
