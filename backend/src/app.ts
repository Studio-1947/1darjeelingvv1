import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { IS_PROD, CORS_ORIGINS, TRUST_PROXY_HOPS, log } from './config';
import { swaggerSpec } from './swagger';

// Import router modules
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import providersRouter from './routes/providers';
import listingsRouter from './routes/listings';
import bookingsRouter from './routes/bookings';
import paymentsRouter from './routes/payments';
import adminRouter from './routes/admin';
import geocodeRouter from './routes/geocode';

export const app = express();

// Without this, req.ip is the address of the nearest proxy rather than the real client, so every
// request behind the production Nginx chain shares one rate-limit bucket (see middleware/rateLimiter.ts).
// A hop count — not `true` — so a client-forged X-Forwarded-For prefix can't spoof its way past limits.
app.set('trust proxy', TRUST_PROXY_HOPS);

// Razorpay signs the raw bytes of the webhook body, so this route must keep them verbatim.
// It has to be mounted BEFORE express.json(), which would otherwise consume the stream and leave
// only a parsed object — re-serialising that yields different bytes and the HMAC never matches.
// express.json() then skips this request because express.raw() has already marked the body read.
app.use('/api/payments/webhook', express.raw({ type: '*/*' }));

app.use(express.json());

app.use(cors({
  origin: (origin, callback) => {
    if (CORS_ORIGINS.includes('*') || !origin || CORS_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    // Tagged with a status so the error handler answers 403 rather than a generic 500.
    const err: any = new Error('Not allowed by CORS');
    err.status = 403;
    callback(err);
  },
  credentials: true,
}));

// Security headers middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  if (IS_PROD) {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  next();
});

// ============ API DOCS ============
app.get('/api-docs.json', (req: Request, res: Response) => {
  res.json(swaggerSpec);
});
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: '1 Darjeeling API Docs',
}));

/**
 * @openapi
 * /:
 *   get:
 *     summary: Health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: API is up
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 app: { type: string, example: "1 Darjeeling" }
 *                 status: { type: string, example: "ok" }
 */
// ============ ROOT / HEALTH ============
app.get('/api', (req: Request, res: Response) => {
  res.json({ app: "1 Darjeeling", status: "ok" });
});

// ============ MOUNT ROUTERS ============
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/providers', providersRouter);
app.use('/api/listings', listingsRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/geocode', geocodeRouter);
app.use('/api', adminRouter); // Mount admin routes directly under /api (e.g. /api/admin/seed, /api/admin/stats)

// ============ 404 + ERROR HANDLING ============
// Must stay last: Express matches in order, so anything reaching here matched no route.
app.use((req: Request, res: Response) => {
  res.status(404).json({ detail: 'Not found' });
});

// Central error handler. Express identifies this as one *only* because it declares 4 arguments —
// dropping `next` silently turns it into ordinary middleware that never runs on errors.
//
// Without this, Express's built-in handler answers instead, and it decides whether to include the
// stack trace by reading NODE_ENV — which this app never sets (it uses APP_ENV). The result was a
// 500 returning an HTML page containing the failing SQL statement and its parameters, in
// production as much as in development.
app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status < 600
    ? err.status
    : 500;

  // The detail always survives here, in the server log, where it's useful and not attacker-visible.
  log.error(`${req.method} ${req.originalUrl} -> ${status}: ${err?.stack || err?.message || err}`);

  // Something already started writing (e.g. a stream); rewriting the status would corrupt it.
  if (res.headersSent) {
    return;
  }

  // 4xx are the caller's own fault and their messages are ours (CORS, malformed JSON body, etc.),
  // so they're safe to echo. 5xx messages come from deeper internals — always generic.
  res.status(status).json({
    detail: status < 500 ? (err?.message || 'Bad request') : 'Internal server error',
  });
});
