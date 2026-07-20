import Razorpay from 'razorpay';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

// Logging setup — defined first so the startup validation below can use it.
export const log = {
  info: (msg: string) => console.log(`[INFO] ${new Date().toISOString()} - ${msg}`),
  error: (msg: string) => console.error(`[ERROR] ${new Date().toISOString()} - ${msg}`)
};

// APP_ENV must be stated explicitly. It previously defaulted to 'development', which meant a
// single unset variable in production silently re-enabled the mock-OTP bypass (any phone number
// logs in with 123456) and the dev secret defaults below. A missing APP_ENV is an operator
// mistake, not a request for dev mode — so refuse to start rather than guess.
const VALID_APP_ENVS = ['development', 'test', 'production'];
const rawAppEnv = process.env.APP_ENV?.trim();
if (!rawAppEnv) {
  throw new Error(
    `[config] APP_ENV is required and must be one of: ${VALID_APP_ENVS.join(', ')}. ` +
    `Set it explicitly (see .env.example) — it is not assumed.`
  );
}
if (!VALID_APP_ENVS.includes(rawAppEnv)) {
  throw new Error(`[config] APP_ENV="${rawAppEnv}" is invalid. Must be one of: ${VALID_APP_ENVS.join(', ')}.`);
}

export const APP_ENV = rawAppEnv;
export const IS_PROD = APP_ENV === 'production';

// Values that are safe to default in local dev but must never reach production. In production the
// variable has to be set to something that isn't the dev default; otherwise startup fails loudly
// here rather than quietly shipping a publicly-known secret.
function requireRealValueInProd(name: string, value: string | undefined, devDefault: string): string {
  const trimmed = value?.trim();
  if (!IS_PROD) {
    return trimmed || devDefault;
  }
  if (!trimmed) {
    throw new Error(`[config] ${name} must be set when APP_ENV=production.`);
  }
  if (trimmed === devDefault) {
    throw new Error(`[config] ${name} is still set to its development default. Set a real value for production.`);
  }
  // Catches the copy-.env.production.example-and-forget case, whose placeholders are all change_me_*.
  if (/^change_me/i.test(trimmed)) {
    throw new Error(`[config] ${name} is still set to the "change_me..." placeholder from .env.production.example.`);
  }
  return trimmed;
}

export const PORT = process.env.PORT || 8000;

// Number of reverse proxies in front of Express, passed to app.set('trust proxy').
// Production chain is: client -> system Nginx (host) -> nginx container -> backend, and both
// Nginx layers append $proxy_add_x_forwarded_for, so there are exactly 2 trusted hops.
// This is a hop COUNT rather than `true` on purpose: `true` trusts the leftmost X-Forwarded-For
// entry, which is entirely attacker-supplied — anyone could spoof their IP and evade rate limits.
// Counting from the right means a forged prefix is ignored. In development there is no proxy, so 0.
const rawTrustProxy = process.env.TRUST_PROXY_HOPS?.trim();
export const TRUST_PROXY_HOPS = rawTrustProxy !== undefined && rawTrustProxy !== ''
  ? Number(rawTrustProxy)
  : (IS_PROD ? 2 : 0);
if (!Number.isInteger(TRUST_PROXY_HOPS) || TRUST_PROXY_HOPS < 0) {
  throw new Error(`[config] TRUST_PROXY_HOPS must be a non-negative integer, got "${rawTrustProxy}".`);
}

// Rate limiting is off in the test suite by default (tests would trip the OTP limits immediately).
// Individual tests opt back in per-middleware — see middleware/rateLimiter.ts.
export const RATE_LIMIT_ENABLED = process.env.RATE_LIMIT_ENABLED
  ? process.env.RATE_LIMIT_ENABLED.toLowerCase() === 'true'
  : APP_ENV !== 'test';
export const JWT_SECRET = requireRealValueInProd('JWT_SECRET', process.env.JWT_SECRET, 'dev_only_insecure_jwt_secret');
export const MOCK_PAYMENTS = process.env.MOCK_PAYMENTS ? process.env.MOCK_PAYMENTS.toLowerCase() === 'true' : true;
export const CORS_ORIGINS = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['*'];
export const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || '';
export const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || '';
// Separate from KEY_SECRET: set in the Razorpay dashboard when creating the webhook, and used
// only to verify the X-Razorpay-Signature header on incoming webhook calls.
export const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || '';
export const ADMIN_BOOTSTRAP_SECRET = requireRealValueInProd('ADMIN_BOOTSTRAP_SECRET', process.env.ADMIN_BOOTSTRAP_SECRET, '');
export const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
export const ADMIN_PASSWORD = requireRealValueInProd('ADMIN_PASSWORD', process.env.ADMIN_PASSWORD, 'adminpassword123');

if (IS_PROD) {
  if (CORS_ORIGINS.includes('*')) {
    throw new Error('[config] CORS_ORIGINS must not be "*" when APP_ENV=production. List the real origins.');
  }
  if (MOCK_PAYMENTS) {
    log.error('[config] MOCK_PAYMENTS=true with APP_ENV=production — payments are simulated and no money will be charged.');
  }
}

// Once real money is involved, a missing key is not something to discover at checkout in front of
// a paying customer — fail at boot instead.
if (!MOCK_PAYMENTS) {
  if (!RAZORPAY_KEY_ID || !RAZORPAY_KEY_SECRET) {
    throw new Error('[config] RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required when MOCK_PAYMENTS=false.');
  }
  if (IS_PROD && RAZORPAY_KEY_ID.startsWith('rzp_test_')) {
    throw new Error('[config] RAZORPAY_KEY_ID is a test key (rzp_test_*) but APP_ENV=production. Use live keys, or set MOCK_PAYMENTS=true.');
  }
  if (!RAZORPAY_WEBHOOK_SECRET) {
    // Without this, /payments/webhook cannot verify signatures, so any payment where the customer
    // closes the tab before the browser callback fires is charged but never settled in the app.
    throw new Error('[config] RAZORPAY_WEBHOOK_SECRET is required when MOCK_PAYMENTS=false. See README "Razorpay setup".');
  }
}

export const rzpClient = RAZORPAY_KEY_SECRET ? new Razorpay({
  key_id: RAZORPAY_KEY_ID,
  key_secret: RAZORPAY_KEY_SECRET
}) : null;

export const AMOUNTS: Record<string, number> = {
  provider_registration: 9900,
  booking_commission: 100
};
