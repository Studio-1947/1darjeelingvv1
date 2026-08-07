import { Router, Request, Response } from 'express';
import { rateLimiter } from '../middleware/rateLimiter';
import { db } from '../db';
import { listings } from '../schema';
import { eq } from 'drizzle-orm';

const router = Router();

router.use('/estimate', rateLimiter(60, 60 * 1000, 'route_estimator_api'));

export interface RouteDetail {
  from: string;
  to: string;
  distanceKm: number;
  durationHours: number;
  minFare: number;
  maxFare: number;
  hatchbackFare: number;
  suvFare: number;
  routeNote: string;
  terrainDifficulty: 'Easy Plain' | 'Moderate Hill' | 'Winding Mountain' | 'Steep Ascent';
  driverCount: number;
}

const ROUTE_DATA: Record<string, Omit<RouteDetail, 'from' | 'to' | 'driverCount'>> = {
  // Bagdogra Airport (IXB)
  'Bagdogra Airport (IXB)->Darjeeling Town (Chowk Bazaar / Clubside)': { distanceKm: 68, durationHours: 3.0, minFare: 2800, maxFare: 4500, hatchbackFare: 2800, suvFare: 4200, routeNote: 'Scenic climb via Rohini Road & Ghum Hill Pass', terrainDifficulty: 'Winding Mountain' },
  'Bagdogra Airport (IXB)->Ghum Junction & Monastery': { distanceKm: 62, durationHours: 2.7, minFare: 2600, maxFare: 4200, hatchbackFare: 2600, suvFare: 4000, routeNote: 'Direct climb to highest railway elevation (2,258m)', terrainDifficulty: 'Winding Mountain' },
  'Bagdogra Airport (IXB)->Kalimpong Motor Stand': { distanceKm: 76, durationHours: 2.8, minFare: 2900, maxFare: 4800, hatchbackFare: 2900, suvFare: 4400, routeNote: 'River Teesta highway via Sevoke Coronation Bridge', terrainDifficulty: 'Moderate Hill' },
  'Bagdogra Airport (IXB)->Kurseong Motor Stand': { distanceKm: 42, durationHours: 1.8, minFare: 2200, maxFare: 4000, hatchbackFare: 2200, suvFare: 3600, routeNote: 'Direct climb via Pankhabari / Rohini Road', terrainDifficulty: 'Steep Ascent' },
  'Bagdogra Airport (IXB)->Mirik Lake & Simana Border': { distanceKm: 53, durationHours: 2.2, minFare: 2400, maxFare: 4200, hatchbackFare: 2400, suvFare: 3800, routeNote: 'Smooth Tea Garden highway via Dudhia & Mirik Lake', terrainDifficulty: 'Moderate Hill' },
  'Bagdogra Airport (IXB)->NJP Railway Station': { distanceKm: 16, durationHours: 0.6, minFare: 800, maxFare: 1400, hatchbackFare: 800, suvFare: 1300, routeNote: 'Bypass Highway via Fulbari / Mahananda', terrainDifficulty: 'Easy Plain' },
  'Bagdogra Airport (IXB)->Siliguri Junction (Tenzing Norgay Stand)': { distanceKm: 14, durationHours: 0.5, minFare: 700, maxFare: 1200, hatchbackFare: 700, suvFare: 1100, routeNote: 'City Corridor via Matigara & Hill Cart Road', terrainDifficulty: 'Easy Plain' },

  // NJP Railway Station
  'NJP Railway Station->Darjeeling Town (Chowk Bazaar / Clubside)': { distanceKm: 71, durationHours: 3.2, minFare: 2800, maxFare: 4600, hatchbackFare: 2800, suvFare: 4300, routeNote: 'Parallels historic DHR Toy Train tracks via Sonada', terrainDifficulty: 'Winding Mountain' },
  'NJP Railway Station->Ghum Junction & Monastery': { distanceKm: 65, durationHours: 2.9, minFare: 2700, maxFare: 4400, hatchbackFare: 2700, suvFare: 4100, routeNote: 'Hill Cart Road climb via Kurseong & Sonada', terrainDifficulty: 'Winding Mountain' },
  'NJP Railway Station->Kalimpong Motor Stand': { distanceKm: 73, durationHours: 2.8, minFare: 2800, maxFare: 4800, hatchbackFare: 2800, suvFare: 4400, routeNote: 'Teesta Valley highway via Sevoke Forest Sanctuary', terrainDifficulty: 'Moderate Hill' },
  'NJP Railway Station->Kurseong Motor Stand': { distanceKm: 45, durationHours: 2.0, minFare: 2200, maxFare: 4200, hatchbackFare: 2200, suvFare: 3700, routeNote: 'Giddapahar Pine forest bypass', terrainDifficulty: 'Steep Ascent' },
  'NJP Railway Station->Mirik Lake & Simana Border': { distanceKm: 56, durationHours: 2.2, minFare: 2500, maxFare: 4500, hatchbackFare: 2500, suvFare: 3900, routeNote: 'Tea estate route via Simana Viewpoint', terrainDifficulty: 'Moderate Hill' },
  'NJP Railway Station->Siliguri Junction (Tenzing Norgay Stand)': { distanceKm: 8, durationHours: 0.3, minFare: 400, maxFare: 800, hatchbackFare: 400, suvFare: 700, routeNote: 'City arterial route along Hill Cart Road', terrainDifficulty: 'Easy Plain' },

  // Siliguri Junction (Tenzing Norgay Stand)
  'Siliguri Junction (Tenzing Norgay Stand)->Darjeeling Town (Chowk Bazaar / Clubside)': { distanceKm: 62, durationHours: 2.5, minFare: 2500, maxFare: 4200, hatchbackFare: 2500, suvFare: 3900, routeNote: 'Hill Cart Road via Sukna Forest & Tindharia', terrainDifficulty: 'Winding Mountain' },
  'Siliguri Junction (Tenzing Norgay Stand)->Kalimpong Motor Stand': { distanceKm: 65, durationHours: 2.4, minFare: 2600, maxFare: 4300, hatchbackFare: 2600, suvFare: 4000, routeNote: 'Coronation Bridge & NH10 Teesta Corridor', terrainDifficulty: 'Moderate Hill' },
  'Siliguri Junction (Tenzing Norgay Stand)->Kurseong Motor Stand': { distanceKm: 36, durationHours: 1.5, minFare: 1900, maxFare: 3500, hatchbackFare: 1900, suvFare: 3200, routeNote: 'Direct Hill Cart Road climb', terrainDifficulty: 'Steep Ascent' },
  'Siliguri Junction (Tenzing Norgay Stand)->Mirik Lake & Simana Border': { distanceKm: 46, durationHours: 1.8, minFare: 2100, maxFare: 3800, hatchbackFare: 2100, suvFare: 3400, routeNote: 'Dudhia River bridge & Mechi Valley route', terrainDifficulty: 'Moderate Hill' },

  // Darjeeling & Ghum
  'Darjeeling Town (Chowk Bazaar / Clubside)->Ghum Junction & Monastery': { distanceKm: 7, durationHours: 0.3, minFare: 400, maxFare: 800, hatchbackFare: 400, suvFare: 700, routeNote: 'Local ridge road via Batasia Loop', terrainDifficulty: 'Moderate Hill' },
  'Darjeeling Town (Chowk Bazaar / Clubside)->Kalimpong Motor Stand': { distanceKm: 50, durationHours: 2.2, minFare: 2500, maxFare: 4200, hatchbackFare: 2500, suvFare: 3800, routeNote: 'Peshok Tea Garden viewpoint & Teesta Confluence', terrainDifficulty: 'Winding Mountain' },
  'Darjeeling Town (Chowk Bazaar / Clubside)->Kurseong Motor Stand': { distanceKm: 31, durationHours: 1.3, minFare: 1800, maxFare: 3400, hatchbackFare: 1800, suvFare: 3000, routeNote: 'Hill Cart Road via Batasia Loop & Ghum', terrainDifficulty: 'Moderate Hill' },
  'Darjeeling Town (Chowk Bazaar / Clubside)->Mirik Lake & Simana Border': { distanceKm: 49, durationHours: 2.1, minFare: 2300, maxFare: 4000, hatchbackFare: 2300, suvFare: 3600, routeNote: 'Indo-Nepal border road via Pashupati Market', terrainDifficulty: 'Winding Mountain' },

  // Kalimpong, Kurseong, Mirik
  'Kalimpong Motor Stand->Kurseong Motor Stand': { distanceKm: 68, durationHours: 2.5, minFare: 2600, maxFare: 4300, hatchbackFare: 2600, suvFare: 3900, routeNote: 'Teesta Valley & Ghum Junction bypass', terrainDifficulty: 'Winding Mountain' },
  'Kalimpong Motor Stand->Mirik Lake & Simana Border': { distanceKm: 88, durationHours: 3.2, minFare: 3200, maxFare: 5000, hatchbackFare: 3200, suvFare: 4600, routeNote: 'Long scenic ridge highway via Peshok', terrainDifficulty: 'Winding Mountain' },
  'Kurseong Motor Stand->Mirik Lake & Simana Border': { distanceKm: 34, durationHours: 1.3, minFare: 1800, maxFare: 3300, hatchbackFare: 1800, suvFare: 3000, routeNote: 'Pine forests & Tea estates scenic road', terrainDifficulty: 'Moderate Hill' },
};

