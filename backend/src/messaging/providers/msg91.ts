import {
  MessagingProvider,
  MessageDeliveryError,
  NotificationMessage,
  NotificationTemplate,
  OtpMessage,
} from '../types';

const MSG91_OTP_URL = 'https://control.msg91.com/api/v5/otp';
// Transactional messages go through Flow, not the OTP endpoint: the OTP API only ever sends a
// code against the one OTP template, so it cannot carry a booking confirmation.
const MSG91_FLOW_URL = 'https://control.msg91.com/api/v5/flow/';

/**
 * Each transactional message needs its OWN DLT-approved template registered with MSG91, so each
 * one gets its own env var. A template that is not configured is a hard delivery failure rather
 * than a silent skip — the whole point of this layer is that "notified" is never recorded for a
 * message nobody sent.
 */
const TEMPLATE_ENV_VARS: Record<NotificationTemplate, string> = {
  booking_confirmed_guest: 'MSG91_BOOKING_CONFIRMED_GUEST_TEMPLATE_ID',
  booking_confirmed_host: 'MSG91_BOOKING_CONFIRMED_HOST_TEMPLATE_ID',
  booking_cancelled_guest: 'MSG91_BOOKING_CANCELLED_GUEST_TEMPLATE_ID',
};

// A hung provider must not hold an Express handler open indefinitely.
const REQUEST_TIMEOUT_MS = 10_000;

const MAX_QUOTED_BODY = 200;

/**
 * MSG91 v5 OTP API.
 *
 * `fetchImpl` is injectable purely so the suite can exercise every failure branch without a
 * network — the same reason rateLimiter takes `opts.enabled`. Application code always gets
 * the global fetch.
 */
export function createMsg91Provider(
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch = fetch
): MessagingProvider {
  return {
    name: 'msg91',

    init() {
      const missing = ['MSG91_AUTH_KEY', 'MSG91_TEMPLATE_ID'].filter((k) => !env[k]?.trim());
      if (missing.length > 0) {
        throw new Error(
          `[messaging] MESSAGING_PROVIDER=msg91 requires ${missing.join(', ')}. ` +
          `Set them, or use MESSAGING_PROVIDER=mock.`
        );
      }

      // Only demanded when booking notifications are switched on. Validating here rather than at
      // first send means a deployment that intends to notify guests cannot boot half-configured
      // and discover it at the first confirmed booking — the same reasoning as the Razorpay
      // checks in config.ts.
      if (env.NOTIFY_BOOKINGS?.trim().toLowerCase() === 'true') {
        const missingTemplates = Object.values(TEMPLATE_ENV_VARS).filter((k) => !env[k]?.trim());
        if (missingTemplates.length > 0) {
          throw new Error(
            `[messaging] NOTIFY_BOOKINGS=true with MESSAGING_PROVIDER=msg91 requires a DLT ` +
            `template id for every transactional message: ${missingTemplates.join(', ')}. ` +
            `Register the templates in the MSG91 dashboard and set these, or set ` +
            `NOTIFY_BOOKINGS=false to leave booking notifications off.`
          );
        }
      }
    },

    async sendOtp({ phone, otp }: OtpMessage) {
      const authKey = env.MSG91_AUTH_KEY!.trim();
      const templateId = env.MSG91_TEMPLATE_ID!.trim();

      // MSG91 wants a bare country-code-prefixed number ("919999999999"), not the "+91 ..."
      // form this app stores.
      const mobile = phone.replace(/\D/g, '');

      const url =
        `${MSG91_OTP_URL}?template_id=${encodeURIComponent(templateId)}` +
        `&mobile=${encodeURIComponent(mobile)}` +
        `&otp=${encodeURIComponent(otp)}`;

      let res: Response;
      try {
        res = await fetchImpl(url, {
          method: 'POST',
          // The key travels as a header, never in the URL, so it cannot end up in a log line
          // that quotes the request.
          headers: { authkey: authKey, 'Content-Type': 'application/json' },
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        throw new MessageDeliveryError(
          'msg91',
          `network error contacting MSG91: ${(err as Error).message}`,
          { cause: err }
        );
      }

      const bodyText = await res.text().catch(() => '');

      if (!res.ok) {
        throw new MessageDeliveryError('msg91', `MSG91 returned HTTP ${res.status}: ${bodyText.slice(0, MAX_QUOTED_BODY)}`);
      }

      let body: { type?: string; message?: string; request_id?: string };
      try {
        body = JSON.parse(bodyText);
      } catch {
        throw new MessageDeliveryError('msg91', `MSG91 returned a non-JSON body: ${bodyText.slice(0, MAX_QUOTED_BODY)}`);
      }

      // MSG91 reports application-level failures with HTTP 200 and type:"error". Treating a
      // 2xx as success here would mean reporting delivery for a code that was never sent —
      // the exact defect this layer exists to prevent.
      if (body?.type !== 'success') {
        throw new MessageDeliveryError(
          'msg91',
          `MSG91 rejected the request: ${body?.message ?? bodyText.slice(0, MAX_QUOTED_BODY)}`
        );
      }

      // MSG91's v5 OTP endpoint always delivers via SMS regardless of the `channel` requested
      // (there is no WhatsApp/voice option on this API) — report that, not the caller's ask.
      return { ref: body.request_id, channel: 'sms' };
    },

    async sendNotification({ phone, template, vars }: NotificationMessage) {
      const authKey = env.MSG91_AUTH_KEY!.trim();
      const templateEnvVar = TEMPLATE_ENV_VARS[template];
      const templateId = env[templateEnvVar]?.trim();

      if (!templateId) {
        throw new MessageDeliveryError(
          'msg91',
          `no DLT template configured for "${template}" — set ${templateEnvVar}.`
        );
      }

      const mobile = phone.replace(/\D/g, '');

      let res: Response;
      try {
        res = await fetchImpl(MSG91_FLOW_URL, {
          method: 'POST',
          headers: { authkey: authKey, 'Content-Type': 'application/json' },
          // Flow takes the variables per recipient, so one call can fan out later if needed.
          body: JSON.stringify({
            template_id: templateId,
            recipients: [{ mobiles: mobile, ...vars }],
          }),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
      } catch (err) {
        throw new MessageDeliveryError(
          'msg91',
          `network error contacting MSG91 Flow: ${(err as Error).message}`,
          { cause: err }
        );
      }

      const bodyText = await res.text().catch(() => '');

      if (!res.ok) {
        throw new MessageDeliveryError('msg91', `MSG91 Flow returned HTTP ${res.status}: ${bodyText.slice(0, MAX_QUOTED_BODY)}`);
      }

      let body: { type?: string; message?: string; request_id?: string };
      try {
        body = JSON.parse(bodyText);
      } catch {
        throw new MessageDeliveryError('msg91', `MSG91 Flow returned a non-JSON body: ${bodyText.slice(0, MAX_QUOTED_BODY)}`);
      }

      // Same trap as the OTP endpoint: application-level failures arrive as HTTP 200 with
      // type:"error", so a 2xx alone must not be read as delivery.
      if (body?.type !== 'success') {
        throw new MessageDeliveryError(
          'msg91',
          `MSG91 Flow rejected the request: ${body?.message ?? bodyText.slice(0, MAX_QUOTED_BODY)}`
        );
      }

      return { ref: body.request_id, channel: 'sms' };
    },
  };
}
