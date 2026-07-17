import { Request, Response, NextFunction } from 'express';
import { RATE_LIMIT_ENABLED } from '../config';

interface RateLimitStore {
  [ip: string]: {
    count: number;
    resetTime: number;
  };
}

const rateLimitStores: { [key: string]: RateLimitStore } = {};

// Entries are only ever rewritten when the same IP comes back, so without a sweep the store grows
// once per unique IP forever — a slow leak that a burst of traffic turns into a fast one.
function sweepExpired(store: RateLimitStore, now: number) {
  for (const key of Object.keys(store)) {
    if (now > store[key].resetTime) {
      delete store[key];
    }
  }
}

/**
 * Fixed-window per-IP rate limiter.
 *
 * Correct client attribution depends on app.set('trust proxy', TRUST_PROXY_HOPS) — see app.ts.
 * Without it, every request behind the production Nginx chain carries the proxy's IP, so all
 * callers share a single bucket: brute-force protection disappears and the first few requests
 * lock out the whole platform.
 *
 * Known limits: in-memory, so counters reset on deploy and are per-process (fine for the current
 * single backend container; a second instance would need a shared store such as Redis).
 */
export function rateLimiter(
  limit: number,
  windowMs: number,
  keyPrefix: string,
  opts: { enabled?: boolean } = {}
) {
  // Resolved once at mount time; opts.enabled lets tests exercise the limiter, which is otherwise
  // disabled under APP_ENV=test and would go completely untested.
  const enabled = opts.enabled ?? RATE_LIMIT_ENABLED;

  if (!rateLimitStores[keyPrefix]) {
    rateLimitStores[keyPrefix] = {};
  }
  const store = rateLimitStores[keyPrefix];

  return (req: Request, res: Response, next: NextFunction) => {
    if (!enabled) {
      return next();
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = store[ip];

    if (!record || now > record.resetTime) {
      sweepExpired(store, now);
      store[ip] = {
        count: 1,
        resetTime: now + windowMs
      };
      return next();
    }

    if (record.count >= limit) {
      res.setHeader('Retry-After', Math.ceil((record.resetTime - now) / 1000));
      return res.status(429).json({ detail: 'Rate limit exceeded' });
    }

    record.count++;
    next();
  };
}
