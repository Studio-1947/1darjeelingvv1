/**
 * Turns a Google Maps link (or a bare "lat, lng") into coordinates, for verifying a listing's pin.
 *
 * The host shares their place from Google Maps; we read the pin out of the link, so the location
 * we show travellers is the one the host actually dropped on Google's map rather than something
 * typed in. Nothing here calls a paid Google API.
 */

export class MapsLinkError extends Error {
  /** A reason the app can show in the host's language; unset for the plain errors. */
  code?: 'share_link';
  constructor(message: string, code?: 'share_link') {
    super(message);
    this.name = 'MapsLinkError';
    this.code = code;
  }
}

/**
 * `share.google/...` links (shared from the Google app or a Google Search result) open a Google
 * Search page for the place, not a map. That page carries a place id but no coordinates, and it
 * only renders with JavaScript, so there is no pin a server can read from it. Google Maps' own
 * Share button gives a `maps.app.goo.gl` link, which does carry the pin.
 */
export function isGoogleSearchShareLink(url: URL): boolean {
  if (url.hostname === 'share.google') return true;
  const google = /^(www\.)?google\.(com|co\.in|in)$/.test(url.hostname);
  return google && (url.pathname === '/share.google' || url.pathname === '/search');
}

export const SHARE_LINK_MESSAGE =
  'This link is from Google Search and has no pin in it. In the Google Maps app, open your place, tap Share, and copy that link instead.';

export type Pin = { latitude: number; longitude: number };

/**
 * The area aangan serves: Darjeeling district and its immediate neighbours (Siliguri, Kalimpong,
 * Mirik, the Sikkim border). A pin outside it is almost certainly a mistake, not a listing.
 */
export const SERVICE_REGION = { minLat: 26.35, maxLat: 27.4, minLng: 87.85, maxLng: 89.0 } as const;

/**
 * Where hosts can list: anywhere in India (a box around the mainland, Ladakh and the islands).
 * Wider than SERVICE_REGION, which stays the Darjeeling box for curated spots and map tiles.
 * Mirrored in frontend/src/lib/places.ts LISTING_REGION.
 */
export const LISTING_REGION = { minLat: 6.4, maxLat: 37.2, minLng: 68.0, maxLng: 97.5 } as const;

export function inListingRegion(pin: Pin): boolean {
  return (
    pin.latitude >= LISTING_REGION.minLat &&
    pin.latitude <= LISTING_REGION.maxLat &&
    pin.longitude >= LISTING_REGION.minLng &&
    pin.longitude <= LISTING_REGION.maxLng
  );
}

export function inServiceRegion(pin: Pin): boolean {
  return (
    pin.latitude >= SERVICE_REGION.minLat &&
    pin.latitude <= SERVICE_REGION.maxLat &&
    pin.longitude >= SERVICE_REGION.minLng &&
    pin.longitude <= SERVICE_REGION.maxLng
  );
}

function validPin(lat: number, lng: number): Pin | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // 0,0 is what a missing value coerces to; it is never a listing.
  if (lat === 0 && lng === 0) return null;
  return { latitude: lat, longitude: lng };
}

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';
const PAIR = new RegExp(`^\\s*${NUM}\\s*,\\s*${NUM}\\s*$`);
const PLACE_PIN = new RegExp(`!3d${NUM}!4d${NUM}`);
const VIEWPORT = new RegExp(`@${NUM},${NUM}`);
const COORD_PARAMS = ['q', 'query', 'll', 'destination', 'daddr', 'center'];

/** Coordinates in a link or pasted text, or null. The place pin beats the map viewport centre. */
export function extractCoordinates(text: string): Pin | null {
  const direct = PAIR.exec(text);
  if (direct) return validPin(Number(direct[1]), Number(direct[2]));

  let decoded = text;
  try {
    decoded = decodeURIComponent(text);
  } catch {
    /* keep the raw text */
  }

  const place = PLACE_PIN.exec(decoded);
  if (place) {
    const pin = validPin(Number(place[1]), Number(place[2]));
    if (pin) return pin;
  }

  try {
    const url = new URL(text);
    for (const key of COORD_PARAMS) {
      const value = url.searchParams.get(key);
      const match = value ? PAIR.exec(value) : null;
      if (match) {
        const pin = validPin(Number(match[1]), Number(match[2]));
        if (pin) return pin;
      }
    }
  } catch {
    /* not a URL; fall through to the viewport pattern on the text */
  }

  const view = VIEWPORT.exec(decoded);
  if (view) return validPin(Number(view[1]), Number(view[2]));
  return null;
}

function isShortLink(url: URL): boolean {
  if (url.hostname === 'maps.app.goo.gl') return true;
  return url.hostname === 'goo.gl' && url.pathname.startsWith('/maps');
}

/** Only Google Maps hosts, over https. Redirects are held to the same rule so a short link
 *  cannot be used to make the server fetch an arbitrary address. */
export function isGoogleMapsUrl(url: URL): boolean {
  if (url.protocol !== 'https:') return false;
  if (isShortLink(url)) return true;
  const host = url.hostname;
  // maps.google.com is the Maps host itself, and its links live at the root (`/?q=lat,lng`);
  // on the main google domains Maps is only under /maps.
  if (/^maps\.google\.(com|co\.in|in)$/.test(host)) return true;
  const google = /^(www\.)?google\.(com|co\.in|in)$/.test(host);
  return google && url.pathname.startsWith('/maps');
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

const MAX_HOPS = 5;
const HOP_TIMEOUT_MS = 5000;

export type ResolvedPin = Pin & { url: string };

/**
 * The pin behind a pasted Google Maps link or "lat, lng". Short `maps.app.goo.gl` links are
 * followed (by hand, host by host) until one carries coordinates.
 */
export async function resolveMapsLink(input: string, fetchFn: FetchFn = fetch): Promise<ResolvedPin> {
  const text = String(input ?? '').trim();
  if (!text || text.length > 2000) throw new MapsLinkError('Paste the Google Maps link for your place.');

  const bare = PAIR.exec(text) ? extractCoordinates(text) : null;
  if (bare) return { ...bare, url: googleMapsUrl(bare) };

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new MapsLinkError('That does not look like a Google Maps link.');
  }
  if (isGoogleSearchShareLink(url)) throw new MapsLinkError(SHARE_LINK_MESSAGE, 'share_link');
  if (!isGoogleMapsUrl(url)) throw new MapsLinkError('That is not a Google Maps link.');

  let current = url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    const pin = extractCoordinates(current.href);
    if (pin) return { ...pin, url: googleMapsUrl(pin) };
    // Only a short link needs following; a full google.com/maps URL either has the pin or never will.
    if (!isShortLink(current)) break;

    let res: Response;
    try {
      res = await fetchFn(current.href, {
        method: 'GET',
        redirect: 'manual',
        signal: AbortSignal.timeout(HOP_TIMEOUT_MS),
        headers: { 'User-Agent': 'aangan/1.0 (team@1947.io)' },
      });
    } catch {
      throw new MapsLinkError('Could not open that link. Check it and try again.');
    }
    const location = res.headers.get('location');
    if (res.status < 300 || res.status >= 400 || !location) break;
    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      break;
    }
    if (!isGoogleMapsUrl(next)) break;
    current = next;
  }

  throw new MapsLinkError(
    'No pin found in that link. In Google Maps, open your place, tap Share, and copy the link.'
  );
}

/** A canonical link to the exact pin, stored with the verification so it can be re-opened. */
export function googleMapsUrl(pin: Pin): string {
  return `https://www.google.com/maps/search/?api=1&query=${pin.latitude},${pin.longitude}`;
}
