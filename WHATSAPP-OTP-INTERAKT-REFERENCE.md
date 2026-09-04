# WhatsApp OTP with Interakt — implementation reference

This is the reusable reference implementation for passwordless WhatsApp sign-in.
It uses Interakt's Template Send API for a Meta-approved **Authentication**
template, stores no usable OTP in the database, and keeps the application
session in an httpOnly cookie.

## Customer behaviour

There is one primary flow, not separate sign-up and sign-in flows.

1. Customer enters an Indian WhatsApp number.
2. The application sends a six-digit OTP using Interakt.
3. Customer enters the OTP.
4. If the number is already verified, the customer is signed in.
5. If it is new, an account is created, the number is marked verified, and the
   customer is signed in.

Email/password can remain as an optional fallback for legacy accounts, but it
must not be presented as required for the WhatsApp journey.

## Required Interakt setup

1. Use an Interakt plan with public Template APIs and webhooks (Growth or
   higher).
2. Create a Meta **Authentication** template and sync it in Interakt.
3. Record its Interakt code name; for Elegant Sip this is `elegant_sip_otp`.
4. Generate an API key in Interakt Developer Settings.
5. Configure an HTTPS webhook with a newly generated shared secret.
6. Subscribe only to API-template delivery events: sent, delivered, read, and
   failed.

Never commit or paste the API key or webhook secret into source code, example
files, logs, tickets, or chat.

## Environment contract

Set these only in the deployment environment's secret `.env` file:

```env
AUTH_OTP_PROVIDER=interakt
INTERAKT_API_KEY=replace-with-secret
INTERAKT_API_BASE_URL=https://api.interakt.ai/v1/public
INTERAKT_OTP_TEMPLATE=elegant_sip_otp
INTERAKT_OTP_TEMPLATE_LANGUAGE=en
INTERAKT_WEBHOOK_SECRET=replace-with-different-secret
```

Use `AUTH_OTP_PROVIDER=disabled` until the account, template, key, and webhook
are ready. A disabled provider must fail clearly; it must never silently send
through a development or fake provider in production.

## API request to Interakt

Endpoint:

```text
POST https://api.interakt.ai/v1/public/message/
Authorization: Basic <INTERAKT_API_KEY>
Content-Type: application/json
```

Authentication templates require the same authentication code in both the body
and button values. The authentication code must be 15 characters or fewer.

```json
{
  "countryCode": "+91",
  "phoneNumber": "9876543210",
  "type": "Template",
  "callbackData": "otp:<opaque-challenge-id>",
  "template": {
    "name": "your_authentication_template",
    "languageCode": "en",
    "bodyValues": ["123456"],
    "buttonValues": { "0": ["123456"] }
  }
}
```

`phoneNumber` excludes the country code and leading zero. `callbackData` must
only contain an opaque internal identifier, never the OTP or customer data.

## Application API contract

Suggested public endpoints:

| Endpoint | Purpose |
| --- | --- |
| `POST /v1/auth/whatsapp/request` | Normalise phone number, create challenge, send OTP. |
| `POST /v1/auth/whatsapp/verify` | Consume OTP; sign in existing user or create/sign in new user. |
| `POST /v1/webhooks/interakt` | Verify Interakt HMAC and record delivery status. |

Optional signed-in account endpoints:

| Endpoint | Purpose |
| --- | --- |
| `POST /v1/account/whatsapp/request` | Link a new number to an existing account. |
| `POST /v1/account/whatsapp/verify` | Verify and complete that link. |

The frontend should show one WhatsApp-first screen:

```text
Phone number → Send WhatsApp code → 6-digit code → Account session
```

Do not show a "number is not linked" error for the public flow. A verified new
number should create an account; a verified existing number should sign in.

## Data model and security rules

Store these fields:

- `users.phone`: normalised E.164 number, unique.
- `users.phone_verified_at`: verification timestamp.
- `otp_challenges`: UUID, optional user ID, phone, purpose, Argon2 code hash,
  attempt count, expiry, consumed timestamp, created timestamp.

Apply these rules in every implementation:

- Normalise and validate the phone before any lookup. For India, accept a
  10-digit mobile number or `+91` form and store it as `+91XXXXXXXXXX`.
- Generate six digits with a cryptographically secure random generator.
- Argon2-hash the OTP; never store, log, return, or include it in analytics.
- Expire in 10 minutes or less; consume once.
- Allow no more than five verification attempts per challenge.
- Rate limit OTP requests by source/IP and phone number; recommended baseline:
  five sends and ten verifies per ten minutes.
- Use an opaque server-side session in an httpOnly, Secure cookie; do not put
  access tokens in localStorage.
- Avoid account enumeration in public responses. The same request response can
  represent a new-account or existing-account OTP challenge.
- Use a database unique constraint on phone and handle concurrent account
  creation safely.

## Webhook verification

Interakt sends an `Interakt-Signature` header in the format:

```text
sha256=<hex-hmac-of-raw-request-body>
```

Calculate HMAC-SHA256 with `INTERAKT_WEBHOOK_SECRET` over the **raw JSON body**,
use constant-time comparison, reject mismatches, and respond within three
seconds. Record events idempotently. For API template delivery, handle:

```text
message_api_sent
message_api_delivered
message_api_read
message_api_failed
```

The webhook URL must be public HTTPS, for example:

```text
https://your-domain.example/api/v1/webhooks/interakt
```

## Deployment on a shared VPS

Keep the application behind the existing host Nginx/Caddy rather than binding
another project to public ports 80/443. Publish only a project-specific
loopback port, then change only that domain's proxy upstream.

Before enabling the provider:

```bash
docker compose -f docker-compose.prod.yml up -d --build --force-recreate api web
docker compose -f docker-compose.prod.yml logs --tail 100 api
curl -fsS https://your-domain.example/api/health
```

Do not use a broad `docker compose down` or alter the shared proxy's global
configuration on a multi-project server.

## End-to-end acceptance checklist

- [ ] A new WhatsApp number receives an OTP and creates one account.
- [ ] The same number signs into that same account on a later attempt.
- [ ] Wrong OTP is rejected; the session is not created.
- [ ] Expired OTP is rejected; the session is not created.
- [ ] Sixth wrong attempt is rejected.
- [ ] Resend/request limits work.
- [ ] Interakt webhook signature mismatch returns 401.
- [ ] Valid sent/delivered/read/failed events are recorded once.
- [ ] API key, webhook secret, OTP, and phone number do not appear in logs.
- [ ] Existing email/password customers can link a number without account
  merging or replacing another customer's number.

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `otp_unavailable` | Provider disabled or API key absent from runtime. | Set `AUTH_OTP_PROVIDER=interakt`, add key in deployment `.env`, recreate API. |
| `otp_delivery_failed` | Invalid key, unsynced/wrong template, wrong language, or missing button value. | Confirm template code name/language, sync template, and send code in both `bodyValues` and `buttonValues["0"]`. |
| Webhook has 401 | Shared secret differs or raw body was parsed before signing check. | Use raw body and the exact Interakt webhook secret. |
| New user cannot sign in again | Phone was not committed as unique and verified. | Persist normalised E.164 phone plus `phone_verified_at` atomically. |

## Primary references

- [Interakt authentication templates](https://www.interakt.shop/resource-center/send-whatsapp-authentication-template/)
- [Interakt template send API](https://www.interakt.shop/resource-center/how-to-send-whatsapp-templates-using-apis-webhooks/)
- [Interakt webhook signing and event formats](https://www.interakt.shop/resource-center/interakts-webhooks-for-customer-messages-sent-template-status/)
