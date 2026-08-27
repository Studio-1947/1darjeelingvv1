import {
  MessagingProvider,
  MessageDeliveryError,
  NotificationMessage,
  NotificationTemplate,
  OtpMessage,
} from '../types';

/**
 * Interakt — WhatsApp, through a Meta Business Solution Provider rather than Meta directly.
 *
 * Same messages and the same Meta-approved templates as providers/whatsapp.ts; a different
 * account to hold them and a different envelope to send them in. Worth having as a choice
 * because a BSP takes the Cloud API setup off your hands — the number registration, the
 * two-step PIN, the system-user token, the template submissions all happen in their console —
 * at the cost of a per-message margin and one more company between you and delivery.
 *
 * Pick with MESSAGING_PROVIDER=interakt. Nothing else in the app changes: the templates are the
 * ones in docs/WHATSAPP_TEMPLATES.md, synced into Interakt from the same Meta business account.
 */

const INTERAKT_MESSAGE_URL = 'https://api.interakt.ai/v1/public/message/';

/** Same three transactional messages, named by whatever they were synced as in Interakt. */
const TEMPLATE_ENV_VARS: Record<NotificationTemplate, string> = {
  booking_confirmed_guest: 'INTERAKT_BOOKING_CONFIRMED_GUEST_TEMPLATE',
  booking_confirmed_host: 'INTERAKT_BOOKING_CONFIRMED_HOST_TEMPLATE',
  booking_cancelled_guest: 'INTERAKT_BOOKING_CANCELLED_GUEST_TEMPLATE',
};

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_QUOTED_BODY = 200;

/**
 * WhatsApp caps an authentication code at 15 characters. Ours are six digits, so this only ever
 * fires if the generator changes — which is exactly when you want to hear about it, rather than
 * discovering that codes silently stopped arriving on some handsets.
 */
const MAX_OTP_LENGTH = 15;

/**
 * Interakt wants the country code and the subscriber number as separate fields, and this app
 * stores whatever the user typed — see lib/phone.ts, which is deliberately permissive because
 * real accounts exist under every spelling.
 *
 * The split is therefore a guess unless the number is one we can recognise, so it only makes the
 * ones it can defend:
 *
 *   +919876543210  → ("+91", "9876543210")   the canonical form both clients send
 *   9876543210     → (default, as typed)     a bare national number
 *   09876543210    → (default, minus trunk)  the domestic dialling spelling
 *
 * Anything else carrying a different country code is REFUSED rather than guessed at. Splitting
 * an arbitrary E.164 needs a numbering-plan table, and a wrong guess here does not fail — it
 * delivers a code to a real person in another country. A loud failure is the safer wrong answer.
 */
export function splitPhone(
  raw: string,
  defaultCountryCode: string
): { countryCode: string; phoneNumber: string } {
  const trimmed = raw.trim().replace(/[\s()\-.]/g, '');
  const cc = defaultCountryCode.startsWith('+') ? defaultCountryCode : `+${defaultCountryCode}`;
  const ccDigits = cc.slice(1);

  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1);
    if (!/^[0-9]+$/.test(digits)) {
      throw new MessageDeliveryError('interakt', `not a phone number: "${raw}"`);
    }
    if (digits.startsWith(ccDigits)) {
      return { countryCode: cc, phoneNumber: digits.slice(ccDigits.length) };
    }
    throw new MessageDeliveryError(
      'interakt',
      `cannot split "${raw}" into country code and subscriber number: it is not ${cc}, and ` +
      `guessing where the country code ends would risk delivering a login code to the wrong ` +
      `person. Set INTERAKT_COUNTRY_CODE if this app now serves another country.`
    );
  }

  if (!/^[0-9]+$/.test(trimmed)) {
    throw new MessageDeliveryError('interakt', `not a phone number: "${raw}"`);
  }
  // A leading 0 is the domestic trunk prefix, not part of the subscriber number.
  const national = trimmed.length === 11 && trimmed.startsWith('0') ? trimmed.slice(1) : trimmed;
  return { countryCode: cc, phoneNumber: national };
}

interface InteraktResponse {
  result?: boolean;
  id?: string;
  message?: string;
}

/**
 * `fetchImpl` is injectable purely so the suite can exercise every failure branch without a
 * network — the same reason the other two adapters take one.
 */
