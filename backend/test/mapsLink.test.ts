import { describe, it, expect } from 'vitest';
import { extractCoordinates, inServiceRegion, isGoogleMapsUrl, resolveMapsLink, MapsLinkError } from '../src/lib/mapsLink';

describe('extractCoordinates', () => {
  it('reads a bare "lat, lng"', () => {
    expect(extractCoordinates('27.0360, 88.2627')).toEqual({ latitude: 27.036, longitude: 88.2627 });
  });

  it('prefers the place pin (!3d!4d) over the viewport centre (@)', () => {
    const url = 'https://www.google.com/maps/place/Norbu/@27.1,88.1,17z/data=!3m1!4b1!4m6!3m5!8m2!3d27.036!4d88.2627';
    expect(extractCoordinates(url)).toEqual({ latitude: 27.036, longitude: 88.2627 });
  });

  it('falls back to the @ viewport when there is no place pin', () => {
    expect(extractCoordinates('https://www.google.com/maps/@27.05,88.26,15z')).toEqual({ latitude: 27.05, longitude: 88.26 });
  });

  it('reads q=, query= and ll= parameters', () => {
    expect(extractCoordinates('https://www.google.com/maps?q=27.04,88.25')).toEqual({ latitude: 27.04, longitude: 88.25 });
    expect(extractCoordinates('https://www.google.com/maps/search/?api=1&query=27.04%2C88.25')).toEqual({ latitude: 27.04, longitude: 88.25 });
    expect(extractCoordinates('https://maps.google.com/?ll=27.04,88.25')).toEqual({ latitude: 27.04, longitude: 88.25 });
  });

  it('rejects out-of-range values and the null island', () => {
    expect(extractCoordinates('120.5, 88.2')).toBeNull();
    expect(extractCoordinates('0, 0')).toBeNull();
    expect(extractCoordinates('hello')).toBeNull();
  });
});

describe('inServiceRegion', () => {
  it('accepts Darjeeling, Kalimpong and Siliguri; rejects Delhi', () => {
    expect(inServiceRegion({ latitude: 27.036, longitude: 88.2627 })).toBe(true);
    expect(inServiceRegion({ latitude: 27.06, longitude: 88.47 })).toBe(true);
    expect(inServiceRegion({ latitude: 26.72, longitude: 88.43 })).toBe(true);
    expect(inServiceRegion({ latitude: 28.61, longitude: 77.2 })).toBe(false);
  });
});

describe('isGoogleMapsUrl', () => {
  it('allows Google Maps over https and nothing else', () => {
    expect(isGoogleMapsUrl(new URL('https://www.google.com/maps/place/x'))).toBe(true);
    expect(isGoogleMapsUrl(new URL('https://maps.app.goo.gl/abc123'))).toBe(true);
    expect(isGoogleMapsUrl(new URL('http://www.google.com/maps/place/x'))).toBe(false);
    expect(isGoogleMapsUrl(new URL('https://www.google.com/search?q=x'))).toBe(false);
    expect(isGoogleMapsUrl(new URL('https://evil.example/maps'))).toBe(false);
    expect(isGoogleMapsUrl(new URL('https://google.com.evil.example/maps'))).toBe(false);
  });
});

describe('resolveMapsLink', () => {
  it('resolves a full link without any network call', async () => {
    const never = async () => { throw new Error('should not fetch'); };
    const r = await resolveMapsLink('https://www.google.com/maps/@27.05,88.26,15z', never as never);
    expect(r).toMatchObject({ latitude: 27.05, longitude: 88.26 });
  });

  it('follows a short link to the pin', async () => {
    const calls: string[] = [];
    const fake = async (url: string) => {
      calls.push(url);
      return new Response(null, {
        status: 302,
        headers: { location: 'https://www.google.com/maps/place/Norbu/@27.036,88.2627,17z' },
      });
    };
    const r = await resolveMapsLink('https://maps.app.goo.gl/AbC123', fake as never);
    expect(r).toMatchObject({ latitude: 27.036, longitude: 88.2627 });
    expect(calls).toEqual(['https://maps.app.goo.gl/AbC123']);
  });

  it('refuses to follow a redirect off Google Maps', async () => {
    const fake = async () =>
      new Response(null, { status: 302, headers: { location: 'https://169.254.169.254/latest/meta-data' } });
    await expect(resolveMapsLink('https://maps.app.goo.gl/x', fake as never)).rejects.toBeInstanceOf(MapsLinkError);
  });

  it('refuses non-Google links and links with no pin', async () => {
    await expect(resolveMapsLink('https://example.com/maps/@27,88,1z')).rejects.toThrow(/not a Google Maps link/);
    await expect(resolveMapsLink('not a url')).rejects.toThrow(/does not look like/);
    await expect(resolveMapsLink('https://www.google.com/maps/place/Somewhere')).rejects.toThrow(/No pin found/);
  });
});
