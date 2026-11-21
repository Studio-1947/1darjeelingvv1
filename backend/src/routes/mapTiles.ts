import { Router, Request, Response } from 'express';
import { rateLimiter } from '../middleware/rateLimiter';
import { SERVICE_REGION } from '../lib/mapsLink';
import { log } from '../config';

const router = Router();

/**
 * GET /api/maps/tiles/:z/:x/:y.png
 *
 * OpenStreetMap map tiles for the listing map preview, fetched on the client's behalf.
 *
 * Why a proxy rather than the app calling tile.openstreetmap.org itself: the tile policy
 * (operations.osmfoundation.org/policies/tiles) requires an identifying User-Agent and asks
 * apps to cache. A phone's image loader sends its own User-Agent and cannot be made to send
 * ours, and the tile servers answer such traffic with an "Access blocked" picture instead of a
 * map. Here the User-Agent is ours, every tile is fetched once and served from memory after
 * that, and a hot client cannot get the whole app blocked.
 *
 * It is not an open tile proxy: only the zoom range a listing preview uses, only tiles that touch
 * the area aangan serves, and per-IP rate limiting.
 */
const OSM_TILE_URL = 'https://tile.openstreetmap.org';
const USER_AGENT = 'aangan/1.0 (+https://aanganerp.in)';

const MIN_ZOOM = 10;
const MAX_ZOOM = 18;
/** A tile may reach this far past the service area, so a pin near its edge still gets a full map. */
const REGION_MARGIN_DEG = 0.25;

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 1000;
const MAX_TILE_BYTES = 200 * 1024;
const UPSTREAM_TIMEOUT_MS = 6000;

type Cached = { expires: number; body: Buffer };
// A Map keeps insertion order, which is all an LRU needs: re-insert on a hit, drop the first key.
const cache = new Map<string, Cached>();
const inFlight = new Map<string, Promise<Buffer>>();

/** For tests, so one case's tiles never satisfy another's. */
export function clearTileCache(): void {
  cache.clear();
  inFlight.clear();
}

function tileLongitude(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

function tileLatitude(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/** Whether a tile overlaps the service area, widened by a margin. */
export function tileInServiceArea(z: number, x: number, y: number): boolean {
  const west = tileLongitude(x, z);
  const east = tileLongitude(x + 1, z);
  const north = tileLatitude(y, z);
  const south = tileLatitude(y + 1, z);
  return (
    east >= SERVICE_REGION.minLng - REGION_MARGIN_DEG &&
    west <= SERVICE_REGION.maxLng + REGION_MARGIN_DEG &&
    north >= SERVICE_REGION.minLat - REGION_MARGIN_DEG &&
    south <= SERVICE_REGION.maxLat + REGION_MARGIN_DEG
  );
}

async function fetchTile(z: number, x: number, y: number): Promise<Buffer> {
  const upstream = await fetch(`${OSM_TILE_URL}/${z}/${x}/${y}.png`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'image/png' },
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  });
  if (!upstream.ok) throw new Error(`upstream ${upstream.status}`);
  if (!(upstream.headers.get('content-type') || '').startsWith('image/png')) {
    throw new Error('upstream did not return a PNG');
  }
  const body = Buffer.from(await upstream.arrayBuffer());
  if (body.length === 0 || body.length > MAX_TILE_BYTES) throw new Error('upstream tile has an unexpected size');
  return body;
}

router.get('/:z/:x/:file', rateLimiter(300, 60_000, 'map_tiles'), async (req: Request, res: Response) => {
  const fileMatch = /^(\d{1,7})\.png$/.exec(String(req.params.file));
  const zStr = String(req.params.z);
  const xStr = String(req.params.x);
  if (!fileMatch || !/^\d{1,2}$/.test(zStr) || !/^\d{1,7}$/.test(xStr)) {
    return res.status(400).json({ detail: 'Tile coordinates must be whole numbers' });
  }
  const z = Number(zStr);
  const x = Number(xStr);
  const y = Number(fileMatch[1]);

  if (z < MIN_ZOOM || z > MAX_ZOOM) {
    return res.status(400).json({ detail: `Zoom must be between ${MIN_ZOOM} and ${MAX_ZOOM}` });
  }
  const span = 2 ** z;
  if (x >= span || y >= span) {
    return res.status(400).json({ detail: 'Tile is outside the map' });
  }
  if (!tileInServiceArea(z, x, y)) {
    return res.status(404).json({ detail: 'No map is served for that area' });
  }

  const key = `${z}/${x}/${y}`;
  const hit = cache.get(key);
  let body: Buffer | undefined;
  if (hit && hit.expires > Date.now()) {
    cache.delete(key);
    cache.set(key, hit);
    body = hit.body;
  } else {
    try {
      // Several phones asking for the same new tile at once share one upstream request.
      let pending = inFlight.get(key);
      if (!pending) {
        pending = fetchTile(z, x, y).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      body = await pending;
    } catch (err) {
      log.error(`Map tile ${key} unavailable: ${(err as Error).message}`);
      return res.status(502).json({ detail: 'Map tile unavailable' });
    }
    cache.set(key, { expires: Date.now() + CACHE_TTL_MS, body });
    while (cache.size > CACHE_MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest === undefined) break;
      cache.delete(oldest);
    }
  }

  res.set({
    'Content-Type': 'image/png',
    // Tiles change rarely; letting the phone keep them a day saves most repeat requests too.
    'Cache-Control': 'public, max-age=86400',
  });
  res.send(body);
});

export default router;
