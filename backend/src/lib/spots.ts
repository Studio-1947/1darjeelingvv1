import { sql, SQL } from 'drizzle-orm';
import * as schema from '../schema';

/**
 * Tourist spots — the editorial "places to visit" section of the app.
 *
 * Unlike homestays/drivers/shops/cafes, a spot is not somebody's business: it is
 * curated content about a public place. Only an admin may create, edit, upload
 * photos for, publish or delete one. Everything in this module exists to keep
 * that rule (and the shape of a spot's `extras`) in exactly one place, so the
 * public listings routes and the admin console routes can't drift apart.
 *
 * Storage is the shared `listings` table with `type = 'spot'`: spots then get
 * search, favourites, reviews and the public detail page for free. The
 * spot-only editorial fields live in the row's `extras` jsonb.
 */
export const SPOT_TYPE = 'spot';

/** Roles allowed to write a spot. Deliberately a one-element list — admins only. */
export function canWriteSpots(role: string | undefined): boolean {
  return role === 'admin';
}

export const SPOT_FORBIDDEN_MESSAGE =
  'Tourist spots are curated content — only an admin can create or edit them';

// ---------------------------------------------------------------------------
// extras shape
// ---------------------------------------------------------------------------

export interface SpotExtras {
  /** Gallery photo URLs (the row's own `image` column is the hero/cover). */
  images: string[];
  /** Short "why go" bullets shown as chips on the detail page. */
  highlights: string[];
  best_time?: string;
  timings?: string;
  entry_fee?: string;
  how_to_reach?: string;
  altitude?: string;
  address?: string;
  /** Drafts (false) are admin-visible only; anything without the key is published. */
  published: boolean;
  /** Featured spots sort to the front of the public /spots list. */
  featured: boolean;
  /** Manual ordering within the list; lower comes first. */
  sort_order: number;
}

export const MAX_GALLERY_IMAGES = 16;
export const MAX_HIGHLIGHTS = 12;
const MAX_URL_LEN = 2048;
const MAX_SHORT_TEXT = 200;
const MAX_LONG_TEXT = 2000;
export const MAX_SORT_ORDER = 100_000;

/** Free-text spot fields, with the maximum length accepted for each. */
const TEXT_FIELDS = {
  best_time: MAX_SHORT_TEXT,
  timings: MAX_SHORT_TEXT,
  entry_fee: MAX_SHORT_TEXT,
  altitude: MAX_SHORT_TEXT,
  address: MAX_SHORT_TEXT,
  how_to_reach: MAX_LONG_TEXT,
} as const;

/** Thrown for a caller-fixable payload problem — routes answer these with a 400. */
export class SpotValidationError extends Error {}

function fail(message: string): never {
  throw new SpotValidationError(message);
}

function asHttpUrl(value: unknown, label: string): string {
  if (typeof value !== 'string') fail(`${label} must be a string`);
  const url = (value as string).trim();
  if (!url) fail(`${label} cannot be empty`);
  if (url.length > MAX_URL_LEN) fail(`${label} is too long`);
  if (!/^https?:\/\//i.test(url)) fail(`${label} must be an http(s) URL`);
  return url;
}

function parseImages(value: unknown): string[] {
  if (!Array.isArray(value)) fail('images must be an array');
  if (value.length > MAX_GALLERY_IMAGES) fail(`images accepts at most ${MAX_GALLERY_IMAGES} entries`);
  return value.map((url, i) => asHttpUrl(url, `images[${i}]`));
}

function asStringArray(value: unknown, label: string, max: number, itemMax: number): string[] {
  if (!Array.isArray(value)) fail(`${label} must be an array`);
  if (value.length > max) fail(`${label} accepts at most ${max} entries`);
  return value.map((entry, i) => {
    if (typeof entry !== 'string') fail(`${label}[${i}] must be a string`);
    const trimmed = entry.trim();
    if (!trimmed) fail(`${label}[${i}] cannot be empty`);
    if (trimmed.length > itemMax) fail(`${label}[${i}] is too long`);
    return trimmed;
  });
}

function asBool(value: unknown, label: string): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fail(`${label} must be a boolean`);
}

