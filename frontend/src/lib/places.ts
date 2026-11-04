/**
 * Where a listing roughly is, for "Near me", when it has no map pin. Drivers and guides have no
 * premises to pin, and older listings were added without one, so the place they name ("NJP
 * Railway Station", "Lebong, Darjeeling") stands in, from this list of known places. The same
 * list is in the app (src/lib/nearPlaces.ts); keep the two identical.
 */
export type Place = { keys: string[]; lat: number; lng: number };

// More specific names first: "ghum" must win over "darjeeling" in "Ghum, Darjeeling".
export const PLACES: Place[] = [
  { keys: ['chowrasta', 'the mall', 'mall road'], lat: 27.0425, lng: 88.2663 },
  { keys: ['chowk bazaar', 'chowk bazar', 'chauk bazar', 'chauk bazaar', 'motor stand'], lat: 27.0445, lng: 88.2635 },
  { keys: ['nehru road', 'glenary'], lat: 27.0405, lng: 88.2645 },
  { keys: ['laden la'], lat: 27.0432, lng: 88.2648 },
  { keys: ['zakir hussain'], lat: 27.0398, lng: 88.2655 },
  { keys: ['observatory hill', 'mahakal'], lat: 27.044, lng: 88.265 },
  { keys: ['gymkhana'], lat: 27.0442, lng: 88.262 },
  { keys: ['darjeeling railway', 'darjeeling station', 'hill cart'], lat: 27.0387, lng: 88.26 },
  { keys: ['jawahar parbat', 'zoo', 'hmi'], lat: 27.048, lng: 88.257 },
  { keys: ['ropeway', 'singamari'], lat: 27.058, lng: 88.256 },
  { keys: ['happy valley'], lat: 27.055, lng: 88.256 },
  { keys: ['lebong'], lat: 27.062, lng: 88.264 },
  { keys: ['botanical'], lat: 27.037, lng: 88.258 },
  { keys: ['jalapahar', 'peace pagoda', 'lal kothi'], lat: 27.0333, lng: 88.2606 },
  { keys: ['batasia'], lat: 27.0163, lng: 88.2586 },
  { keys: ['ghum', 'ghoom', 'yiga choeling'], lat: 27.0087, lng: 88.253 },
  { keys: ['jorebunglow', 'jorebungalow'], lat: 27.006, lng: 88.26 },
  { keys: ['tiger hill'], lat: 27.0028, lng: 88.267 },
  { keys: ['dali'], lat: 27.0215, lng: 88.2548 },
  { keys: ['rock garden', 'barbotey'], lat: 27.0, lng: 88.238 },
  { keys: ['sonada'], lat: 26.98, lng: 88.229 },
  { keys: ['sukhiapokhri'], lat: 26.994, lng: 88.177 },
  { keys: ['lepchajagat'], lat: 27.029, lng: 88.201 },
  { keys: ['takdah'], lat: 27.033, lng: 88.36 },
  { keys: ['lamahatta'], lat: 27.078, lng: 88.365 },
  { keys: ['tukvar', 'tukver'], lat: 27.06, lng: 88.28 },
  { keys: ['kurseong'], lat: 26.88, lng: 88.279 },
  { keys: ['mirik'], lat: 26.887, lng: 88.187 },
  { keys: ['kalimpong'], lat: 27.0594, lng: 88.4695 },
  { keys: ['njp', 'new jalpaiguri'], lat: 26.6833, lng: 88.4429 },
  { keys: ['bagdogra'], lat: 26.6812, lng: 88.3286 },
  { keys: ['siliguri'], lat: 26.7271, lng: 88.3953 },
  { keys: ['gangtok'], lat: 27.3389, lng: 88.6065 },
  // The town itself, last: "Darjeeling", "Darjeeling Town".
  { keys: ['darjeeling'], lat: 27.041, lng: 88.2663 },
];

/** The known place a location text names, or null (typos, "asdasd", a single letter). */
export function placeFor(text: unknown): { lat: number; lng: number } | null {
  const t = String(text ?? '').toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length < 3) return null;
  for (const p of PLACES) if (p.keys.some((k) => t.includes(k))) return { lat: p.lat, lng: p.lng };
  return null;
}

/**
 * Straight-line km from the traveller to a listing: its map pin when it has one, otherwise the
 * place it names (`approx`). Null when neither is known.
 */
export function distanceTo(
  from: { lat: number; lng: number },
  it: { latitude?: unknown; longitude?: unknown; location?: unknown },
): { km: number; approx: boolean } | null {
  const lat = Number(it?.latitude), lng = Number(it?.longitude);
  const pinned = Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) && it?.latitude != null;
  const at = pinned ? { lat, lng } : placeFor(it?.location);
  if (!at) return null;
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(at.lat - from.lat), dLng = rad(at.lng - from.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(from.lat)) * Math.cos(rad(at.lat)) * Math.sin(dLng / 2) ** 2;
  return { km: 6371 * 2 * Math.asin(Math.sqrt(h)), approx: !pinned };
}

/** "3.2 km", or "≈ 3 km" when it comes from the place name. */
export function kmLabel(d: { km: number; approx: boolean }): string {
  const n = d.km < 10 ? (d.approx ? Math.max(1, Math.round(d.km)) : Number(d.km.toFixed(1))) : Math.round(d.km);
  return `${d.approx ? '≈ ' : ''}${n} km`;
}
