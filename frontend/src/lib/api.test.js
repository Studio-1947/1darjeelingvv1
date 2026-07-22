// Guards the production API base URL. REACT_APP_BACKEND_URL is inlined by CRA at
// build time; when it is absent (as it is in the Nginx image build) an unguarded
// template literal produces the literal string "undefined/api", which the browser
// resolves against the origin as https://<host>/undefined/api/... — nginx then
// serves that through the SPA catch-all and answers POSTs with 405 Not Allowed.
//
// Deliberately a .js file: the repo has no @types/jest, and adding it churns
// ~1700 lines of yarn.lock. tsconfig has checkJs off, so this stays out of the
// production type-check while jest still runs it.
const ENV_KEY = 'REACT_APP_BACKEND_URL';

describe('API_BASE', () => {
  const original = process.env[ENV_KEY];

  afterEach(() => {
    process.env[ENV_KEY] = original;
    jest.resetModules();
  });

  const loadApiBase = () => {
    jest.resetModules();
    return require('./api').API_BASE;
  };

  it('falls back to a same-origin relative path when the backend URL is unset', () => {
    delete process.env[ENV_KEY];
    const base = loadApiBase();

    expect(base).toBe('/api');
    expect(base).not.toContain('undefined');
  });

  it('honours an explicitly configured backend URL', () => {
    process.env[ENV_KEY] = 'http://localhost:8000';
    expect(loadApiBase()).toBe('http://localhost:8000/api');
  });
});
