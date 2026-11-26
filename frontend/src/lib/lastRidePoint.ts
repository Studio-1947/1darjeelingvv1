/**
 * Where the traveller last looked for a ride: their position when they turned on My location on the
 * drivers page, or the pickup place of their last ride search. Home's Car & Driver section asks for
 * the drivers nearest it (GET /listings near_lat/near_lng, backend lib/driverMatch.ts).
 *
 * Kept on this device only (localStorage), rounded to about a kilometre, and forgotten after a week.
 */
const KEY = 'aangan-ride-point';
const TTL_MS = 7 * 86_400_000;

type Point = { lat: number; lng: number };

export function rememberRidePoint(p: Point | null): void {
  if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return;
  try {
    localStorage.setItem(KEY, JSON.stringify({ lat: Number(p.lat.toFixed(2)), lng: Number(p.lng.toFixed(2)), at: Date.now() }));
  } catch { /* private mode */ }
}

export function lastRidePoint(now = Date.now()): Point | null {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!v || !Number.isFinite(v.lat) || !Number.isFinite(v.lng) || !(now - Number(v.at) < TTL_MS)) return null;
    return { lat: v.lat, lng: v.lng };
  } catch { return null; }
}
