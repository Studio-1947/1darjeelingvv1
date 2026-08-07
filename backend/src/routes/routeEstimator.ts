import { Router, Request, Response } from 'express';
import { rateLimiter } from '../middleware/rateLimiter';
import { db } from '../db';
import { listings } from '../schema';
import { eq, and } from 'drizzle-orm';

const router = Router();

router.use('/estimate', rateLimiter(60, 60 * 1000, 'route_estimator_api'));

interface RouteDetail {
  from: string;
  to: string;
  distanceKm: number;
  durationHours: number;
  minFare: number;
  maxFare: number;
  routeNote: string;
  driverCount?: number;
}

const ROUTE_DATA: Record<string, Omit<RouteDetail, 'from' | 'to'>> = {
  'Bagdogra Airport (IXB)->Darjeeling Town': { distanceKm: 68, durationHours: 3.0, minFare: 2600, maxFare: 3200, routeNote: 'Scenic climb via Rohini & Ghum Hill Pass' },
  'Bagdogra Airport (IXB)->Kalimpong': { distanceKm: 76, durationHours: 2.8, minFare: 2800, maxFare: 3400, routeNote: 'River Teesta highway via Sevoke Coronation Bridge' },
  'Bagdogra Airport (IXB)->Kurseong': { distanceKm: 42, durationHours: 1.8, minFare: 2000, maxFare: 2500, routeNote: 'Direct ascent via Pankhabari / Rohini Road' },
  'Bagdogra Airport (IXB)->Mirik': { distanceKm: 53, durationHours: 2.0, minFare: 2200, maxFare: 2700, routeNote: 'Smooth Tea Garden route via Mirik Lake' },
  'NJP Railway Station->Darjeeling Town': { distanceKm: 71, durationHours: 3.2, minFare: 2600, maxFare: 3200, routeNote: 'Parallels historic Toy Train tracks via Sonada' },
  'NJP Railway Station->Kalimpong': { distanceKm: 73, durationHours: 2.7, minFare: 2700, maxFare: 3300, routeNote: 'Teesta Valley road via Sevoke Forest' },
  'NJP Railway Station->Kurseong': { distanceKm: 45, durationHours: 1.9, minFare: 2000, maxFare: 2500, routeNote: 'Giddapahar Pine forest bypass' },
  'Darjeeling Town->Kalimpong': { distanceKm: 50, durationHours: 2.2, minFare: 2200, maxFare: 2800, routeNote: 'Peshok Tea Garden viewpoint & Teesta Confluence' },
  'Darjeeling Town->Mirik': { distanceKm: 49, durationHours: 2.0, minFare: 2000, maxFare: 2500, routeNote: 'Indo-Nepal border road via Pashupati Market' },
  'Darjeeling Town->Kurseong': { distanceKm: 31, durationHours: 1.2, minFare: 1500, maxFare: 2000, routeNote: 'Hill Cart Road via Batasia Loop & Ghum' },
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
 *         schema: { type: string, default: "Darjeeling Town" }
 *     responses:
 *       200:
 *         description: Route fare details & driver count
 */
router.get('/estimate', async (req: Request, res: Response) => {
  const from = (req.query.from as string || 'Bagdogra Airport (IXB)').trim();
  const to = (req.query.to as string || 'Darjeeling Town').trim();

  const directKey = `${from}->${to}`;
  const reverseKey = `${to}->${from}`;
  const base = ROUTE_DATA[directKey] || ROUTE_DATA[reverseKey] || {
    distanceKm: 55,
    durationHours: 2.5,
    minFare: 2400,
    maxFare: 3000,
    routeNote: 'Mountain hill highway route',
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
