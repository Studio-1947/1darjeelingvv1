import { describe, it, expect } from 'vitest';
import { RETIRED_ASSET_ORIGINS, isValidPublicAssetOrigin, rewriteAssetUrls } from '../src/lib/assetUrls';

const TO = 'https://aanganerp.in';
const fix = (s: string) => rewriteAssetUrls(s, RETIRED_ASSET_ORIGINS, TO);

describe('rewriteAssetUrls (audit 2026-11-08: broken photo addresses on the live site)', () => {
  it('moves the retired domain to the live one', () => {
    expect(fix('https://1darjeeling.in/one-darjeeling/a.png')).toBe('https://aanganerp.in/one-darjeeling/a.png');
  });

  it('repairs two origins glued by a comma, in either spelling seen live', () => {
    expect(fix('https://1darjeeling.in,https://aaganerp.in/one-darjeeling/b.jpg')).toBe('https://aanganerp.in/one-darjeeling/b.jpg');
    expect(fix('https://1darjeeling.in,https//aaganerp.in/one-darjeeling/b.jpg')).toBe('https://aanganerp.in/one-darjeeling/b.jpg');
    expect(fix('https://1darjeeling.in, https://aanganerp.in/one-darjeeling/b.jpg')).toBe('https://aanganerp.in/one-darjeeling/b.jpg');
  });

  it('repairs the aaganerp.in typo', () => {
    expect(fix('https://aaganerp.in/one-darjeeling/c.jpg')).toBe('https://aanganerp.in/one-darjeeling/c.jpg');
  });

  it('rewrites every address inside a jsonb column as text', () => {
    const json = JSON.stringify({ images: ['https://1darjeeling.in/one-darjeeling/1.jpg', 'https://1darjeeling.in,https://aaganerp.in/one-darjeeling/2.jpg', 'https://res.cloudinary.com/x/3.jpg'], about: 'Family home' });
    expect(JSON.parse(fix(json))).toEqual({ images: ['https://aanganerp.in/one-darjeeling/1.jpg', 'https://aanganerp.in/one-darjeeling/2.jpg', 'https://res.cloudinary.com/x/3.jpg'], about: 'Family home' });
  });

  it('leaves other hosts, look-alike domains and already-correct addresses alone', () => {
    for (const s of [
      'https://aanganerp.in/one-darjeeling/ok.jpg',
      'https://images.unsplash.com/photo-1.jpg',
      'https://1darjeeling.in.example.com/x.jpg',
      'We moved from 1darjeeling.in to aanganerp.in, see https://example.com, https://other.com/page',
      'https://1darjeeling.in',
    ]) expect(fix(s)).toBe(s);
  });

  it('is idempotent', () => {
    const once = fix('https://1darjeeling.in,https://aaganerp.in/one-darjeeling/b.jpg');
    expect(fix(once)).toBe(once);
  });
});

describe('isValidPublicAssetOrigin', () => {
  it('accepts one origin', () => {
    expect(isValidPublicAssetOrigin('https://aanganerp.in')).toBe(true);
    expect(isValidPublicAssetOrigin('http://localhost:9000')).toBe(true);
  });
  it('refuses glued, spaced, empty or non-http values', () => {
    for (const v of ['https://1darjeeling.in,https//aaganerp.in', 'https://a.in, https://b.in', 'https://a.in https://b.in', '', 'aanganerp.in', 'ftp://aanganerp.in', 'https://aanganerp.in/?x=1']) {
      expect(isValidPublicAssetOrigin(v), v).toBe(false);
    }
  });
});
