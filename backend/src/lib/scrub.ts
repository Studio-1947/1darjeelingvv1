/**
 * Redaction for anything leaving this server as telemetry.
 *
 * This platform holds Aadhaar/PAN/licence scans, phone numbers, and the JWTs that authenticate
 * them. An error report is assembled from exactly the material most likely to carry those: the
 * request body that failed, the headers that authorised it, the local variables in scope. Sending
 * a crash report is therefore an export of personal data unless something stands in the way, and
 * this module is that something.
 *
 * Kept free of any Sentry import so it can be unit-tested directly, and so the rules live
 * somewhere a reviewer can read without knowing the SDK.
 */

/**
 * Key names whose VALUES are replaced wholesale. Matched case-insensitively as a substring, so
 * `phone` also covers `contactPhone`, `phone_number` and `userPhone` — deliberately broad, because
 * the cost of over-redacting a field is a slightly less useful error report, and the cost of
 * under-redacting one is a government ID in a third party's database.
 */
const REDACTED_KEYS = [
  // Credentials and session material
  'authorization', 'cookie', 'token', 'password', 'secret', 'signature', 'apikey', 'api_key',
  'jwt', 'auth', 'credential',
  // Identity
  'phone', 'mobile', 'otp', 'email', 'aadhaar', 'aadhar', 'pan', 'licence', 'license',
  // Documents and uploads — also the largest payloads, since they arrive base64-encoded
  'file', 'filekey', 'file_key', 'document', 'image', 'images', 'avatar', 'photo', 'buffer',
  'data_url', 'dataurl', 'base64',
];

export const REDACTED = '[redacted]';

/** Depth cap: a cyclic or pathologically nested object must not hang the reporter. */
const MAX_DEPTH = 8;

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return REDACTED_KEYS.some((needle) => lower.includes(needle));
}

/**
 * Returns a copy of `value` with every sensitive field replaced.
 *
 * Non-destructive on purpose — the caller is usually holding the live request object, and
 * redacting it in place would blank the data the application still needs to serve the response.
 */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth >= MAX_DEPTH) return REDACTED;

  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, depth + 1));
  }

  if (value instanceof Date) return value;

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isSensitiveKey(key) ? REDACTED : scrubValue(inner, depth + 1);
    }
    return out;
  }

  // A long string in a leaf position is usually a base64 upload that escaped the key match —
  // truncate rather than ship a megabyte of image data to a logging service.
  if (typeof value === 'string' && value.length > 1024) {
    return `${value.slice(0, 128)}… [truncated ${value.length} chars]`;
  }

  return value;
}

/**
 * Headers reduced to the few that help diagnose a fault and carry nothing about who sent it.
 * An allowlist rather than a denylist: a header added by a future proxy is then dropped by
 * default instead of forwarded because nobody thought to exclude it.
 */
const HEADER_ALLOWLIST = ['content-type', 'content-length', 'user-agent', 'accept', 'referer'];

export function scrubHeaders(headers: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!headers) return {};
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = HEADER_ALLOWLIST.includes(key.toLowerCase()) ? value : REDACTED;
  }
  return out;
}

/**
 * A URL with its query string emptied of values.
 *
 * `/api/auth/otp/verify?phone=%2B919812345678` puts a real phone number in the URL, and a URL is
 * the one field every telemetry tool displays prominently and indexes for search.
 */
export function scrubUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  const [path, query] = url.split('?');
  if (!query) return path;
  const keys = query
    .split('&')
    .map((pair) => pair.split('=')[0])
    .filter(Boolean);
  return keys.length > 0 ? `${path}?${keys.map((k) => `${k}=${REDACTED}`).join('&')}` : path;
}
