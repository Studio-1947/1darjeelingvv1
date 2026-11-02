/**
 * Who is using the site right now — the one value the header, tab bar, routes and dashboards are
 * derived from, so every screen agrees.
 *
 * - `side`: travelling or running a business. Only a host can be on the business side; the
 *   account's role never changes, the side is a per-browser choice (AuthContext keeps it).
 * - `hostType`: what the host runs, from their provider row. Null for travellers and for a host
 *   who has not set up a business yet.
 *
 * The app keeps the same shape (src/lib/audience.ts there), and the server enforces the split:
 * every request carries the side in X-Aangan-Mode and bookings or saves from the business side
 * are refused (backend middleware/mode.ts).
 */
export type Side = 'traveller' | 'business';
export type HostType = 'homestay' | 'driver' | 'guide' | 'cafe' | 'shop';

export type Audience = { side: Side; hostType: HostType | null };

export const HOST_TYPES: HostType[] = ['homestay', 'driver', 'guide', 'cafe', 'shop'];

export function asHostType(v: unknown): HostType | null {
  return typeof v === 'string' && (HOST_TYPES as string[]).includes(v) ? (v as HostType) : null;
}
