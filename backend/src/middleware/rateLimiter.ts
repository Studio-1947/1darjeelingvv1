import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [ip: string]: {
    count: number;
    resetTime: number;
  };
}

const rateLimitStores: { [key: string]: RateLimitStore } = {};

export function rateLimiter(limit: number, windowMs: number, keyPrefix: string) {
  if (!rateLimitStores[keyPrefix]) {
    rateLimitStores[keyPrefix] = {};
  }
  const store = rateLimitStores[keyPrefix];

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const record = store[ip];

    if (!record || now > record.resetTime) {
      store[ip] = {
        count: 1,
        resetTime: now + windowMs
      };
      return next();
    }

    if (record.count >= limit) {
      return res.status(429).json({ detail: 'Rate limit exceeded' });
    }

    record.count++;
    next();
  };
}
