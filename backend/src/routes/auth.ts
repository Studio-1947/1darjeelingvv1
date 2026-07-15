import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { eq } from 'drizzle-orm';
import { rateLimiter } from '../middleware/rateLimiter';
import { authenticateToken, makeToken, verifyPassword } from '../middleware/auth';
import { IS_PROD, log, ADMIN_USERNAME, ADMIN_PASSWORD } from '../config';

const router = Router();

// ============ AUTH ROUTES ============

// Send OTP
router.post('/otp/send', rateLimiter(5, 60 * 1000, 'otp_send'), async (req: Request, res: Response) => {
  const { phone, channel = 'whatsapp' } = req.body;
  if (!phone) {
    return res.status(400).json({ detail: 'Phone number is required' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  const now = new Date().toISOString();

  await db.insert(schema.otps)
    .values({ phone, otp, channel, createdAt: now })
    .onConflictDoUpdate({
      target: schema.otps.phone,
      set: { otp, channel, createdAt: now }
    });

  // Check if the user already exists
  const [user] = await db.select().from(schema.users).where(eq(schema.users.phone, phone)).limit(1);
  const exists = !!user;

  if (!IS_PROD) {
    log.info(`[MOCK OTP] phone=****${phone.slice(-4)} otp=${otp}`);
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

// Current User Details
router.get('/me', authenticateToken, (req: Request, res: Response) => {
  res.json({ user: req.user });
});

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

  const token = makeToken(user.id, user.phone, user.role);
  return res.json({ token, user });
});

export default router;
