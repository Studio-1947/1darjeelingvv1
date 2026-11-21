import { Router, Request, Response } from 'express';
import { rateLimiter } from '../middleware/rateLimiter';
import { log } from '../config';

const router = Router();

// Nominatim usage policy: max 1 req/s, a real User-Agent identifying the app,
// and results should be cached. We proxy instead of calling from the browser
// so the User-Agent is under our control and one hot client can't get the
// whole app blocked.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'aangan/1.0 (team@1947.io)';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // addresses don't move; keep for a day
const CACHE_MAX_ENTRIES = 500;

export interface GeocodeResult {
  display_name: string;
  lat: number;
  lon: number;
}

const cache = new Map<string, { expires: number; results: GeocodeResult[] }>();

// Nominatim allows 1 req/s; serialize upstream calls and space them out.
let lastUpstreamCall = 0;
let upstreamQueue: Promise<unknown> = Promise.resolve();

function throttledFetch(url: string): Promise<globalThis.Response> {
  const run = upstreamQueue.then(async () => {
    const wait = lastUpstreamCall + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastUpstreamCall = Date.now();
    return fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  });
  upstreamQueue = run.catch(() => {});
  return run;
}

// GET /api/geocode/search?q=...
router.get('/search', rateLimiter(20, 60_000, 'geocode'), async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 3) {
    return res.status(400).json({ detail: 'Query must be at least 3 characters' });
  }

  const key = q.toLowerCase();
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) {
    return res.json({ results: hit.results });
  }

  try {
    const params = new URLSearchParams({
      q,
      format: 'jsonv2',
      countrycodes: 'in',
      limit: '6',
      addressdetails: '0',
    });
    const upstream = await throttledFetch(`${NOMINATIM_URL}?${params}`);
    if (!upstream.ok) {
      log.error(`Nominatim responded ${upstream.status} for "${q}"`);
      return res.status(502).json({ detail: 'Geocoding service unavailable' });
    }
    const data = (await upstream.json()) as Array<{ display_name: string; lat: string; lon: string }>;
    const results: GeocodeResult[] = data.map((r) => ({
      display_name: r.display_name,
      lat: parseFloat(r.lat),
      lon: parseFloat(r.lon),
    }));

    if (cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { expires: Date.now() + CACHE_TTL_MS, results });

    res.json({ results });
  } catch (e: any) {
    log.error(`Geocode search failed for "${q}": ${e?.message || e}`);
    res.status(502).json({ detail: 'Geocoding service unavailable' });
  }
});

// ---------- reverse: a GPS fix -> a place name a traveller would recognise ----------

const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';
const reverseCache = new Map<string, { expires: number; body: ReversePlace }>();

export interface ReversePlace {
  /** Short, street-level: "Lebong Cart Road, Darjeeling". */
  name: string;
  display_name: string;
}

type NominatimAddress = Partial<Record<
  'amenity' | 'tourism' | 'road' | 'hamlet' | 'neighbourhood' | 'quarter' | 'suburb' | 'village' | 'town' | 'city' | 'municipality' | 'county' | 'state_district',
  string
>>;

/** The nearest named spot plus the town it is in, without repeats. Exported for tests. */
export function shortPlaceName(a: NominatimAddress, fallback: string): string {
  const spot = a.road || a.hamlet || a.neighbourhood || a.quarter || a.suburb || a.amenity || a.tourism;
  const town = a.village || a.town || a.city || a.municipality || a.county || a.state_district;
  const parts = [spot, town].filter((p): p is string => !!p && !!p.trim());
  const unique = parts.filter((p, i) => parts.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i);
  return unique.join(', ') || fallback.split(',').slice(0, 2).join(',').trim();
}

// GET /api/geocode/reverse?lat=..&lon=..
router.get('/reverse', rateLimiter(20, 60_000, 'geocode-reverse'), async (req: Request, res: Response) => {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ detail: 'lat and lon must be valid coordinates' });
  }

  // ~11 m buckets: close enough for a street name, and a pin nudged a few metres reuses the answer.
  const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const hit = reverseCache.get(key);
  if (hit && hit.expires > Date.now()) return res.json(hit.body);

  try {
    const params = new URLSearchParams({
      lat: String(lat), lon: String(lon), format: 'jsonv2', zoom: '18', addressdetails: '1', 'accept-language': 'en',
    });
    const upstream = await throttledFetch(`${NOMINATIM_REVERSE_URL}?${params}`);
    if (!upstream.ok) {
      log.error(`Nominatim reverse responded ${upstream.status} for ${key}`);
      return res.status(502).json({ detail: 'Geocoding service unavailable' });
    }
    const data = (await upstream.json()) as { display_name?: string; address?: NominatimAddress; error?: string };
    if (!data.display_name) return res.status(404).json({ detail: 'No address found here' });
    const body: ReversePlace = { name: shortPlaceName(data.address || {}, data.display_name), display_name: data.display_name };

    if (reverseCache.size >= CACHE_MAX_ENTRIES) {
      const oldest = reverseCache.keys().next().value;
      if (oldest !== undefined) reverseCache.delete(oldest);
    }
    reverseCache.set(key, { expires: Date.now() + CACHE_TTL_MS, body });
    res.json(body);
  } catch (e: any) {
    log.error(`Geocode reverse failed for ${key}: ${e?.message || e}`);
    res.status(502).json({ detail: 'Geocoding service unavailable' });
  }
});

export default router;
