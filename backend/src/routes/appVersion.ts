import { Router, Request, Response } from 'express';

import { APP_MIN_VERSION, APP_LATEST_VERSION, APP_STORE_URL, PLAY_STORE_URL, VERIFICATION_SUPPORT_PHONE, HOST_GRACE_BOOKINGS } from '../config';

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
 *     tags: [App]
 *     responses:
 *       200:
 *         description: The help number (or null) and the free bookings
 */
router.get('/host-signup', (_req: Request, res: Response) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ support_phone: VERIFICATION_SUPPORT_PHONE, grace_bookings: HOST_GRACE_BOOKINGS });
});

export default router;