/**
 * Validates and normalises the spot-specific `extras` payload.
 *
 * `previous` carries the stored extras on an update: any key the caller omits
 * keeps its current value, so a partial PATCH can't silently wipe a gallery.
 * Passing `null` for a key is the explicit way to clear a text field.
 */
export function parseSpotExtras(raw: unknown, previous: Record<string, any> = {}): SpotExtras {
  if (raw == null) raw = {};
  if (typeof raw !== 'object' || Array.isArray(raw)) fail('extras must be an object');
  const input = raw as Record<string, unknown>;
  const prev = (previous || {}) as Record<string, any>;

  const has = (key: string) => Object.prototype.hasOwnProperty.call(input, key);

  const out: SpotExtras = {
    images: has('images')
      ? parseImages(input.images)
      : Array.isArray(prev.images) ? prev.images : [],
    highlights: has('highlights')
      ? asStringArray(input.highlights, 'highlights', MAX_HIGHLIGHTS, MAX_SHORT_TEXT)
      : Array.isArray(prev.highlights) ? prev.highlights : [],
    published: has('published') ? asBool(input.published, 'published') : prev.published !== false,
    featured: has('featured') ? asBool(input.featured, 'featured') : prev.featured === true,
    sort_order: 0,
  };

  if (has('sort_order')) {
    const n = Number(input.sort_order);
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0 || n > MAX_SORT_ORDER) {
      fail(`sort_order must be a whole number between 0 and ${MAX_SORT_ORDER}`);
    }
    out.sort_order = n;
  } else {
    out.sort_order = Number.isInteger(prev.sort_order) ? prev.sort_order : 0;
  }

  for (const [field, maxLen] of Object.entries(TEXT_FIELDS)) {
    const key = field as keyof typeof TEXT_FIELDS;
    let value: unknown;
    if (has(field)) {
      value = input[field];
      if (value === null || value === '') {
        continue; // explicit clear
      }
      if (typeof value !== 'string') fail(`${field} must be a string`);
      const trimmed = value.trim();
      if (!trimmed) continue;
      if (trimmed.length > maxLen) fail(`${field} must be ${maxLen} characters or fewer`);
      out[key] = trimmed;
    } else if (typeof prev[field] === 'string' && prev[field]) {
      out[key] = prev[field];
    }
  }

  // Anything not in the schema above is dropped rather than stored, so a caller
  // can't use extras as an open key/value store on a public row.
  return out;
}

/** True when a spot row should be visible to the public (missing key == published). */
export function isSpotPublished(extras: Record<string, any> | null | undefined): boolean {
  return (extras as any)?.published !== false;
}

/**
 * SQL predicate hiding unpublished spots from public reads. Scoped to spots so a
 * provider listing that happens to carry a `published` key is unaffected.
 */
export function publicSpotVisibility(): SQL {
  return sql`(${schema.listings.type} <> ${SPOT_TYPE} OR COALESCE(${schema.listings.extras} ->> 'published', 'true') <> 'false')`;
}

/**
 * Public ordering for spots: featured first, then the admin's manual order, then
 * newest. `jsonb_typeof` guards the numeric cast so a legacy row with a
 * non-numeric `sort_order` sorts last instead of failing the whole query.
 */
export function spotOrdering(): SQL[] {
  return [
    sql`(${schema.listings.extras} ->> 'featured' = 'true') DESC`,
    sql`CASE WHEN jsonb_typeof(${schema.listings.extras} -> 'sort_order') = 'number'
             THEN (${schema.listings.extras} ->> 'sort_order')::numeric
             ELSE ${MAX_SORT_ORDER} END ASC`,
    sql`${schema.listings.createdAt} DESC`,
  ];
}
