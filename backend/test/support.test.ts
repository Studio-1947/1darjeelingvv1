import { describe, it, expect } from 'vitest';
import {
  isExemptFromSupport,
  isSupportActive,
  computeSupportPassExpiry,
} from '../src/lib/support';
import { LIFETIME_SUPPORT_EXPIRY, SUPPORT_PASS_DAYS } from '../src/config';
import { requireActiveSupport } from '../src/middleware/support';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('isExemptFromSupport', () => {
  it('exempts admins', () => {
    expect(isExemptFromSupport({ role: 'admin' })).toBe(true);
  });

  it('exempts a provider who has paid the registration fee', () => {
    expect(isExemptFromSupport({ role: 'provider', providerPaid: true })).toBe(true);
  });

  it('does NOT exempt a provider who has not paid  role flips before payment', () => {
    expect(isExemptFromSupport({ role: 'provider', providerPaid: false })).toBe(false);
    expect(isExemptFromSupport({ role: 'provider' })).toBe(false);
    expect(isExemptFromSupport({ role: 'provider', providerPaid: null })).toBe(false);
  });

  it('does not exempt tourists', () => {
    expect(isExemptFromSupport({ role: 'tourist', providerPaid: true })).toBe(false);
  });
});

describe('isSupportActive', () => {
  const now = new Date('2026-07-22T00:00:00.000Z');

  it('is false when the user has never paid', () => {
    expect(isSupportActive({ role: 'tourist', supportExpiresAt: null }, now)).toBe(false);
    expect(isSupportActive({ role: 'tourist' }, now)).toBe(false);
  });

  it('is true while the expiry is in the future', () => {
    const future = new Date(now.getTime() + DAY_MS).toISOString();
    expect(isSupportActive({ role: 'tourist', supportExpiresAt: future }, now)).toBe(true);
  });

  it('is false once the expiry has passed', () => {
    const past = new Date(now.getTime() - DAY_MS).toISOString();
    expect(isSupportActive({ role: 'tourist', supportExpiresAt: past }, now)).toBe(false);
  });

  it('treats an unparseable stored value as inactive rather than throwing', () => {
    expect(isSupportActive({ role: 'tourist', supportExpiresAt: 'not-a-date' }, now)).toBe(false);
  });
});

describe('computeSupportPassExpiry', () => {
  const now = new Date('2026-07-22T00:00:00.000Z');

  it('grants one year from settlement when there is no active pass', () => {
    const expiry = computeSupportPassExpiry(null, now);
    expect(Date.parse(expiry) - now.getTime()).toBe(SUPPORT_PASS_DAYS * DAY_MS);
  });

  it('extends from an active expiry when renewed early', () => {
    const existing = new Date(now.getTime() + 30 * DAY_MS).toISOString();
    const expiry = computeSupportPassExpiry(existing, now);
    expect(Date.parse(expiry) - Date.parse(existing)).toBe(SUPPORT_PASS_DAYS * DAY_MS);
  });

  it('leaves an old lifetime pass as it is', () => {
    expect(computeSupportPassExpiry(LIFETIME_SUPPORT_EXPIRY, now)).toBe(LIFETIME_SUPPORT_EXPIRY);
  });

  it('restarts from settlement once the pass has lapsed', () => {
    const expired = new Date(now.getTime() - DAY_MS).toISOString();
    const expiry = computeSupportPassExpiry(expired, now);
    expect(Date.parse(expiry) - now.getTime()).toBe(SUPPORT_PASS_DAYS * DAY_MS);
  });
});

function runMiddleware(user: any) {
  const req: any = { user };
  const result: any = { status: null, body: null, nextCalled: false };
  const res: any = {
    status(code: number) { result.status = code; return res; },
    json(body: any) { result.body = body; return res; },
  };
  requireActiveSupport(req, res, () => { result.nextCalled = true; });
  return result;
}

describe('requireActiveSupport', () => {
  const future = new Date(Date.now() + 30 * DAY_MS).toISOString();
  const past = new Date(Date.now() - 30 * DAY_MS).toISOString();

  it('401s when there is no authenticated user', () => {
    const r = runMiddleware(undefined);
    expect(r.status).toBe(401);
    expect(r.nextCalled).toBe(false);
  });

  it('402s a tourist who has never paid', () => {
    const r = runMiddleware({ role: 'tourist', supportExpiresAt: null });
    expect(r.status).toBe(402);
    expect(r.body.code).toBe('support_required');
    expect(r.nextCalled).toBe(false);
  });

  it('402s a tourist whose window has lapsed', () => {
    const r = runMiddleware({ role: 'tourist', supportExpiresAt: past });
    expect(r.status).toBe(402);
    expect(r.nextCalled).toBe(false);
  });

  it('passes a tourist with an active window', () => {
    const r = runMiddleware({ role: 'tourist', supportExpiresAt: future });
    expect(r.nextCalled).toBe(true);
    expect(r.status).toBeNull();
  });

  it('passes an admin', () => {
    const r = runMiddleware({ role: 'admin' });
    expect(r.nextCalled).toBe(true);
  });

  it('passes a provider who paid the registration fee', () => {
    const r = runMiddleware({ role: 'provider', providerPaid: true });
    expect(r.nextCalled).toBe(true);
  });

  it('402s a provider who has not paid the registration fee', () => {
    const r = runMiddleware({ role: 'provider', providerPaid: false });
    expect(r.status).toBe(402);
    expect(r.nextCalled).toBe(false);
  });
});
