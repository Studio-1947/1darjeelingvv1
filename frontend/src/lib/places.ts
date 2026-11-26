/**
 * Where a listing roughly is, for "Near me", when it has no map pin. Drivers and guides have no
 * premises to pin, and older listings were added without one, so the place they name ("NJP
 * Railway Station", "Lebong, Darjeeling") stands in, from this list of known places. The same
 * list is on the server (backend/src/lib/places.ts) and in the app (src/lib/nearPlaces.ts); keep them identical.
 */
export type Place = { keys: string[]; lat: number; lng: number; name: string };

// More specific names first: "ghum" must win over "darjeeling" in "Ghum, Darjeeling".
export const PLACES: Place[] = [
  { name: 'Chowrasta', keys: ['chowrasta', 'the mall', 'mall road'], lat: 27.0425, lng: 88.2663 },
  { name: 'Chowk Bazaar', keys: ['chowk bazaar', 'chowk bazar', 'chauk bazar', 'chauk bazaar', 'motor stand'], lat: 27.0445, lng: 88.2635 },
  { name: 'Nehru Road', keys: ['nehru road', 'glenary'], lat: 27.0405, lng: 88.2645 },
  { name: 'Laden La Road', keys: ['laden la'], lat: 27.0432, lng: 88.2648 },
  { name: 'Zakir Hussain Road', keys: ['zakir hussain'], lat: 27.0398, lng: 88.2655 },
  { name: 'Observatory Hill', keys: ['observatory hill', 'mahakal'], lat: 27.044, lng: 88.265 },
  { name: 'Gymkhana', keys: ['gymkhana'], lat: 27.0442, lng: 88.262 },
  { name: 'Darjeeling Station', keys: ['darjeeling railway', 'darjeeling station', 'hill cart'], lat: 27.0387, lng: 88.26 },
  { name: 'Darjeeling Zoo', keys: ['jawahar parbat', 'zoo', 'hmi'], lat: 27.048, lng: 88.257 },
  { name: 'Ropeway', keys: ['ropeway', 'singamari'], lat: 27.058, lng: 88.256 },
  { name: 'Happy Valley', keys: ['happy valley'], lat: 27.055, lng: 88.256 },
  { name: 'Lebong', keys: ['lebong'], lat: 27.062, lng: 88.264 },
  { name: 'Botanical Garden', keys: ['botanical'], lat: 27.037, lng: 88.258 },
  { name: 'Jalapahar', keys: ['jalapahar', 'peace pagoda', 'lal kothi'], lat: 27.0333, lng: 88.2606 },
  { name: 'Batasia Loop', keys: ['batasia'], lat: 27.0163, lng: 88.2586 },
  { name: 'Ghum', keys: ['ghum', 'ghoom', 'yiga choeling'], lat: 27.0087, lng: 88.253 },
  { name: 'Jorebunglow', keys: ['jorebunglow', 'jorebungalow'], lat: 27.006, lng: 88.26 },
  { name: 'Tiger Hill', keys: ['tiger hill'], lat: 27.0028, lng: 88.267 },
  { name: 'Dali', keys: ['dali'], lat: 27.0215, lng: 88.2548 },
  { name: 'Rock Garden', keys: ['rock garden', 'barbotey'], lat: 27.0, lng: 88.238 },
  { name: 'Sonada', keys: ['sonada'], lat: 26.98, lng: 88.229 },
  { name: 'Sukhia Pokhri', keys: ['sukhiapokhri', 'sukhia pokhri', 'sukhia'], lat: 26.994, lng: 88.177 },
  { name: 'Simana', keys: ['simana'], lat: 27.003, lng: 88.158 },
  { name: 'Lepchajagat', keys: ['lepchajagat'], lat: 27.029, lng: 88.201 },
  { name: 'Takdah', keys: ['takdah'], lat: 27.033, lng: 88.36 },
  { name: 'Lamahatta', keys: ['lamahatta'], lat: 27.078, lng: 88.365 },
  { name: 'Tukvar', keys: ['tukvar', 'tukver'], lat: 27.06, lng: 88.28 },
  { name: 'Sittong', keys: ['sittong'], lat: 26.88, lng: 88.36 },
  { name: 'Kurseong', keys: ['kurseong'], lat: 26.88, lng: 88.279 },
  { name: 'Mirik', keys: ['mirik'], lat: 26.887, lng: 88.187 },
  { name: 'Rangli Rangliot', keys: ['rangli', 'rangliot'], lat: 26.98, lng: 88.33 },
  { name: 'Kalimpong', keys: ['kalimpong'], lat: 27.0594, lng: 88.4695 },
  { name: 'NJP Station', keys: ['njp', 'new jalpaiguri'], lat: 26.6833, lng: 88.4429 },
  { name: 'Bagdogra Airport', keys: ['bagdogra', 'ixb'], lat: 26.6812, lng: 88.3286 },
  { name: 'Siliguri', keys: ['siliguri'], lat: 26.7271, lng: 88.3953 },
  { name: 'Pelling', keys: ['pelling'], lat: 27.3, lng: 88.235 },
  { name: 'Ravangla', keys: ['ravangla', 'rabong'], lat: 27.306, lng: 88.364 },
  { name: 'Namchi', keys: ['namchi'], lat: 27.165, lng: 88.364 },
  { name: 'Lachung', keys: ['lachung'], lat: 27.689, lng: 88.743 },
  { name: 'Gangtok', keys: ['gangtok', 'sikkim'], lat: 27.3389, lng: 88.6065 },
  // The town itself, after its own neighbourhoods: "Darjeeling", "Darjeeling Town".
  { name: 'Darjeeling', keys: ['darjeeling'], lat: 27.041, lng: 88.2663 },
  // Elsewhere in India: the cities, airports and stations a driver's route most often names.
  { name: 'Kolkata', keys: ['kolkata', 'calcutta', 'howrah', 'sealdah'], lat: 22.5726, lng: 88.3639 },
  { name: 'Guwahati', keys: ['guwahati'], lat: 26.1445, lng: 91.7362 },
  { name: 'Shillong', keys: ['shillong'], lat: 25.5788, lng: 91.8933 },
  { name: 'Delhi', keys: ['new delhi', 'delhi'], lat: 28.6139, lng: 77.209 },
  { name: 'Agra', keys: ['agra'], lat: 27.1767, lng: 78.0081 },
  { name: 'Jaipur', keys: ['jaipur'], lat: 26.9124, lng: 75.7873 },
  { name: 'Udaipur', keys: ['udaipur'], lat: 24.5854, lng: 73.7125 },
  { name: 'Varanasi', keys: ['varanasi', 'banaras', 'benares'], lat: 25.3176, lng: 82.9739 },
  { name: 'Rishikesh', keys: ['rishikesh'], lat: 30.0869, lng: 78.2676 },
  { name: 'Haridwar', keys: ['haridwar'], lat: 29.9457, lng: 78.1642 },
  { name: 'Dehradun', keys: ['dehradun'], lat: 30.3165, lng: 78.0322 },
  { name: 'Mussoorie', keys: ['mussoorie'], lat: 30.4598, lng: 78.0644 },
  { name: 'Nainital', keys: ['nainital'], lat: 29.3919, lng: 79.4542 },
  { name: 'Shimla', keys: ['shimla'], lat: 31.1048, lng: 77.1734 },
  { name: 'Manali', keys: ['manali'], lat: 32.2432, lng: 77.1892 },
  { name: 'Dharamshala', keys: ['dharamshala', 'dharamsala', 'mcleod ganj', 'mcleodganj'], lat: 32.219, lng: 76.3234 },
  { name: 'Amritsar', keys: ['amritsar'], lat: 31.634, lng: 74.8723 },
  { name: 'Srinagar', keys: ['srinagar'], lat: 34.0837, lng: 74.7973 },
  { name: 'Leh', keys: ['leh', 'ladakh'], lat: 34.1526, lng: 77.5771 },
  { name: 'Mumbai', keys: ['mumbai', 'bombay'], lat: 19.076, lng: 72.8777 },
  { name: 'Pune', keys: ['pune'], lat: 18.5204, lng: 73.8567 },
  { name: 'Goa', keys: ['goa', 'panaji', 'panjim'], lat: 15.4909, lng: 73.8278 },
  { name: 'Bengaluru', keys: ['bengaluru', 'bangalore'], lat: 12.9716, lng: 77.5946 },
  { name: 'Mysuru', keys: ['mysuru', 'mysore'], lat: 12.2958, lng: 76.6394 },
  { name: 'Ooty', keys: ['ooty', 'udhagamandalam'], lat: 11.4102, lng: 76.695 },
  { name: 'Kodaikanal', keys: ['kodaikanal'], lat: 10.2381, lng: 77.4892 },
  { name: 'Chennai', keys: ['chennai', 'madras'], lat: 13.0827, lng: 80.2707 },
  { name: 'Puducherry', keys: ['puducherry', 'pondicherry'], lat: 11.9416, lng: 79.8083 },
  { name: 'Hyderabad', keys: ['hyderabad'], lat: 17.385, lng: 78.4867 },
  { name: 'Kochi', keys: ['kochi', 'cochin'], lat: 9.9312, lng: 76.2673 },
  { name: 'Munnar', keys: ['munnar'], lat: 10.0889, lng: 77.0595 },
  { name: 'Bhubaneswar', keys: ['bhubaneswar'], lat: 20.2961, lng: 85.8245 },
  { name: 'Puri', keys: ['puri'], lat: 19.8135, lng: 85.8312 },
  { name: 'Patna', keys: ['patna'], lat: 25.5941, lng: 85.1376 },
];

