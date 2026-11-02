import { normaliseVehicleNumber } from './vehicleNumber';
import { isPlausiblePhone } from './phone';

/**
 * The host profile: what each kind of host fills in about themselves and their business, beyond
 * the basics on the provider row. Studio1947's lists (Nov 2026) are the source:
 *
 * - every host: photo, phone, WhatsApp, availability, languages, experience, a short bio or
 *   video, social media and a cover photo;
 * - driver: routes with charges, vehicle number, driving licence number, car photos, passenger
 *   capacity (RC and licence uploads are KYC documents);
 * - homestay: property and host name, rooms and food with charges, recommended drivers,
 *   property photos, guest occupancy, amenities, home delivery (trade licence and homestay
 *   paper are KYC documents);
 * - guide: name, age, gender, type of guide, services and charges, seasons.
 *
 * Everything lives in the provider's `extras` (and is copied onto the host's listings, which is
 * what travellers read). Each field is checked here, so a client can send any subset of them.
 *
 * Some items are mandatory before a new host can send their documents for approval
 * (`missingMandatory`); hosts who were already live keep running and are only asked to finish.
 */

export const GUIDE_TYPES = ['trekking', 'heritage', 'nature', 'birding', 'tea', 'cultural', 'city', 'photography'] as const;
export const SEASONS = ['spring', 'summer', 'monsoon', 'autumn', 'winter'] as const;
export const SERVICE_UNITS = ['day', 'trip', 'hour', 'person'] as const;
export const ROOM_UNITS = ['night', 'head'] as const;
export const GENDERS = ['male', 'female', 'other'] as const;
export const SOCIAL_KEYS = ['instagram', 'facebook', 'youtube', 'website'] as const;

/** Photos a host must have before approval, by type. */
export const MIN_CAR_PHOTOS = 6;
export const MIN_PROPERTY_PHOTOS = 8;

const MAX_PRICE = 1_000_000;

export type ProfileError = { error: string };
export type ProfilePatch = Record<string, unknown>;

const isUrl = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 1000 && (/^https?:\/\/\S+$/i.test(v.trim()) || /^\/\S+$/.test(v.trim()));

function text(v: unknown, max: number, label: string): string | ProfileError {
  if (typeof v !== 'string') return { error: `${label} must be text` };
  const s = v.trim();
  if (s.length > max) return { error: `${label} must be ${max} characters or fewer` };
  return s;
}

function int(v: unknown, min: number, max: number, label: string): number | ProfileError {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    return { error: `${label} must be a whole number from ${min} to ${max}` };
  }
  return n;
}

function list<T>(v: unknown, max: number, label: string, each: (x: unknown, i: number) => T | ProfileError): T[] | ProfileError {
  if (!Array.isArray(v)) return { error: `${label} must be a list` };
  if (v.length > max) return { error: `${label} can have at most ${max} items` };
  const out: T[] = [];
  for (let i = 0; i < v.length; i++) {
    const r = each(v[i], i);
    if (r && typeof r === 'object' && 'error' in (r as object)) return r as ProfileError;
    out.push(r as T);
  }
  return out;
}

function oneOf<T extends string>(v: unknown, allowed: readonly T[], label: string): T | ProfileError {
  return typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : { error: `${label} is not one of ${allowed.join(', ')}` };
}

function priced(unitList: readonly string[], label: string, defaultUnit: string) {
  return (x: unknown) => {
    if (!x || typeof x !== 'object') return { error: `Each ${label} needs a name and a price` };
    const e = x as Record<string, unknown>;
    const name = text(e.name ?? e.route, 120, `${label} name`);
    if (typeof name !== 'string') return name;
    if (!name) return { error: `Each ${label} needs a name` };
    const price = e.price === undefined || e.price === '' ? 0 : int(e.price, 0, MAX_PRICE, `${label} price`);
    if (typeof price !== 'number') return price;
    const unit = e.unit === undefined ? defaultUnit : oneOf(e.unit, unitList, `${label} unit`);
    if (typeof unit !== 'string') return unit;
    return { name, price, unit };
  };
}

/** Fields every host type has. */
const COMMON: Record<string, (v: unknown) => unknown | ProfileError> = {
  host_avatar: (v) => (v === '' ? '' : isUrl(v) ? (v as string).trim() : { error: 'Photo must be an uploaded image' }),
  whatsapp: (v) => (v === '' ? '' : isPlausiblePhone(v) ? String(v).trim() : { error: 'WhatsApp must be a phone number' }),
  available: (v) => (typeof v === 'boolean' ? v : { error: 'Availability must be on or off' }),
  languages: (v) => list(v, 10, 'Languages', (x) => {
    const s = text(x, 30, 'Language');
    return typeof s === 'string' && !s ? { error: 'A language cannot be empty' } : s;
  }),
  experience_years: (v) => int(v, 0, 80, 'Years of experience'),
  host_bio: (v) => text(v, 2000, 'Bio'),
  intro_video: (v) => (v === '' ? '' : isUrl(v) ? (v as string).trim() : { error: 'Video must be a link (YouTube, Instagram or an upload)' }),
  social: (v) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return { error: 'Social media must be a set of links' };
    const out: Record<string, string> = {};
    for (const [k, raw] of Object.entries(v as Record<string, unknown>)) {
      if (!(SOCIAL_KEYS as readonly string[]).includes(k)) return { error: `Unknown social link: ${k}` };
      const s = text(raw, 200, k);
      if (typeof s !== 'string') return s;
      if (s) out[k] = s;
    }
    return out;
  },
  images: (v) => list(v, 30, 'Photos', (x) => (isUrl(x) ? (x as string).trim() : { error: 'Each photo must be an uploaded image' })),
};

