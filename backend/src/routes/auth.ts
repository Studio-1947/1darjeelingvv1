import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db, schema } from '../db';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { rateLimiter } from '../middleware/rateLimiter';
import { authenticateToken, makeToken, verifyPassword, hashPassword, needsRehash } from '../middleware/auth';
import { log, ADMIN_USERNAME, ADMIN_PASSWORD, MOCK_OTP, OTP_TTL_SECONDS, OTP_MAX_ATTEMPTS, REVIEW_PHONE, REVIEW_OTP } from '../config';
import { sendOtp } from '../messaging';
import { toPublicUser } from '../lib/publicUser';
import { reserveOtpSend } from '../lib/otpSendBudget';
import { isPlausiblePhone, phoneKey } from '../lib/phone';
import { generateReferralCode, redeemReferralCode } from '../lib/referrals';
import { hashOtp, verifyOtpHash } from '../lib/otpHash';

const router = Router();

/**
 * Roles a caller may pick for themselves at registration. Admin is deliberately absent —
 * it is granted only by the seeded env credentials or by promoting a row directly.
 */
const SELF_ASSIGNABLE_ROLES = ['tourist', 'provider'];

/**
 * Constant-time string comparison, via a digest so the inputs need not be the same length.
 *
 * `===` on a secret leaks its prefix through timing. That is a marginal risk against a code
 * this long, but the reviewer code is the one credential in the system with no expiry and no
 * cross-process rate limit, so it is the last place to spend a marginal risk.
 */
function secretEquals(a: string, b: string): boolean {
  const ha = crypto.createHash('sha256').update(a).digest();
  const hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
}

/** True when this request is the store reviewer signing in with their fixed code. */
function isReviewLogin(phone: unknown, otp: unknown): boolean {
  if (!REVIEW_PHONE) return false;
  if (typeof phone !== 'string' || typeof otp !== 'string') return false;
  // Exact match, deliberately: not phoneKey(), which folds several spellings onto one number.
  // The reviewer types what the console tells them to type, and widening what counts as "the
  // review number" is exactly how a narrow exception stops being narrow.
  if (phone !== REVIEW_PHONE) return false;
  return secretEquals(otp, REVIEW_OTP);
}

/**
 * Compares two secrets without leaking their common prefix through timing. The values are
 * hashed first so a length difference doesn't reach `timingSafeEqual`, which throws on
 * mismatched buffer lengths (and whose throwing would itself be a signal).
 */
function constantTimeEquals(a: unknown, b: unknown): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const digest = (value: string) => crypto.createHash('sha256').update(value, 'utf8').digest();
  return crypto.timingSafeEqual(digest(a), digest(b));
}

// ============ AUTH ROUTES ============

