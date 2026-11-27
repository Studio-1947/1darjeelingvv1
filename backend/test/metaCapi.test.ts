import { describe, it, expect, vi, afterEach } from 'vitest';
import crypto from 'crypto';
import { buildMetaEvent, hashedEmail, hashedPhone, isFromWebsite, metaCapiEnabled, metaContextFrom, sendMetaEvent } from '../src/lib/metaCapi';

const sha = (s: string) => crypto.createHash('sha256').update(s).digest('hex');

describe('Meta Conversions API (lib/metaCapi.ts)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hashes a phone the way Meta asks: digits with the country code, every spelling the same', () => {
    const want = sha('919876543210');
    for (const p of ['+919876543210', '+91 98765 43210', '9876543210', '09876543210']) {
      expect(hashedPhone(p), p).toBe(want);
    }
    // Google and Apple accounts carry a placeholder, not a number: nothing is sent for it.
    expect(hashedPhone('google:1234567890')).toBeNull();
    expect(hashedPhone(null)).toBeNull();
  });

  it('hashes an email trimmed and lower-cased', () => {
    expect(hashedEmail('  Guest@Example.COM ')).toBe(sha('guest@example.com'));
    expect(hashedEmail('not-an-email')).toBeNull();
  });

  it('never sends a raw phone, email or user id', () => {
    const ev = buildMetaEvent({
      name: 'CompleteRegistration',
      eventId: 'signup_u1',
      user: { id: 'u1', phone: '+919876543210', email: 'a@b.in' },
      ctx: { ip: '1.2.3.4', userAgent: 'UA', fbp: 'fb.1.1.1', fbc: 'fb.1.1.abc', sourceUrl: 'https://aanganerp.in/login' },
    }, 1_700_000_000_000);
    const text = JSON.stringify(ev);
    expect(text).not.toContain('9876543210');
    expect(text).not.toContain('a@b.in');
    expect(ev).toMatchObject({
      event_name: 'CompleteRegistration',
      event_id: 'signup_u1',
      event_time: 1_700_000_000,
      action_source: 'website',
      event_source_url: 'https://aanganerp.in/login',
      user_data: { external_id: [sha('u1')], client_ip_address: '1.2.3.4', client_user_agent: 'UA', fbp: 'fb.1.1.1', fbc: 'fb.1.1.abc' },
    });
  });

  it('marks an event with no browser behind it (the Razorpay webhook) as system_generated', () => {
    const ev = buildMetaEvent({ name: 'Purchase', eventId: 'order_o1', user: { id: 'u1' }, customData: { currency: 'INR', value: 1 } });
    expect(ev.action_source).toBe('system_generated');
    expect(ev).not.toHaveProperty('event_source_url');
    expect(ev.custom_data).toEqual({ currency: 'INR', value: 1 });
  });

  it("reads Meta's cookies, and takes the page only from our own site", () => {
    const req: any = {
      ip: '5.6.7.8',
      headers: { 'user-agent': 'UA', cookie: 'a=1; _fbp=fb.1.2.3; _fbc=fb.1.2.click', referer: 'https://www.aanganerp.in/stay/x?ref=y' },
    };
    expect(metaContextFrom(req)).toEqual({ ip: '5.6.7.8', userAgent: 'UA', fbp: 'fb.1.2.3', fbc: 'fb.1.2.click', sourceUrl: 'https://www.aanganerp.in/stay/x' });
    req.headers.referer = 'https://evil.example/aanganerp.in';
    expect(metaContextFrom(req).sourceUrl).toBeUndefined();
  });

  it('counts only requests from a page on the website, never the mobile apps', () => {
    const user = { id: 'u1' };
    const web: any = { headers: { 'user-agent': 'Mozilla/5.0', referer: 'https://aanganerp.in/login' } };
    const app: any = { headers: { 'user-agent': 'okhttp/4.12.0' } };
    expect(isFromWebsite({ name: 'CompleteRegistration', eventId: 'a', user, ctx: metaContextFrom(web) })).toBe(true);
    expect(isFromWebsite({ name: 'CompleteRegistration', eventId: 'b', user, ctx: metaContextFrom(app) })).toBe(false);
    // The Razorpay webhook: no browser at all.
    expect(isFromWebsite({ name: 'Purchase', eventId: 'c', user })).toBe(false);
  });

  it('sends nothing outside production, so tests and local runs never reach the ad account', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    expect(metaCapiEnabled()).toBe(false);
    sendMetaEvent({ name: 'CompleteRegistration', eventId: 'x', user: { id: 'u1' } });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
