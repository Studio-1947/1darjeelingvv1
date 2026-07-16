import { Router, Request, Response } from 'express';
import { rateLimiter } from '../middleware/rateLimiter';
import { log } from '../config';

const router = Router();

// Nominatim usage policy: max 1 req/s, a real User-Agent identifying the app,
// and results should be cached. We proxy instead of calling from the browser
// so the User-Agent is under our control and one hot client can't get the
// whole app blocked.
const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = '1Darjeeling/1.0 (team@1947.io)';
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

export default router;