/**
 * @openapi
 * /auth/otp/send:
 *   post:
 *     summary: Send an OTP to a phone number via the configured messaging provider (mocked when MESSAGING_PROVIDER=mock)
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
 *         description: OTP sent (mock_otp and hint only present when MESSAGING_PROVIDER=mock); channel reflects what was actually used for delivery, which may differ from the one requested
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
 *       429:
 *         description: Per-minute rate limit, or a daily send budget (per-phone or platform-wide) is exhausted. Retry-After gives the seconds to wait.
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
router.post(
  '/otp/send',
  rateLimiter(5, 60 * 1000, 'otp_send'),
  rateLimiter(3, 60 * 1000, 'otp_send_phone', {
    // Keyed on the canonical number, not the string as typed. Keying on the raw value meant
    // "+919876543210", "+91 98765 43210" and "9876543210" were three separate buckets for one
    // person, so a caller could reset their own limit by adding a space.
    keyExtractor: (req: Request) => {
      const key = phoneKey(req.body?.phone);
      return key ? `phone:${key}` : undefined;
    },
  }),
  async (req: Request, res: Response) => {
  const { phone, channel = 'whatsapp' } = req.body;
  if (!phone) {
    return res.status(400).json({ detail: 'Phone number is required' });
  }

  // Checked before anything is reserved or sent. This route used to test only that `phone` was
  // present, so any string reached the budget and the messaging provider — and on a mock-mode
  // server the universal code then verified it, leaving an account whose identity was
  // "not-a-number". The filter is permissive about shape on purpose: the website's phone field
  // is free text, so real accounts exist under every spelling a person might type, and all of
  // them have to keep working. See lib/phone.ts.
  if (!isPlausiblePhone(phone)) {
    return res.status(400).json({ detail: 'That does not look like a phone number' });
  }

  // Durable daily ceiling, checked before a code is generated or a message costs anything. The
  // per-minute limiters above cap the rate; this caps the total, and survives the restart that
  // clears them. Spent against the canonical number so the ten-a-day cannot be reset by
  // respelling it. See lib/otpSendBudget.ts.
  // The reviewer's code is fixed and already in the Play Console, so there is nothing to send.
  // Short-circuited before the budget reservation on purpose: a real dispatch here would spend
  // from the daily cap and deliver an SMS to a number the reviewer does not hold, and the code
  // it delivered would not be the one they were given.
  if (REVIEW_PHONE && phone === REVIEW_PHONE) {
    const [reviewUser] = await db.select().from(schema.users).where(eq(schema.users.phone, phone)).limit(1);
    return res.json({ sent: true, channel, exists: !!reviewUser });
  }

  const budget = await reserveOtpSend(phoneKey(phone) ?? phone);
  if (!budget.ok) {
    res.setHeader('Retry-After', String(budget.retryAfterSeconds));
    return res.status(429).json({
      detail: budget.scope === 'phone'
        // Named for what it is, so a real person on a bad line knows waiting is the answer and
        // trying a different number is not.
        ? 'Too many codes requested for this number today. Try again tomorrow.'
        // Deliberately vague: that the PLATFORM is out of budget is exactly the feedback an
        // attacker draining it is looking for.
        : 'Could not send OTP, please try again later',
    });
  }

  // crypto.randomInt, not Math.random: V8 implements Math.random as xorshift128+, whose internal
  // state can be recovered from a handful of consecutive outputs. On this endpoint that is an
  // account-takeover path — request codes for a number you control until the state is known, then
  // predict the code issued to someone else's. randomInt draws from the CSPRNG and is uniform over
  // the range (no modulo bias). Upper bound is exclusive, so this yields 100000..999999.
  const otp = crypto.randomInt(100000, 1000000).toString();
  const challengeId = uuidv4();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + OTP_TTL_SECONDS * 1000).toISOString();
  const otpHash = await hashOtp(otp);

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
  // The channel actually used for delivery — reported below and stored — comes from the
  // provider's response, not the caller's request: it may differ (msg91 always delivers SMS
  // regardless of what was asked for), and telling the caller "sent via whatsapp" when an SMS
  // went out is the same class of untruth this layer exists to prevent.
  let deliveredChannel: string;
  try {
    ({ channel: deliveredChannel } = await sendOtp({ phone, otp, channel, challengeId }));
  } catch (err) {
    // The diagnostic can name the provider and quote its response, so it stays server-side.
    log.error(`[otp] delivery failed for ****${phone.slice(-4)}: ${(err as Error).message}`);
    // Nothing was delivered, so nothing was spent. Handing the reservation back keeps a provider
    // outage from burning through a user's ten daily codes — or the platform's thousand.
    await budget.release();
    return res.status(502).json({ detail: 'Could not send OTP, please try again' });
  }

  // Do not overwrite an older, already-delivered challenge. A delivery failure on a resend must
  // not take away the code the customer already has; each successfully handed-off code is an
  // independently expiring, single-use challenge.
  await db.insert(schema.otps).values({
    id: challengeId,
    phone,
    otpHash,
    channel: deliveredChannel,
    createdAt: now,
    expiresAt,
    attempts: 0,
  });

  if (MOCK_OTP) {
    return res.json({
      sent: true,
      channel: deliveredChannel,
      mock_otp: otp,
      hint: "Mock mode: use the OTP shown or 123456",
      exists
    });
  }

  return res.json({ sent: true, channel: deliveredChannel, exists });
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
 *               otp: { type: string, description: "6-digit OTP, or '123456' universal code when MESSAGING_PROVIDER=mock" }
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
 *       429:
 *         description: Too many incorrect attempts against the current OTP
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
 */
