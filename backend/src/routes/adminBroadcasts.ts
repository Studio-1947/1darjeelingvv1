/**
 * The admin panel's Notifications page: send a message to travellers, hosts or one person. It
 * lands in their Activity list and on their phones (lib/broadcast.ts).
 *
 *   GET  /admin/broadcasts            what was sent, newest first
 *   GET  /admin/broadcasts/audience   how many people (and phones) a choice reaches
 *   POST /admin/broadcasts            send
 */
import { Router, Request, Response } from 'express';

import { authenticateToken, requireAdmin } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import {
  AUDIENCES, BODY_MAX, LINKS, TITLE_MAX,
  countAudience, listBroadcasts, parseAudience, parseBroadcast, sendBroadcast, shapeBroadcast,
} from '../lib/broadcast';
import { HOST_TYPES } from '../lib/demoData';

const router = Router();
const admin = [authenticateToken, requireAdmin];
// A message to everyone is not something to send twice by a double click.
const sendLimit = rateLimiter(6, 60_000, 'admin_broadcast');

router.get('/admin/broadcasts', ...admin, async (_req: Request, res: Response) => {
  res.json({
    items: await listBroadcasts(),
    options: { audiences: AUDIENCES, business_types: HOST_TYPES, links: LINKS, title_max: TITLE_MAX, body_max: BODY_MAX },
  });
});

router.get('/admin/broadcasts/audience', ...admin, async (req: Request, res: Response) => {
  const who = parseAudience(req.query as Record<string, unknown>);
  if (!who.ok) return res.status(400).json({ detail: who.error });
  res.json(await countAudience(who.value));
});

router.post('/admin/broadcasts', ...admin, sendLimit, async (req: Request, res: Response) => {
  const parsed = parseBroadcast(req.body || {});
  if (!parsed.ok) return res.status(400).json({ detail: parsed.error });
  const { broadcast } = await sendBroadcast(parsed.value, req.user.id);
  if (!broadcast) {
    return res.status(404).json({ detail: parsed.value.audience === 'person' ? 'No account uses that phone number' : 'Nobody matches that choice' });
  }
  res.status(201).json({ broadcast: shapeBroadcast(broadcast) });
});

export default router;
