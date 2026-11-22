/**
 * Site-wide switches for the admin panel (Overview tab). See lib/siteSettings.ts.
 *
 *   GET /admin/settings/maintenance   whether the website shows "Under maintenance", and why
 *   PUT /admin/settings/maintenance   { enabled: true | false } to set it, { enabled: null } to go
 *                                     back to the server's .env default
 */
import { Router, Request, Response } from 'express';

import { log } from '../config';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { rateLimiter } from '../middleware/rateLimiter';
import { maintenanceState, setMaintenance } from '../lib/siteSettings';

const router = Router();
const admin = [authenticateToken, requireAdmin];
const writeLimit = rateLimiter(20, 60_000, 'admin_settings');

router.get('/admin/settings/maintenance', ...admin, async (_req: Request, res: Response) => {
  res.set('Cache-Control', 'no-store');
  res.json(await maintenanceState());
});

router.put('/admin/settings/maintenance', ...admin, writeLimit, async (req: Request, res: Response) => {
  const enabled = req.body?.enabled;
  if (enabled !== true && enabled !== false && enabled !== null) {
    return res.status(400).json({ detail: 'enabled must be true, false or null' });
  }
  const state = await setMaintenance(enabled, req.user.id);
  log.warn(`[admin-settings] admin=${req.user.id} set maintenance=${enabled === null ? 'env default' : enabled} -> now ${state.enabled ? 'ON' : 'OFF'}`);
  res.json(state);
});

export default router;
