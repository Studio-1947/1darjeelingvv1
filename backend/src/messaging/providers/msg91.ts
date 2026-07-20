import { MessagingProvider, OtpMessage, MessageDeliveryError } from '../types';

const MSG91_OTP_URL = 'https://control.msg91.com/api/v5/otp';

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

      return { ref: body.request_id };
    },
  };
}
