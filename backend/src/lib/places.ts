/**
 * Known places, so a typed or listed place name ("NJP Station", "Ghum, Darjeeling", "Gangtok")
 * can stand in for a map position: a driver's route ends, a ride search's pickup, a listing with
 * no pin. The Darjeeling hills in detail, then the main towns, airports and stations a driver
 * elsewhere in India names. The web has the same list (frontend/src/lib/places.ts); keep the two
 * identical.
 */
export type LatLng = { lat: number; lng: number };
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
 * The known place a text names, or null. Whole words only, so "leh" does not match inside
 * another word and "dali" not inside "kandali".
 */
export function placeNamed(text: unknown): Place | null {
  const t = words(text);
  if (t.trim().length < 3) return null;
  return PLACES.find((p) => p.keys.some((k) => t.includes(` ${k} `))) ?? null;
}

/** Where a text's known place is, or null. */
export function placeFor(text: unknown): LatLng | null {
  const p = placeNamed(text);
  return p ? { lat: p.lat, lng: p.lng } : null;
}

/** Straight-line km between two points. */
export function kmBetween(a: LatLng, b: LatLng): number {
  const rad = (x: number) => (x * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** A real coordinate pair, or null (missing, not a number, or the 0,0 of an unset pin). */
export function latLng(lat: unknown, lng: unknown): LatLng | null {
  if (lat === null || lat === undefined || lat === '' || lng === null || lng === undefined || lng === '') return null;
  const a = Number(lat);
  const b = Number(lng);
  if (!Number.isFinite(a) || !Number.isFinite(b) || (a === 0 && b === 0)) return null;
  if (a < -90 || a > 90 || b < -180 || b > 180) return null;
  return { lat: a, lng: b };
}
