import { describe, it, expect } from 'vitest';
import { REDACTED, scrubHeaders, scrubUrl, scrubValue } from '../src/lib/scrub';

/**
 * These are the assertions standing between a crash and a government ID document in a third
 * party's database. An error report is assembled from precisely the material most likely to carry
 * personal data — the request body that failed, the header that authorised it — so redaction here
 * is a correctness property, not a nicety.
 *
 * Cases are written from the shapes this app actually produces: the KYC upload body, the OTP
 * verify request, the Authorization header, the provider onboarding payload.
 */
describe('scrubValue', () => {
  it('redacts a KYC upload body without losing the diagnostic fields', () => {
    const body = {
      doc_type: 'aadhaar',
      file: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAA...',
      contentType: 'image/jpeg',
      providerId: 'prov-123',
    };
    const out = scrubValue(body) as Record<string, unknown>;

    // The document itself, and the field naming which document it is.
    expect(out.file).toBe(REDACTED);
    // Kept: these are what make the report actionable and identify nobody.
    expect(out.contentType).toBe('image/jpeg');
    expect(out.providerId).toBe('prov-123');
  });

  it('redacts the credentials and identity in an OTP verify body', () => {
    const out = scrubValue({ phone: '+919812345678', otp: '481920', name: 'Tenzing', role: 'tourist' }) as any;
    expect(out.phone).toBe(REDACTED);
    expect(out.otp).toBe(REDACTED);
    expect(out.role).toBe('tourist');
  });

  it('matches sensitive keys as substrings, in any casing', () => {
    // Real payloads in this codebase use contactPhone, file_key, MSG91_AUTH_KEY, host_avatar…
    const out = scrubValue({
      contactPhone: '+919812345678',
      file_key: 'kyc/abc.jpg',
      HOST_AVATAR: 'data:image/png;base64,xxx',
      Authorization: 'Bearer ey...',
      businessName: 'Mist & Pine',
    }) as any;

    expect(out.contactPhone).toBe(REDACTED);
    expect(out.file_key).toBe(REDACTED);
    expect(out.HOST_AVATAR).toBe(REDACTED);
    expect(out.Authorization).toBe(REDACTED);
    expect(out.businessName).toBe('Mist & Pine');
  });

  it('reaches into nested objects and arrays', () => {
    const out = scrubValue({
      booking: { id: 'b1', guest: { name: 'A', phone: '+9198' } },
      images: ['data:...', 'data:...'],
      listings: [{ title: 'T', host: { phone: '+9199' } }],
    }) as any;

    expect(out.booking.guest.phone).toBe(REDACTED);
    expect(out.booking.guest.name).toBe('A');
    expect(out.images).toBe(REDACTED);
    expect(out.listings[0].host.phone).toBe(REDACTED);
    expect(out.listings[0].title).toBe('T');
  });

  it('truncates a long string that slipped past the key match', () => {
    // A base64 payload under an unrecognised key would otherwise ship in full.
    const out = scrubValue({ payload: 'x'.repeat(5000) }) as any;
    expect(out.payload).toContain('truncated 5000 chars');
    expect(out.payload.length).toBeLessThan(300);
  });

  it('does not mutate the object it was given', () => {
    // The caller is usually holding the live request; blanking it in place would break the
    // response the app is still trying to send.
    const original = { phone: '+919812345678', nested: { token: 'abc' } };
    scrubValue(original);
    expect(original.phone).toBe('+919812345678');
    expect(original.nested.token).toBe('abc');
  });

  it('terminates on a cyclic object', () => {
    const cyclic: any = { name: 'x' };
    cyclic.self = cyclic;
    expect(() => scrubValue(cyclic)).not.toThrow();
  });

  it('passes through primitives and null', () => {
    expect(scrubValue(null)).toBeNull();
    expect(scrubValue(undefined)).toBeUndefined();
    expect(scrubValue(42)).toBe(42);
    expect(scrubValue(true)).toBe(true);
  });
});

describe('scrubHeaders', () => {
  it('keeps only the allowlisted diagnostic headers', () => {
    const out = scrubHeaders({
      'authorization': 'Bearer eyJhbGciOi...',
      'cookie': 'session=abc',
      'content-type': 'application/json',
      'user-agent': 'Mozilla/5.0',
      'x-forwarded-for': '203.0.113.9',
    });

    expect(out.authorization).toBe(REDACTED);
    expect(out.cookie).toBe(REDACTED);
    // The client's IP address is personal data and is never needed to fix a bug.
    expect(out['x-forwarded-for']).toBe(REDACTED);
    expect(out['content-type']).toBe('application/json');
    expect(out['user-agent']).toBe('Mozilla/5.0');
  });

  it('drops an unknown header by default rather than forwarding it', () => {
    // Allowlist, not denylist: a header introduced by a future proxy must not leak just because
    // nobody thought to exclude it.
    expect(scrubHeaders({ 'x-some-new-proxy-header': 'value' })['x-some-new-proxy-header']).toBe(REDACTED);
  });
});

describe('scrubUrl', () => {
  it('strips query VALUES but keeps the keys', () => {
    // /api/auth/otp/verify?phone=... would otherwise put a real phone number in the one field
    // every telemetry tool displays prominently and indexes for search.
    expect(scrubUrl('/api/auth/otp/verify?phone=%2B919812345678&otp=481920'))
      .toBe(`/api/auth/otp/verify?phone=${REDACTED}&otp=${REDACTED}`);
  });

  it('leaves a query-less path alone', () => {
    expect(scrubUrl('/api/listings')).toBe('/api/listings');
  });

  it('handles undefined', () => {
    expect(scrubUrl(undefined)).toBeUndefined();
  });
});
