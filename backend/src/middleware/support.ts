import { Request, Response, NextFunction } from 'express';
import { isExemptFromSupport, isSupportActive } from '../lib/support';

/**
 * Blocks the actions that cost the platform something until the ₹1 lifetime pass is paid.
 * Mount AFTER authenticateToken, which is what puts the user row on the request.
 *
 * 402 rather than 403: the request is well-formed and the caller is who they claim to be  the
 * only thing missing is payment. That distinction matters to the client, which redirects on 402
 * but treats 403 as a genuine authorisation failure. The client keys on `code`, not the prose.
 */
export function requireActiveSupport(req: Request, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ detail: 'Missing token' });
  }

  if (isExemptFromSupport(user) || isSupportActive(user)) {
    return next();
  }

  return res.status(402).json({
    detail: 'The ₹1 aangan pass is required before you can do this.',
    code: 'support_required'
  });
}
