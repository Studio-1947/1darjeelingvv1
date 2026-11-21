import { Router, Request, Response } from 'express';
import { rateLimiter } from '../middleware/rateLimiter';
import { log } from '../config';

const router = Router();

type Place = { name: string; latitude: number; longitude: number; altitude: string };
type Weather = {
  location: string;
  name: string;
  altitude: string;
  temp: number;
  condition: string;
  humidity: number;
  wind: string;
  kanchenjungaIndex: 'clear' | 'partial' | 'misty';
  sunriseTime: string;
};

// Only known hill-station destinations are accepted. This keeps the public
// endpoint cacheable and prevents it becoming an unrestricted weather proxy.
const PLACES: Record<string, Place> = {
  darjeeling: { name: 'Darjeeling', latitude: 27.036, longitude: 88.2627, altitude: '2,042 m' },
  kalimpong: { name: 'Kalimpong', latitude: 27.0594, longitude: 88.4695, altitude: '1,250 m' },
  kurseong: { name: 'Kurseong', latitude: 26.882, longitude: 88.278, altitude: '1,458 m' },
  mirik: { name: 'Mirik', latitude: 26.888, longitude: 88.19, altitude: '1,495 m' },
};

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { expires: number; value: Weather }>();

function conditionFor(code: number): Weather['condition'] {
  if (code === 0) return 'Clear';
  if (code <= 3) return 'Partly cloudy';
  if (code === 45 || code === 48) return 'Foggy';
  if (code >= 51 && code <= 67) return 'Rainy';
  if (code >= 71 && code <= 86) return 'Snowy';
  if (code >= 95) return 'Stormy';
  return 'Cloudy';
}

function visibilityFor(code: number): Weather['kanchenjungaIndex'] {
  if (code === 0 || code === 1) return 'clear';
  if (code <= 3) return 'partial';
  return 'misty';
}

router.get('/', rateLimiter(60, 60_000, 'weather'), async (req: Request, res: Response) => {
  const location = String(req.query.location || 'darjeeling').trim().toLowerCase();
  const place = PLACES[location];
  if (!place) return res.status(400).json({ detail: 'Unsupported weather location' });

  const hit = cache.get(location);
  if (hit && hit.expires > Date.now()) return res.json(hit.value);

  try {
    const params = new URLSearchParams({
      latitude: String(place.latitude),
      longitude: String(place.longitude),
      current: 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m',
      daily: 'sunrise',
      timezone: 'auto',
      forecast_days: '1',
    });
    const upstream = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
    if (!upstream.ok) throw new Error(`Open-Meteo responded ${upstream.status}`);
    const data = await upstream.json() as any;
    const current = data?.current;
    if (!current || typeof current.temperature_2m !== 'number') throw new Error('Open-Meteo sent an incomplete response');

    const code = Number(current.weather_code);
    const value: Weather = {
      location,
      name: place.name,
      altitude: place.altitude,
      temp: Math.round(current.temperature_2m),
      condition: conditionFor(code),
      humidity: Math.round(Number(current.relative_humidity_2m)),
      wind: `${Math.round(Number(current.wind_speed_10m))} km/h`,
      kanchenjungaIndex: visibilityFor(code),
      sunriseTime: String(data?.daily?.sunrise?.[0] || ''),
    };
    cache.set(location, { expires: Date.now() + CACHE_TTL_MS, value });
    return res.json(value);
  } catch (error: any) {
    log.error(`Weather lookup failed for ${location}: ${error?.message || error}`);
    return res.status(502).json({ detail: 'Weather service unavailable' });
  }
});

export default router;
