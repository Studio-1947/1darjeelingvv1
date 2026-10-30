import { Router, Request, Response } from 'express';

import { APP_MIN_VERSION, APP_LATEST_VERSION, APP_STORE_URL, PLAY_STORE_URL } from '../config';

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

export default router;