export function createInteraktProvider(
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch = fetch
): MessagingProvider {
  const countryCode = env.INTERAKT_COUNTRY_CODE?.trim() || '+91';

  async function postMessage(payload: unknown, what: string): Promise<string | undefined> {
    // Interakt issues a key that is already base64; it goes after "Basic" verbatim, and is NOT
    // a user:password pair to be encoded again. Encoding it twice is the classic first failure
    // here and presents as a flat 401 with no other clue.
    const key = env.INTERAKT_API_KEY!.trim();

    let res: Response;
    try {
      res = await fetchImpl(INTERAKT_MESSAGE_URL, {
        method: 'POST',
        headers: { Authorization: `Basic ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new MessageDeliveryError(
        'interakt',
        `network error contacting Interakt (${what}): ${(err as Error).message}`,
        { cause: err }
      );
    }

    const bodyText = await res.text().catch(() => '');

    if (!res.ok) {
      throw new MessageDeliveryError(
        'interakt',
        `Interakt returned HTTP ${res.status} (${what}): ${bodyText.slice(0, MAX_QUOTED_BODY)}`
      );
    }

    let body: InteraktResponse;
    try {
      body = JSON.parse(bodyText);
    } catch {
      throw new MessageDeliveryError(
        'interakt',
        `Interakt returned a non-JSON body (${what}): ${bodyText.slice(0, MAX_QUOTED_BODY)}`
      );
    }

    // Interakt reports application-level failures under HTTP 200 with result:false — the same
    // trap MSG91 sets with type:"error". A 2xx alone must never be read as an accepted message.
    if (body.result !== true) {
      throw new MessageDeliveryError(
        'interakt',
        `Interakt rejected the request (${what}): ${body.message ?? bodyText.slice(0, MAX_QUOTED_BODY)}`
      );
    }

    return body.id;
  }

  return {
    name: 'interakt',

    init() {
      const required = ['INTERAKT_API_KEY', 'INTERAKT_OTP_TEMPLATE'];
      const missing = required.filter((k) => !env[k]?.trim());
      if (missing.length > 0) {
        throw new Error(
          `[messaging] MESSAGING_PROVIDER=interakt requires ${missing.join(', ')}. ` +
          `See docs/WHATSAPP_SETUP.md, or use MESSAGING_PROVIDER=mock.`
        );
      }

      if (!/^\+?[0-9]{1,3}$/.test(countryCode)) {
        throw new Error(
          `[messaging] INTERAKT_COUNTRY_CODE must be a dialling code like "+91", got "${countryCode}".`
        );
      }

      // Same reasoning as the other two adapters: a deployment that means to notify people must
      // fail at boot rather than at the first confirmed booking.
      if (env.NOTIFY_BOOKINGS?.trim().toLowerCase() === 'true') {
        const missingTemplates = Object.values(TEMPLATE_ENV_VARS).filter((k) => !env[k]?.trim());
        if (missingTemplates.length > 0) {
          throw new Error(
            `[messaging] NOTIFY_BOOKINGS=true with MESSAGING_PROVIDER=interakt requires a synced ` +
            `template name for every transactional message: ${missingTemplates.join(', ')}. ` +
            `Sync them into Interakt and set these, or set NOTIFY_BOOKINGS=false.`
          );
        }
      }
    },

    async sendOtp({ phone, otp }: OtpMessage) {
      if (otp.length > MAX_OTP_LENGTH) {
        throw new MessageDeliveryError(
          'interakt',
          `authentication codes must be ${MAX_OTP_LENGTH} characters or fewer; got ${otp.length}.`
        );
      }

      const { countryCode: cc, phoneNumber } = splitPhone(phone, countryCode);

      // The code goes in the body AND the button, exactly as it does through Meta directly: the
      // button is what fills the clipboard on "Copy code", and omitting it is rejected.
      const payload = {
        countryCode: cc,
        phoneNumber,
        type: 'Template',
        template: {
          name: env.INTERAKT_OTP_TEMPLATE!.trim(),
          languageCode: env.INTERAKT_TEMPLATE_LANGUAGE?.trim() || 'en',
          bodyValues: [otp],
          buttonValues: { '0': [otp] },
        },
      };

      const ref = await postMessage(payload, 'otp');
      return { ref, channel: 'whatsapp' };
    },

    async sendNotification({ phone, template, vars }: NotificationMessage) {
      const templateEnvVar = TEMPLATE_ENV_VARS[template];
      const templateName = env[templateEnvVar]?.trim();

      if (!templateName) {
        throw new MessageDeliveryError(
          'interakt',
          `no Interakt template configured for "${template}" — set ${templateEnvVar}.`
        );
      }

      const { countryCode: cc, phoneNumber } = splitPhone(phone, countryCode);

      // Positional, in the order lib/notifications.ts builds them — the same contract the direct
      // Cloud API adapter honours, and the one backend/test/notificationVars.test.ts pins.
      const payload = {
        countryCode: cc,
        phoneNumber,
        type: 'Template',
        template: {
          name: templateName,
          languageCode: env.INTERAKT_TEMPLATE_LANGUAGE?.trim() || 'en',
          bodyValues: Object.values(vars),
        },
      };

      const ref = await postMessage(payload, `notification:${template}`);
      return { ref, channel: 'whatsapp' };
    },
  };
}
