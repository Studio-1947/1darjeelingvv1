import {
  MessagingProvider,
  MessageDeliveryError,
  NotificationMessage,
  NotificationTemplate,
  OtpMessage,
} from '../types';
import { requireCredentials, requireNotificationTemplates } from '../providerConfig';

/**
 * WhatsApp Cloud API, talking to Meta directly — no SMS aggregator in between.
 *
 * Why this exists alongside msg91.ts: an SMS to an Indian number must go through a DLT-registered
 * sender, and that registration is a queue measured in weeks. WhatsApp is OTT rather than SMS, so
 * DLT does not apply to it at all. Meta's Cloud API also lets an unverified business send to 250
 * unique recipients per rolling 24 hours, which is well above this app's volume — so there is no
 * business-verification queue to clear before launch either.
 *
 * The msg91 adapter is deliberately left in the tree, dormant. The day this app outgrows the 250
 * cap, or meets a user with no WhatsApp on their number, SMS is one MESSAGING_PROVIDER away —
 * with DLT done then rather than now.
 *
 * WHAT THIS DOES NOT DO. There is no fallback from here to SMS. A recipient without WhatsApp on
 * that number cannot receive a code and therefore cannot log in, and that is a real, accepted
 * limitation of choosing this provider rather than a bug to be worked around inside it. Making
 * one provider silently become another would hide exactly the failure an operator needs to see.
 */

/** Meta's Graph API version. Pinned rather than floating: Meta ships breaking changes per version. */
const DEFAULT_API_VERSION = 'v21.0';

const GRAPH_HOST = 'https://graph.facebook.com';

/**
 * One approved template per message this app sends, same as the DLT arrangement it replaces.
 * Meta approves these itself — usually in minutes for AUTHENTICATION, longer for UTILITY — but
 * it is still an approval, so an unconfigured template is a hard failure rather than a silent
 * skip. "Notified" must never be recorded for a message nobody sent.
 */
const TEMPLATE_ENV_VARS: Record<NotificationTemplate, string> = {
  booking_confirmed_guest: 'WHATSAPP_BOOKING_CONFIRMED_GUEST_TEMPLATE',
  booking_confirmed_host: 'WHATSAPP_BOOKING_CONFIRMED_HOST_TEMPLATE',
  booking_cancelled_guest: 'WHATSAPP_BOOKING_CANCELLED_GUEST_TEMPLATE',
};

// A hung provider must not hold an Express handler open indefinitely.
const REQUEST_TIMEOUT_MS = 10_000;

const MAX_QUOTED_BODY = 200;

/** Meta wants a bare international number — "919999999999", no plus, no spaces. */
function toWhatsAppNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

interface GraphError {
  error?: { message?: string; type?: string; code?: number; error_subcode?: number };
}

interface GraphSendResponse extends GraphError {
  messages?: Array<{ id?: string }>;
}

/**
 * WhatsApp Cloud API.
 *
 * `fetchImpl` is injectable purely so the suite can exercise every failure branch without a
 * network — the same reason the msg91 adapter takes one. Application code always gets the
 * global fetch.
 */