/** Lower-case words separated by single spaces, padded, for whole-word matching. */
const words = (text: unknown) => ` ${String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

/**
 * The known place a text names, or null (typos, "asdasd", a single letter). Whole words only, so
 * "leh" does not match inside another word.
 */
export function placeNamed(text: unknown): Place | null {
  const t = words(text);
  if (t.trim().length < 3) return null;
  return PLACES.find((p) => p.keys.some((k) => t.includes(` ${k} `))) ?? null;
}

/** Where a text's known place is, or null. */
export function placeFor(text: unknown): { lat: number; lng: number } | null {
  const p = placeNamed(text);
  return p ? { lat: p.lat, lng: p.lng } : null;
}

type LatLng = { lat: number; lng: number };
const inHills = (p: LatLng) => p.lat >= 26.8 && p.lat <= 27.8 && p.lng >= 87.9 && p.lng <= 89.0;

/**
 * Roughly how far by road a straight-line distance is. Hill roads wind: Darjeeling to Kalimpong is
 * 20 km as the crow flies and nearly 50 by road, so a straight line badly undersells a ride there.
 * Factors from the region's common routes (both ends in the hills ×2.4, one end ×1.6, plains ×1.3).
 */
export function roadKm(straightKm: number, a: LatLng, b?: LatLng | null): number {
  const ends = b ? [a, b] : [a];
  const hillEnds = ends.filter(inHills).length;
  const factor = hillEnds === ends.length ? 2.4 : hillEnds > 0 ? 1.6 : 1.3;
  return straightKm < 0.5 ? straightKm : straightKm * factor;
}

/**
 * Km from the traveller to a listing, as a road estimate: its map pin when it has one, otherwise
 * the place it names (`approx`). Null when neither is known.
 */
export function distanceTo(
  from: { lat: number; lng: number },
  it: { latitude?: unknown; longitude?: unknown; location?: unknown },
): { km: number; approx: boolean } | null {
  const lat = Number(it?.latitude), lng = Number(it?.longitude);
  const pinned = Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) && it?.latitude != null;
  const at = pinned ? { lat, lng } : placeFor(it?.location);
  if (!at) return null;
  return { km: roadKm(straightKm(from, at), from, at), approx: !pinned };
}

/** Straight-line km between two points. */
export function straightKm(a: LatLng, b: LatLng): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** "≈ 3.2 km": a road estimate (roadKm), so always marked as about; whole km from 10, or from the place name. */
export function kmLabel(d: { km: number; approx: boolean }): string {
  const n = d.km < 10 ? (d.approx ? Math.max(1, Math.round(d.km)) : Number(d.km.toFixed(1))) : Math.round(d.km);
  return `≈ ${n} km`;
}

/**
 * Whether the words name a known place (this list, or one of `extra`, such as the search box's
 * place chips). The Home search shows the weather only for a place, never for a business name.
 */
export function isKnownPlace(text: unknown, extra: string[] = []): boolean {
  if (placeFor(text)) return true;
  const flat = (v: unknown) => String(v ?? '').toLowerCase().replace(/[^a-z]/g, '');
  const q = flat(text);
  return q.length >= 3 && extra.some((name) => { const n = flat(name); return n.length >= 3 && q.includes(n); });
}

/**
 * Where hosts can list: anywhere in India (a box around the mainland, Ladakh and the islands).
 * The backend refuses a host's map pin outside it (backend/src/lib/mapsLink.ts LISTING_REGION);
 * keep the two identical so the sign-up wizard says so before "Put it live".
 */
export const LISTING_REGION = { minLat: 6.4, maxLat: 37.2, minLng: 68.0, maxLng: 97.5 } as const;
export function inListingRegion(lat: number, lng: number): boolean {
  return lat >= LISTING_REGION.minLat && lat <= LISTING_REGION.maxLat && lng >= LISTING_REGION.minLng && lng <= LISTING_REGION.maxLng;
}

/** The Darjeeling hills, where the curated spots and the map tiles are. Host listings use LISTING_REGION. */
export const SERVICE_REGION = { minLat: 26.35, maxLat: 27.4, minLng: 87.85, maxLng: 89.0 } as const;
export function inServiceRegion(lat: number, lng: number): boolean {
  return lat >= SERVICE_REGION.minLat && lat <= SERVICE_REGION.maxLat && lng >= SERVICE_REGION.minLng && lng <= SERVICE_REGION.maxLng;
}