const BY_TYPE: Record<string, Record<string, (v: unknown) => unknown | ProfileError>> = {
  driver: {
    vehicle_number: (v) => {
      if (v === '') return '';
      const plate = normaliseVehicleNumber(v);
      return plate || { error: 'That vehicle number does not look right. Copy it from your number plate, for example WB 74 A 1234.' };
    },
    license_number: (v) => {
      const s = text(v, 30, 'Driving licence number');
      if (typeof s !== 'string') return s;
      return !s || /^[A-Za-z0-9][A-Za-z0-9 \-/]{5,29}$/.test(s) ? s.toUpperCase() : { error: 'That driving licence number does not look right' };
    },
    seats: (v) => int(v, 1, 30, 'Passenger capacity'),
    routes: (v) => list(v, 30, 'Routes', (x) => {
      if (typeof x === 'string') return x.trim() ? { route: x.trim(), price: 0, unit: 'trip' } : { error: 'A route cannot be empty' };
      const r = priced(['trip', 'day'], 'route', 'trip')(x);
      return 'error' in r ? r : { route: r.name, price: r.price, unit: r.unit };
    }),
  },
  homestay: {
    host_name: (v) => text(v, 80, 'Host name'),
    rooms: (v) => list(v, 20, 'Rooms', priced(ROOM_UNITS, 'room', 'night')),
    meals: (v) => list(v, 20, 'Food', priced(['meal', 'day', 'head'], 'meal', 'meal')),
    recommended_drivers: (v) => list(v, 10, 'Recommended drivers', (x) =>
      typeof x === 'string' && x.trim() && x.length <= 64 ? x.trim() : { error: 'A recommended driver must be a driver listing' }),
    capacity: (v) => int(v, 1, 100, 'Guest occupancy'),
    amenities: (v) => list(v, 30, 'Amenities', (x) => text(x, 60, 'Amenity')),
    home_delivery: (v) => (typeof v === 'boolean' ? v : { error: 'Home delivery must be on or off' }),
  },
  guide: {
    host_name: (v) => text(v, 80, 'Name'),
    age: (v) => int(v, 18, 90, 'Age'),
    gender: (v) => oneOf(v, GENDERS, 'Gender'),
    guide_types: (v) => list(v, GUIDE_TYPES.length, 'Type of guide', (x) => oneOf(x, GUIDE_TYPES, 'Type of guide')),
    services: (v) => list(v, 20, 'Services', priced(SERVICE_UNITS, 'service', 'day')),
    seasons: (v) => list(v, SEASONS.length, 'Seasons', (x) => oneOf(x, SEASONS, 'Season')),
  },
};

/** The profile keys a host of this type may set. */
export function profileKeysFor(businessType: string): string[] {
  return [...Object.keys(COMMON), ...Object.keys(BY_TYPE[businessType] ?? {})];
}

/**
 * Checks the profile fields in `input` for this type of host. Unknown keys are refused rather than
 * stored, so a typo cannot silently go nowhere. Returns the cleaned values to merge into extras.
 */
export function profilePatchFrom(businessType: string, input: unknown): ProfilePatch | ProfileError {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { error: 'profile must be an object' };
  const rules = { ...COMMON, ...(BY_TYPE[businessType] ?? {}) };
  const patch: ProfilePatch = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const rule = rules[key];
    if (!rule) return { error: `"${key}" is not part of a ${businessType} profile` };
    const out = rule(value);
    if (out && typeof out === 'object' && !Array.isArray(out) && 'error' in (out as object)) return out as ProfileError;
    patch[key] = out;
  }
  return patch;
}

export type MissingItem = { key: string; label: string };

/** What a new host still has to fill in before their documents can go for approval. */
export function missingMandatory(businessType: string, extras: Record<string, any> | null | undefined): MissingItem[] {
  const e = extras ?? {};
  const photos = Array.isArray(e.images) ? e.images.filter(Boolean).length : 0;
  const missing: MissingItem[] = [];
  if (businessType === 'driver') {
    if (photos < MIN_CAR_PHOTOS) {
      missing.push({ key: 'images', label: `Add at least ${MIN_CAR_PHOTOS} photos of your car (${photos} so far)` });
    }
  } else if (businessType === 'homestay') {
    if (!String(e.host_name ?? '').trim()) missing.push({ key: 'host_name', label: "Add the host's name" });
    if (photos < MIN_PROPERTY_PHOTOS) {
      missing.push({ key: 'images', label: `Add at least ${MIN_PROPERTY_PHOTOS} photos of the property (${photos} so far)` });
    }
  } else if (businessType === 'guide') {
    const services = Array.isArray(e.services) ? e.services.filter((s: any) => s && s.name && Number(s.price) > 0) : [];
    if (services.length === 0) missing.push({ key: 'services', label: 'Add at least one service with its charge' });
  }
  return missing;
}

/** A host who switched availability off takes no bookings until they switch it back on. */
export function isAvailable(extras: Record<string, any> | null | undefined): boolean {
  return extras?.available !== false;
}

/**
 * The public "from" price a profile implies: the cheapest priced room, service or route.
 * Null when the profile has none, so the host's own starting price stands.
 */
export function startingPriceFor(businessType: string, extras: Record<string, any>): number | null {
  const field = businessType === 'homestay' ? 'rooms' : businessType === 'guide' ? 'services' : businessType === 'driver' ? 'routes' : null;
  if (!field || !Array.isArray(extras[field])) return null;
  const prices = extras[field].map((x: any) => Number(x?.price)).filter((p: number) => Number.isFinite(p) && p > 0);
  return prices.length ? Math.min(...prices) : null;
}
