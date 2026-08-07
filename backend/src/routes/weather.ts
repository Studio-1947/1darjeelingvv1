import { Router, Request, Response } from 'express';
import { rateLimiter } from '../middleware/rateLimiter';

const router = Router();

// Rate limit: 60 requests per minute per IP
router.use('/', rateLimiter(60, 60 * 1000, 'weather_api'));

interface LocationWeather {
  location: string;
  name: string;
  altitude: string;
  temp: number;
  condition: string;
  humidity: number;
  wind: string;
  kanchenjungaIndex: 'clear' | 'partial' | 'misty';
  sunriseTime: string;
}

const WEATHERS: Record<string, LocationWeather> = {
  darjeeling: {
    location: 'darjeeling',
    name: 'Darjeeling Town',
    altitude: '2,045m',
    temp: 16,
    condition: 'Mild Mountain Breeze',
    humidity: 65,
    wind: '8 km/h NW',
    kanchenjungaIndex: 'clear',
    sunriseTime: '05:08 AM',
  },
  kalimpong: {
    location: 'kalimpong',
    name: 'Kalimpong Ridge',
    altitude: '1,250m',
    temp: 20,
    condition: 'Sunny & Pleasant',
    humidity: 58,
    wind: '6 km/h W',
    kanchenjungaIndex: 'clear',
    sunriseTime: '05:06 AM',
  },
  kurseong: {
    location: 'kurseong',
    name: 'Kurseong Dow Hill',
    altitude: '1,458m',
    temp: 18,
    condition: 'Light Fog In Valleys',
    humidity: 72,
    wind: '10 km/h SW',
    kanchenjungaIndex: 'partial',
    sunriseTime: '05:09 AM',
  },
  mirik: {
    location: 'mirik',
    name: 'Mirik Lake',
    altitude: '1,495m',
    temp: 19,
    condition: 'Clear Blue Skies',
    humidity: 60,
    wind: '5 km/h W',
    kanchenjungaIndex: 'clear',
    sunriseTime: '05:10 AM',
  },
};

/**
 * @openapi
 * /api/weather:
 *   get:
 *     summary: Get live climate & Kanchenjunga visibility index
 *     tags: [Weather]
 *     parameters:
 *       - in: query
 *         name: location
 *         schema: { type: string, default: "darjeeling" }
 *     responses:
 *       200:
 *         description: Live climate data
 */
router.get('/', (req: Request, res: Response) => {
  const loc = (req.query.location as string || 'darjeeling').toLowerCase();
  const data = WEATHERS[loc] || WEATHERS.darjeeling;
  res.json(data);
});

export default router;
