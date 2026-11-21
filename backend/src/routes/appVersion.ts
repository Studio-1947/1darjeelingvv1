import { Router, Request, Response } from 'express';
import { and, desc, eq, sql } from 'drizzle-orm';

import { db, schema } from '../db';
import { isHostPlanLive } from '../lib/hostPlan';

import { APP_MIN_VERSION, APP_LATEST_VERSION, APP_STORE_URL, PLAY_STORE_URL, VERIFICATION_SUPPORT_PHONE, HOST_GRACE_BOOKINGS, maintenanceEnabled, homeDeliveryEnabled, donationsEnabled } from '../config';

const router = Router();

/**
 * @openapi
 * /app/version:
 *   get:
 *     summary: The oldest mobile app version still allowed, and the newest one out
 *     description: >
 *       The app asks on start. Below `min_version` it shows a blocking "please update" screen;
 *       below `latest_version` it may suggest an update. Set with APP_MIN_VERSION and
 *       APP_LATEST_VERSION, so a release that changes prices or an API can retire old builds
 *       without shipping a server change.
 *     tags: [App]
 *     responses:
 *       200:
 *         description: Version policy
 */
/**
 * @openapi
 * /app/status:
 *   get:
 *     summary: Whether the website is under maintenance, and which paused features are on
 *     description: >
 *       TEMPORARY(legal-pause). The website asks once on load. Set with MAINTENANCE, HOME_DELIVERY
 *       and DONATIONS in the server's .env (see config.ts).
 *     tags: [App]
 *     responses:
 *       200:
 *         description: Current switches
 */
router.get('/status', (_req: Request, res: Response) => {
  // Not cached: switching maintenance off must reach visitors on their next load.
  res.set('Cache-Control', 'no-store');
  res.json({
    maintenance: maintenanceEnabled(),
    home_delivery: homeDeliveryEnabled(),
    donations: donationsEnabled(),
  });
});

router.get('/version', (_req: Request, res: Response) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    min_version: APP_MIN_VERSION,
    latest_version: APP_LATEST_VERSION,
    android_url: PLAY_STORE_URL,
    ios_url: APP_STORE_URL,
  });
});

/**
 * @openapi
 * /app/host-signup:
 *   get:
 *     summary: What the host sign-up screens need to know
 *     description: >
 *       `support_phone` is for the "Need help? WhatsApp us" button (VERIFICATION_SUPPORT_PHONE;
 *       null when unset, and the button is then not shown). `grace_bookings` is how many bookings
 *       a host gets on the free start before paying (HOST_GRACE_BOOKINGS).
 *       `live_hosts` is how many businesses are active on aangan, and `recent_hosts` up to three of
 *       the newest ones travellers can see that set a host photo (the home card's "N are in").
 *     tags: [App]
 *     responses:
 *       200:
 *         description: The help number (or null), the free bookings, and the live host count with a few faces
 */
router.get('/host-signup', async (_req: Request, res: Response) => {
  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.providers)
    .where(eq(schema.providers.status, 'active'));
  // Only hosts already public (plan live, approved) and only the photo they chose to show.
  const withPhoto = await db.select().from(schema.providers)
    .where(and(eq(schema.providers.status, 'active'), sql`coalesce(${schema.providers.extras}->>'host_avatar', '') <> ''`))
    .orderBy(desc(sql`coalesce(${schema.providers.activatedAt}, ${schema.providers.createdAt})`))
    .limit(30);
  const recent = withPhoto
    .filter((p) => isHostPlanLive(p))
    .slice(0, 3)
    .map((p) => ({ name: p.businessName, avatar: String((p.extras as Record<string, unknown>).host_avatar) }));
  res.set('Cache-Control', 'public, max-age=300');
  res.json({
    support_phone: VERIFICATION_SUPPORT_PHONE,
    grace_bookings: HOST_GRACE_BOOKINGS,
    live_hosts: Number(n) || 0,
    recent_hosts: recent,
  });
});

export default router;