export function createWhatsAppProvider(
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch = fetch
): MessagingProvider {
  const apiVersion = env.WHATSAPP_API_VERSION?.trim() || DEFAULT_API_VERSION;

  /** POSTs to the messages endpoint and returns the message id, or throws with the reason. */
  async function postMessage(payload: unknown, what: string): Promise<string | undefined> {
    const token = env.WHATSAPP_ACCESS_TOKEN!.trim();
    const phoneNumberId = env.WHATSAPP_PHONE_NUMBER_ID!.trim();
    const url = `${GRAPH_HOST}/${apiVersion}/${encodeURIComponent(phoneNumberId)}/messages`;

    let res: Response;
    try {
      res = await fetchImpl(url, {
        method: 'POST',
        headers: {
          // Bearer header, never a query parameter: a token in a URL ends up in access logs and
          // in any error that quotes the request.
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (err) {
      throw new MessageDeliveryError(
        'whatsapp',
        `network error contacting the WhatsApp Cloud API (${what}): ${(err as Error).message}`,
        { cause: err }
      );
    }

    const bodyText = await res.text().catch(() => '');

    let body: GraphSendResponse;
    try {
      body = JSON.parse(bodyText);
    } catch {
      // A non-JSON body from Graph means something other than the API answered — a proxy, a
      // captive portal, an outage page. Worth saying so rather than reporting a parse error.
      throw new MessageDeliveryError(
        'whatsapp',
        `WhatsApp Cloud API returned a non-JSON body (${what}): ${bodyText.slice(0, MAX_QUOTED_BODY)}`
      );
    }

    if (!res.ok || body.error) {
      const e = body.error;
      // Graph's own message is the only useful diagnostic here — "(#132001) Template name does
      // not exist in the translation" is the difference between a five-minute fix and an hour.
      // It stays server-side; the route never returns it to a client.
      const detail = e?.message ?? bodyText.slice(0, MAX_QUOTED_BODY);
      const code = e?.code != null ? ` [code ${e.code}${e.error_subcode ? `/${e.error_subcode}` : ''}]` : '';
      throw new MessageDeliveryError(
        'whatsapp',
        `WhatsApp Cloud API rejected the request (${what}), HTTP ${res.status}${code}: ${detail}`
      );
    }

    const id = body.messages?.[0]?.id;
    if (!id) {
      // Graph answering 200 with no message id is not a delivery we can vouch for, and this
      // layer exists so that "sent" is never recorded for something unconfirmed.
      throw new MessageDeliveryError(
        'whatsapp',
        `WhatsApp Cloud API returned 200 with no message id (${what}): ${bodyText.slice(0, MAX_QUOTED_BODY)}`
      );
    }
    return id;
  }

  return {
    name: 'whatsapp',

    init() {
      requireCredentials('whatsapp', env, ['WHATSAPP_ACCESS_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID', 'WHATSAPP_OTP_TEMPLATE']);

      // The token most people copy out of the Meta dashboard first is the temporary one, and it
      // dies after roughly 24 hours — which presents later as "login stopped working overnight"
      // with nothing in the app having changed. A System User token has no expiry and is what
      // this is meant to run on. The prefix check is a nudge, not a guarantee, so it warns
      // rather than throws: a valid token that happens not to match must still boot.
      const token = env.WHATSAPP_ACCESS_TOKEN!.trim();
      if (token.startsWith('EAA') && token.length < 100) {
        // eslint-disable-next-line no-console
        console.warn(
          '[messaging] WHATSAPP_ACCESS_TOKEN looks like a short-lived dashboard token. Those ' +
          'expire in about 24 hours. Generate a System User token instead — see docs/WHATSAPP_SETUP.md.'
        );
      }
      requireNotificationTemplates('whatsapp', env, TEMPLATE_ENV_VARS, 'Create them in WhatsApp Manager and set these');
    },

    async sendOtp({ phone, otp }: OtpMessage) {
      const templateName = env.WHATSAPP_OTP_TEMPLATE!.trim();
      const language = env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || 'en';

      // THE CODE APPEARS TWICE, AND BOTH ARE REQUIRED.
      //
      // An authentication template's body carries the code, and its OTP button carries the code
      // again — the button is what fills the clipboard when the recipient taps "Copy code". Meta
      // rejects the send outright if the button component is missing, which reads as a template
      // error and sends you looking in the wrong place. The button is addressed positionally:
      // sub_type "url" and index 0, which is what an OTP button is at the API level whether it
      // was created as COPY_CODE or ONE_TAP.
      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toWhatsAppNumber(phone),
        type: 'template',
        template: {
          name: templateName,
          language: { code: language },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: otp }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: otp }] },
          ],
        },
      };

      const ref = await postMessage(payload, 'otp');
      return { ref, channel: 'whatsapp' };
    },

    async sendNotification({ phone, template, vars }: NotificationMessage) {
      const templateEnvVar = TEMPLATE_ENV_VARS[template];
      const templateName = env[templateEnvVar]?.trim();
      const language = env.WHATSAPP_TEMPLATE_LANGUAGE?.trim() || 'en';

      if (!templateName) {
        throw new MessageDeliveryError(
          'whatsapp',
          `no WhatsApp template configured for "${template}" — set ${templateEnvVar}.`
        );
      }

      // Meta fills {{1}}, {{2}}, ... strictly by position, and `vars` is an object whose key
      // ORDER is the contract the callers in lib/notifications.ts already write to (the same
      // order the DLT templates declare). Object.values preserves insertion order for string
      // keys, so that contract carries over unchanged — but it does mean a template whose
      // placeholders are in a different order than the caller's object will send correct-looking
      // nonsense, so the template body must be written to match the caller, not the other way.
      const parameters = Object.values(vars).map((value) => ({ type: 'text', text: value }));

      const payload = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: toWhatsAppNumber(phone),
        type: 'template',
        template: {
          name: templateName,
          language: { code: language },
          // A template with no placeholders must not carry an empty body component — Graph
          // rejects that rather than ignoring it.
          components: parameters.length > 0 ? [{ type: 'body', parameters }] : [],
        },
      };

      const ref = await postMessage(payload, `notification:${template}`);
      return { ref, channel: 'whatsapp' };
    },
  };
}