/**
 * @openapi
 * /api/routes/estimate:
 *   get:
 *     summary: Calculate transit distance, duration, fare range, and available drivers
 *     tags: [Routes]
 *     parameters:
 *       - in: query
 *         name: from
 *         schema: { type: string, default: "Bagdogra Airport (IXB)" }
 *       - in: query
 *         name: to
 *         schema: { type: string, default: "Darjeeling Town (Chowk Bazaar / Clubside)" }
 *     responses:
 *       200:
 *         description: Route fare details & driver count
 */
router.get('/estimate', async (req: Request, res: Response) => {
  const from = (req.query.from as string || 'Bagdogra Airport (IXB)').trim();
  const to = (req.query.to as string || 'Darjeeling Town (Chowk Bazaar / Clubside)').trim();

  if (from === to) {
    return res.json({
      from,
      to,
      distanceKm: 0,
      durationHours: 0,
      minFare: 0,
      maxFare: 0,
      hatchbackFare: 0,
      suvFare: 0,
      routeNote: 'Same pickup and drop location selected',
      terrainDifficulty: 'Easy Plain',
      driverCount: 0,
    });
  }

  const findRouteKey = (f: string, t: string) => {
    const directKey = `${f}->${t}`;
    const reverseKey = `${t}->${f}`;
    if (ROUTE_DATA[directKey]) return ROUTE_DATA[directKey];
    if (ROUTE_DATA[reverseKey]) return ROUTE_DATA[reverseKey];

    // Substring matching (both forward and reverse)
    const fLower = f.toLowerCase();
    const tLower = t.toLowerCase();
    const matchedKey = Object.keys(ROUTE_DATA).find((k) => {
      const [kFrom, kTo] = k.split('->').map((s) => s.toLowerCase());
      const directMatch = (kFrom.includes(fLower) || fLower.includes(kFrom)) && (kTo.includes(tLower) || tLower.includes(kTo));
      const reverseMatch = (kFrom.includes(tLower) || tLower.includes(kFrom)) && (kTo.includes(fLower) || fLower.includes(kTo));
      return directMatch || reverseMatch;
    });
    if (matchedKey) return ROUTE_DATA[matchedKey];
    return null;
  };

  const base = findRouteKey(from, to) || {
    distanceKm: 55,
    durationHours: 2.3,
    minFare: 2500,
    maxFare: 4200,
    hatchbackFare: 2500,
    suvFare: 3800,
    routeNote: 'Scenic mountain highway route',
    terrainDifficulty: 'Winding Mountain',
  };

  let driverCount = 0;
  try {
    const drivers = await db
      .select()
      .from(listings)
      .where(eq(listings.type, 'driver'));
    driverCount = drivers.length;
  } catch (e) {
    driverCount = 0;
  }

  res.json({
    from,
    to,
    ...base,
    driverCount,
  });
});

export default router;