// Verify OTP
router.post('/otp/verify', rateLimiter(10, 60 * 1000, 'otp_verify'), async (req: Request, res: Response) => {
  const { phone, otp, name, role = 'tourist', referral_code: referralCode } = req.body;
  if (!phone || !otp) {
    return res.status(400).json({ detail: 'Phone and OTP are required' });
  }

  // A junk number can no longer be issued a code at all, so this is belt and braces — except in
  // mock mode, where the universal bypass below needs no stored row and would otherwise still
  // mint a session for one. Lookup still uses the number exactly as sent: `users.phone` holds
  // whatever was typed at signup, and canonicalising here would send an existing user to a new,
  // empty account instead of their own.
  if (!isPlausiblePhone(phone)) {
    return res.status(400).json({ detail: 'That does not look like a phone number' });
  }

  const [otpRec] = await db.select().from(schema.otps)
    .where(and(eq(schema.otps.phone, phone), isNull(schema.otps.consumedAt)))
    .orderBy(desc(schema.otps.createdAt))
    .limit(1);

  // The universal bypass is evaluated first and deliberately: it has to work with no stored
  // row at all, which is how the test helpers and mock-mode logins work.
  const universalOk = MOCK_OTP && otp === '123456';
  // Same shape as the universal bypass, and for the same reason: there is no stored row to
  // check against. Unlike it, this one is scoped to a single number and survives into
  // production, which is the whole point — see the REVIEW_PHONE block in config.ts.
  const reviewOk = isReviewLogin(phone, otp);

  if (!universalOk && !reviewOk) {
    if (!otpRec) {
      return res.status(400).json({ detail: 'Invalid OTP' });
    }

    // Checked before expiry: someone who has burned the cap should be told to request a new
    // code regardless of whether the old one also aged out, since that is the actionable step.
    if (otpRec.attempts >= OTP_MAX_ATTEMPTS) {
      return res.status(429).json({ detail: 'Too many incorrect attempts. Request a new OTP.' });
    }

    if (Date.now() > new Date(otpRec.expiresAt).getTime()) {
      return res.status(400).json({ detail: 'OTP expired. Request a new one.' });
    }

    if (!(await verifyOtpHash(otpRec.otpHash, otp))) {
      await db.update(schema.otps)
        .set({ attempts: otpRec.attempts + 1 })
        .where(eq(schema.otps.id, otpRec.id));
      return res.status(400).json({ detail: 'Invalid OTP' });
    }
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
      // Never trust the body for this: 'admin' is what every requireAdmin guard keys on,
      // so anything outside the self-serviceable roles registers as a plain tourist.
      role: SELF_ASSIGNABLE_ROLES.includes(role) ? role : 'tourist',
      providerPaid: false,
      email: null,
      language: null,
      avatar: null,
      createdAt: new Date().toISOString(),
      supportExpiresAt: null,
      password: null,
      phoneVerifiedAt: new Date().toISOString(),
      // Minted at registration so the invite screen never has to wait on a write.
      referralCode: await generateReferralCode()
    };
    await db.insert(schema.users).values(user);

    // A code only counts at signup, and only for the account that just came into existence —
    // that is the whole anti-abuse story, and it is enforced by a unique referee_id rather than
    // by this call site. Deliberately after the insert and deliberately unawaited-for-failure:
    // redeemReferralCode never throws, because losing a reward must not cost someone the
    // account they just created.
    if (referralCode) {
      const redeemed = await redeemReferralCode(user.id, referralCode);
      if (redeemed.ok) {
        // The row was just written by redeem; re-read so the token and the response carry the
        // extended expiry rather than the null this object still holds.
        const [fresh] = await db.select().from(schema.users).where(eq(schema.users.id, user.id)).limit(1);
        if (fresh) user = fresh;
      }
    }
  }

  if (otpRec) {
    // Deleting after a successful verification both consumes this challenge and removes its
    // Argon2 hash sooner than its natural expiry. Other challenges for a resend stay usable.
    await db.delete(schema.otps).where(eq(schema.otps.id, otpRec.id));
  }

  if (user && !user.phoneVerifiedAt) {
    await db.update(schema.users)
      .set({ phoneVerifiedAt: new Date().toISOString() })
      .where(eq(schema.users.id, user.id));
    user.phoneVerifiedAt = new Date().toISOString();
  }

  const token = makeToken(user.id, user.phone, user.role);
  return res.json({ token, user: toPublicUser(user) });
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
  // Already the public shape — authenticateToken sanitises before the request reaches here.
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

  // Check hardcoded/env credentials first. The password is compared in constant time, the same
  // way DB password hashes and Razorpay signatures are elsewhere — `===` short-circuits on the
  // first differing character, which leaks how much of a guess was correct.
  if (loginInput === ADMIN_USERNAME && constantTimeEquals(password, ADMIN_PASSWORD)) {
    const adminUser = {
      id: 'admin-system',
      name: 'System Administrator',
      phone: ADMIN_USERNAME,
      role: 'admin',
      createdAt: new Date().toISOString()
    };
    const token = makeToken(adminUser.id, adminUser.phone, adminUser.role);
    return res.json({ token, user: toPublicUser(adminUser) });
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
  return res.json({ token, user: toPublicUser(user) });
});

export default router;
