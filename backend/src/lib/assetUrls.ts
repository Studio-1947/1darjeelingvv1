/**
 * Photo addresses are stored absolute (`${MINIO_PUBLIC_URL}/${MINIO_BUCKET}/<key>`, lib/s3.ts), so
 * a wrong MINIO_PUBLIC_URL is baked into every photo uploaded while it was set. The live site had
 * three kinds (audit 2026-11-08):
 *   https://1darjeeling.in/one-darjeeling/...                     the retired domain
 *   https://1darjeeling.in,https://aaganerp.in/one-darjeeling/... two origins glued by a comma
 *   https://aaganerp.in/...                                        a typo of aanganerp.in
 * Used by scripts/rewrite-prod-urls.ts, and by config.ts to refuse such a setting at boot.
 */

/** Origins that used to serve aangan's photos and no longer do. */
export const RETIRED_ASSET_ORIGINS = ['https://1darjeeling.in', 'http://1darjeeling.in', 'https://aaganerp.in', 'http://aaganerp.in'];

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Rewrites photo addresses inside a string (a column value, or a jsonb column as text) so they
 * start with `to`. Only addresses that start with one of `from` are touched, and only when a path
 * follows, so "https://1darjeeling.in.example.com" or free text mentioning a domain stays as it is.
 */
export function rewriteAssetUrls(text: string, from: string[], to: string): string {
  const target = to.replace(/\/+$/, '');
  const known = [...new Set([...from, target])].map((o) => o.replace(/\/+$/, '')).sort((a, b) => b.length - a.length);
  const anyKnown = known.map(escape).join('|');
  // 1. Two origins glued by a comma (a comma-separated MINIO_PUBLIC_URL), the first one ours.
  let out = text.replace(new RegExp(`(?:${anyKnown})\\s*,\\s*https?:?//[a-z0-9.-]+(?::\\d+)?(?=/)`, 'gi'), target);
  // 2. A retired origin followed by a path.
  for (const origin of known) {
    if (origin === target) continue;
    out = out.replace(new RegExp(`${escape(origin)}(?=/)`, 'gi'), target);
  }
  return out;
}

/**
 * Is this a usable MINIO_PUBLIC_URL: one http(s) origin (an optional path is allowed), with no
 * comma, space or trailing slash games? `https://a.in,https://b.in` parses as a URL with host
 * "a.in,https" in some runtimes, so the comma is refused explicitly.
 */
export function isValidPublicAssetOrigin(value: string): boolean {
  if (!value || /[\s,]/.test(value)) return false;
  try {
    const u = new URL(value);
    return (u.protocol === 'https:' || u.protocol === 'http:') && !!u.hostname && !u.search && !u.hash;
  } catch {
    return false;
  }
}
