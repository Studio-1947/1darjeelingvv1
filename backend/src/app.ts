import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import { IS_PROD, CORS_ORIGINS } from './config';
import { swaggerSpec } from './swagger';

// Import router modules
import authRouter from './routes/auth';
import usersRouter from './routes/users';
import providersRouter from './routes/providers';
import listingsRouter from './routes/listings';
import bookingsRouter from './routes/bookings';
import paymentsRouter from './routes/payments';
import adminRouter from './routes/admin';

export const app = express();
app.use(express.json());

app.use(cors({
  origin: (origin, callback) => {
    if (CORS_ORIGINS.includes('*') || !origin || CORS_ORIGINS.includes(origin)) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
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
app.use('/api', adminRouter); // Mount admin routes directly under /api (e.g. /api/admin/seed, /api/admin/stats)
