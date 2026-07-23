// Plain .js for the same reason as api.test.js — the repo has no @types/jest.
const { isExemptFromSupport, isSupportActive, needsSupport } = require('./support');

const DAY_MS = 24 * 60 * 60 * 1000;
const future = () => new Date(Date.now() + 30 * DAY_MS).toISOString();
const past = () => new Date(Date.now() - 30 * DAY_MS).toISOString();

describe('isExemptFromSupport', () => {
  it('exempts admins', () => {
    expect(isExemptFromSupport({ role: 'admin' })).toBe(true);
  });

  it('exempts only providers who have paid', () => {
    expect(isExemptFromSupport({ role: 'provider', providerPaid: true })).toBe(true);
    expect(isExemptFromSupport({ role: 'provider', providerPaid: false })).toBe(false);
    expect(isExemptFromSupport({ role: 'provider' })).toBe(false);
  });
});

describe('needsSupport', () => {
  it('is false without a user — logged-out browsing is free', () => {
    expect(needsSupport(null)).toBe(false);
    expect(needsSupport(undefined)).toBe(false);
  });

  it('is true for a tourist who has never paid', () => {
    expect(needsSupport({ role: 'tourist', supportExpiresAt: null })).toBe(true);
  });

  it('is true for a tourist whose window lapsed', () => {
    expect(needsSupport({ role: 'tourist', supportExpiresAt: past() })).toBe(true);
  });

  it('is false for a tourist with an active window', () => {
    expect(needsSupport({ role: 'tourist', supportExpiresAt: future() })).toBe(false);
  });

  it('is false for an admin and for a paid provider', () => {
    expect(needsSupport({ role: 'admin' })).toBe(false);
    expect(needsSupport({ role: 'provider', providerPaid: true })).toBe(false);
  });

  it('is true for an unpaid provider', () => {
    expect(needsSupport({ role: 'provider', providerPaid: false })).toBe(true);
  });
});

describe('isSupportActive', () => {
  it('treats unparseable values as inactive', () => {
    expect(isSupportActive({ role: 'tourist', supportExpiresAt: 'nonsense' })).toBe(false);
  });
});
