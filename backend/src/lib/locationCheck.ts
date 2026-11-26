/**
 * Confirming where one listing is (user decision 2026-11-26: each listing verifies on its own, by
 * a Google Maps link, the phone's own location, or both).
 *
 *   - a Google Maps link alone: the pin the host dropped in Google Maps;
 *   - the phone's location alone: where the host stands, if the phone can place them within
 *     GPS_MAX_ACCURACY_M;
 *   - both: the link sets the exact spot and the phone confirms the host is there. Phones are often
 *     off by a few hundred metres in the hills, so a reading that disagrees never fails the check:
 *     the link's pin is used and the gap is reported.
 */
import { googleMapsUrl, inListingRegion, resolveMapsLink, MapsLinkError } from './mapsLink';
import { kmBetween } from './places';

/** A phone reading this rough cannot tell one building from the next on its own. */
export const GPS_MAX_ACCURACY_M = 100;
/** With a link as well, the phone only has to put the host near the pin. */
const ON_SITE_M = 500;

export class LocationCheckError extends Error {}

export type LocationSource = 'google_maps_link' | 'live_capture' | 'maps_link_on_site';

export type LocationResult = {
  latitude: number;
  longitude: number;
  source: LocationSource;
  maps_url: string;
  verified_at: string;
  accuracy_m?: number;
  /** Both were given: how far the phone was from the link's pin, in metres. */
  gps_gap_m?: number;
};

type Input = { maps_url?: unknown; latitude?: unknown; longitude?: unknown; accuracy?: unknown; mocked?: unknown };

const hasGps = (b: Input) => b.latitude !== undefined || b.longitude !== undefined;
const hasLink = (b: Input) => typeof b.maps_url === 'string' && b.maps_url.trim() !== '';

/** Whether the request asks for a location check at all. */
export const asksLocationCheck = (b: Input | null | undefined) => !!b && (hasLink(b) || hasGps(b));

function readGps(b: Input): { latitude: number; longitude: number; accuracy: number } {
  if (b.mocked === true) throw new LocationCheckError('Your phone is using a mock location. Turn it off and use your real location.');
  const { latitude, longitude, accuracy } = b;
  if (typeof latitude !== 'number' || typeof longitude !== 'number' || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new LocationCheckError('Send the latitude and longitude your phone reports.');
  }
  if (typeof accuracy !== 'number' || !Number.isFinite(accuracy) || accuracy <= 0) {
    throw new LocationCheckError('Send how accurate the reading is, in metres.');
  }
  if (!inListingRegion({ latitude, longitude })) {
    throw new LocationCheckError('Your phone says you are outside India. Use your location while you are at the place.');
  }
  return { latitude, longitude, accuracy };
}

/** Check a link, a phone reading, or both. Throws LocationCheckError with words for the host. */
export async function checkLocation(body: Input, now = new Date()): Promise<LocationResult> {
  const verified_at = now.toISOString();
  const gps = hasGps(body) ? readGps(body) : null;
  if (hasLink(body)) {
    let pin;
    try {
      pin = await resolveMapsLink(String(body.maps_url));
    } catch (err) {
      if (err instanceof MapsLinkError) throw new LocationCheckError(err.message);
      throw err;
    }
    if (!inListingRegion(pin)) throw new LocationCheckError('That pin is outside India. Check you picked the right place in Google Maps.');
    const base = { latitude: pin.latitude, longitude: pin.longitude, maps_url: googleMapsUrl(pin), verified_at };
    if (!gps) return { ...base, source: 'google_maps_link' };
    const gap = Math.round(kmBetween({ lat: gps.latitude, lng: gps.longitude }, { lat: pin.latitude, lng: pin.longitude }) * 1000);
    const near = gap <= Math.max(ON_SITE_M, gps.accuracy * 2);
    return { ...base, source: near ? 'maps_link_on_site' : 'google_maps_link', accuracy_m: Math.round(gps.accuracy), gps_gap_m: gap };
  }
  if (!gps) throw new LocationCheckError('Paste a Google Maps link, use your location, or both.');
  if (gps.accuracy > GPS_MAX_ACCURACY_M) {
    throw new LocationCheckError(`Your phone could only place you within ${Math.round(gps.accuracy)} m. Paste your Google Maps link as well, or go outside and try again.`);
  }
  const pin = { latitude: gps.latitude, longitude: gps.longitude };
  return { ...pin, source: 'live_capture', maps_url: googleMapsUrl(pin), verified_at, accuracy_m: Math.round(gps.accuracy) };
}

/** What a listing stores (extras.location_verified). */
export const listingStamp = (r: LocationResult) => ({
  verified_at: r.verified_at,
  source: r.source,
  ...(r.accuracy_m !== undefined ? { accuracy_m: r.accuracy_m } : {}),
  ...(r.gps_gap_m !== undefined ? { gps_gap_m: r.gps_gap_m } : {}),
});
