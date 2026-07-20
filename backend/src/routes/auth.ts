import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { rateLimiter } from '../middleware/rateLimiter';
import { authenticateToken, makeToken, verifyPassword, hashPassword, needsRehash } from '../middleware/auth';
import { IS_PROD, log, ADMIN_USERNAME, ADMIN_PASSWORD, MOCK_OTP, OTP_TTL_SECONDS, OTP_MAX_ATTEMPTS } from '../config';
import { sendOtp } from '../messaging';

const router = Router();

// ============ AUTH ROUTES ============

/**
 * @openapi
 * /auth/otp/send:
 *   post:
 *     summary: Send a WhatsApp OTP to a phone number (mocked outside production)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone]
 *             properties:
 *               phone: { type: string, example: "+919999999999" }
 *               channel: { type: string, default: whatsapp }
 *     responses:
 *       200:
 *         description: OTP sent (mock_otp only present outside production)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sent: { type: boolean }
 *                 channel: { type: string }
 *                 mock_otp: { type: string }
 *                 hint: { type: string }
 *                 exists: { type: boolean }
 *       400:
 *         description: Missing phone number
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 *       502:
 *         description: The messaging provider could not be reached or rejected the request
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// Send OTP
router.post('/otp/send', rateLimiter(5, 60 * 1000, 'otp_send'), async (req: Request, res: Response) => {
  const { phone, channel = 'whatsapp' } = req.body;
  if (!phone) {
    return res.status(400).json({ detail: 'Phone number is required' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const now = new Date().toISOString();

  // Check if the user already exists
  const [user] = await db.select().from(schema.users).where(eq(schema.users.phone, phone)).limit(1);
  const exists = !!user;

  // Only a resolved send permits reporting `sent: true`. The previous version returned success
  // unconditionally, so in production every caller was told a code had been sent when nothing
  // had been dispatched at all.
  //
  // Delivery is attempted before the OTP is stored, not after. The upsert below replaces any
  // still-valid code the user was previously issued for this phone; if delivery then failed,
  // that replacement would never reach the user while the code it destroyed still would have
  // worked. Storing only on a confirmed send means a failed resend leaves an existing, working
  // code intact instead of leaving the user with nothing.
  try {
    await sendOtp({ phone, otp, channel });
  } catch (err) {
    // The diagnostic can name the provider and quote its response, so it stays server-side.
    log.error(`[otp] delivery failed for ****${phone.slice(-4)}: ${(err as Error).message}`);
    return res.status(502).json({ detail: 'Could not send OTP, please try again' });
  }

  await db.insert(schema.otps)
    .values({ phone, otp, channel, createdAt: now })
    .onConflictDoUpdate({
      target: schema.otps.phone,
      set: { otp, channel, createdAt: now }
    });

  if (MOCK_OTP) {
    return res.json({
      sent: true,
      channel,
      mock_otp: otp,
      hint: "Mock mode: use the OTP shown or 123456",
      exists
    });
  }

  return res.json({ sent: true, channel, exists });
});

/**
 * @openapi
 * /auth/otp/verify:
 *   post:
 *     summary: Verify an OTP and log in (creating the user on first verification)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [phone, otp]
 *             properties:
 *               phone: { type: string }
 *               otp: { type: string, description: "6-digit OTP, or '123456' universal code outside production" }
 *               name: { type: string, description: "Required on first login for a new phone number" }
 *               role: { type: string, enum: [tourist, provider], default: tourist }
 *     responses:
 *       200:
 *         description: Login success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 user: { $ref: '#/components/schemas/User' }
 *       400:
 *         description: Invalid OTP or missing name for new registration
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// Verify OTP
router.post('/otp/verify', rateLimiter(10, 60 * 1000, 'otp_verify'), async (req: Request, res: Response) => {
  const { phone, otp, name, role = 'tourist' } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ detail: 'Phone and OTP are required' });
  }

  const [otpRec] = await db.select().from(schema.otps).where(eq(schema.otps.phone, phone)).limit(1);
  const universalOk = (!IS_PROD) && otp === '123456';

  if (!universalOk && (!otpRec || otpRec.otp !== otp)) {
    return res.status(400).json({ detail: 'Invalid OTP' });
  }

  let [user] = await db.select().from(schema.users).where(eq(schema.users.phone, phone)).limit(1);
  if (!user) {
    if (!name || name.trim() === '') {
      return res.status(400).json({ detail: 'Name is required for registration' });
    }
    user = {
      id: uuidv4(),
      phone,
      name: name.trim(),
      role,
      providerPaid: false,
      email: null,
      language: null,
      avatar: null,
      createdAt: new Date().toISOString(),
      password: null
    };
    await db.insert(schema.users).values(user);
  }

  if (otpRec) {
    await db.delete(schema.otps).where(eq(schema.otps.phone, phone));
  }

  const token = makeToken(user.id, user.phone, user.role);
  return res.json({ token, user });
});

/**
 * @openapi
 * /auth/me:
 *   get:
 *     summary: Get the current authenticated user
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     responses:
 *       200:
 *         description: The current user
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user: { $ref: '#/components/schemas/User' }
 *       401:
 *         description: Missing or invalid token
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// Current User Details
router.get('/me', authenticateToken, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

/**
 * @openapi
 * /auth/admin/login:
 *   post:
 *     summary: Admin login with username/password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [password]
 *             properties:
 *               phone: { type: string, description: "Admin username, or a user's phone for a DB-backed admin" }
 *               username: { type: string, description: "Alias for phone" }
 *               password: { type: string }
 *     responses:
 *       200:
 *         description: Login success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token: { type: string }
 *                 user: { $ref: '#/components/schemas/User' }
 *       400:
 *         description: Missing credentials
 *       401:
 *         description: Invalid credentials or not an admin
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// Admin Login with Password
router.post('/admin/login', rateLimiter(10, 60 * 1000, 'admin_login'), async (req: Request, res: Response) => {
  const { phone, password } = req.body;
  const loginInput = phone || req.body.username;

  if (!loginInput || !password) {
    return res.status(400).json({ detail: 'Login username and password are required' });
  }

  // Check hardcoded/env credentials first
  if (loginInput === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const adminUser = {
      id: 'admin-system',
      name: 'System Administrator',
      phone: ADMIN_USERNAME,
      role: 'admin',
      createdAt: new Date().toISOString()
    };
    const token = makeToken(adminUser.id, adminUser.phone, adminUser.role);
    return res.json({ token, user: adminUser });
  }

  const [user] = await db.select().from(schema.users).where(eq(schema.users.phone, loginInput)).limit(1);
  if (!user || user.role !== 'admin' || !user.password) {
    return res.status(401).json({ detail: 'Invalid credentials or not an admin' });
  }

  const valid = verifyPassword(password, user.password);
  if (!valid) {
    return res.status(401).json({ detail: 'Invalid credentials' });
  }

  // Login is the only moment the plaintext is available, so it's the only chance to upgrade a
  // legacy 1,000-iteration hash to the current work factor without forcing a password reset.
  if (needsRehash(user.password)) {
    await db.update(schema.users)
      .set({ password: hashPassword(password) })
      .where(eq(schema.users.id, user.id));
    log.info(`Upgraded password hash for admin ${user.id}`);
  }

  const token = makeToken(user.id, user.phone, user.role);
  return res.json({ token, user });
});

export default router;
