import { Request, Response, NextFunction } from 'express';

/**
 * Business and Traveller are kept apart. The website and the app send the side the person is on
 * in `X-Aangan-Mode` (`business` or `traveller`); a host on the business side runs their own
 * listing and cannot book or save anyone else's until they switch to Traveller.
 *
 * The mode is a per-device choice, not part of the account, so a request without the header (an
 * older app build, a script) is treated as Traveller rather than refused.
 */
export const MODE_HEADER = 'x-aangan-mode';

export function isBusinessMode(req: Request): boolean {
  return String(req.get(MODE_HEADER) || '').trim().toLowerCase() === 'business';
}

export function requireTravellerMode(req: Request, res: Response, next: NextFunction) {
  if (!isBusinessMode(req)) return next();
  return res.status(403).json({
    detail: 'You are in Business mode. Switch to Traveller to book or save places.',
    code: 'business_mode',
  });
}
