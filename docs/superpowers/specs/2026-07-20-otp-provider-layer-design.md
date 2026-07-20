# OTP Provider Layer — Design

**Date:** 2026-07-20
**Status:** Approved, pending implementation

## Problem

`POST /auth/otp/send` has no delivery mechanism in production. The handler generates a
code, stores it, and returns `{ sent: true }` — but no SMS/WhatsApp provider exists
anywhere in the codebase. Outside production a mock branch returns the code in the
response body; inside production that branch is skipped and nothing is sent.

The consequences:

1. **Production login is impossible.** A user requests a code, receives nothing, and
   `/auth/otp/verify` requires an exact DB match (the `123456` universal code is gated on
   `!IS_PROD`).
2. **It fails silently.** Unlike `MOCK_PAYMENTS`, which refuses to boot when
   half-configured, the OTP stub reports success. The app starts cleanly, the UI advances
   to the code-entry screen, and every user hits a dead end with no server-side signal.

Two secondary gaps in the same code path, harmless while codes are mock-only but real
once codes travel over SMS:

3. **OTPs never expire.** `otps.created_at` is written but never read by `/otp/verify`, so
   a code stays valid indefinitely until replaced by a newer one for that phone.
4. **No per-code attempt cap.** Only the 10/min route rate limit applies, allowing roughly
   50 guesses per window against a 6-digit code.

## Goals

- Real OTP delivery becomes a **config change, not a code change** — mirroring the
  existing `MOCK_PAYMENTS` switch.
- The provider is **not assumed to be MSG91**. Swapping to Twilio, Gupshup, or anything
  else must be a small, contained, testable addition.
- A half-configured provider **fails at boot**, not in front of a user.
- The route can never again report `sent: true` for an undelivered code.

## Non-goals

- Email OTP, voice OTP, or multi-provider failover. One selected provider at a time.
- Replacing the existing per-IP rate limiter.
- Any change to payments, which already has the target shape.

## Architecture

```
backend/src/otp/
  types.ts              OtpProvider interface, OtpDeliveryError
  registry.ts           name → provider map, selection, boot validation
  index.ts              sendOtp() — the only export routes import
  providers/
    mock.ts             logs the code and returns it (current dev behaviour)
    msg91.ts            real HTTP delivery
```

`routes/auth.ts` imports `sendOtp` only. It has no knowledge of which provider is
active, and gains no provider-specific branching.

### Interface

```ts
export interface OtpProvider {
  readonly name: string;

  /** Validates this provider's required env vars. Runs at boot for the selected
   *  provider only. Throws to prevent startup when configuration is incomplete. */
  init(): void;

  /** Resolves only on confirmed handoff to the provider.
   *  Throws OtpDeliveryError on any failure. */
  send(p: { phone: string; otp: string; channel: string }): Promise<{ ref?: string }>;
}
```

Adding a provider is one file implementing this interface plus one entry in the registry
map. Per-provider adapters (rather than a single config-templated HTTP sender) are the
deliberate choice: authentication schemes, request encodings, and error-reporting
conventions differ substantially between providers — MSG91 returns HTTP 200 with an error
`type` in the body, which a generic templated sender would read as success. Encoding those
quirks in typed, tested code is both safer and faster to extend than encoding them as
string templates in `.env`.

## Configuration

Added to `backend/src/config.ts`:

| Variable | Default | Notes |
|---|---|---|
| `OTP_PROVIDER` | `mock` | `mock` \| `msg91` |
| `OTP_TTL_SECONDS` | `300` | verification window |
| `OTP_MAX_ATTEMPTS` | `5` | wrong guesses per issued code |
| `MSG91_AUTH_KEY` | — | required when `OTP_PROVIDER=msg91` |
| `MSG91_TEMPLATE_ID` | — | required when `OTP_PROVIDER=msg91` |
| `MSG91_SENDER_ID` | — | required when `OTP_PROVIDER=msg91` |

Boot behaviour, matching the payments precedent:

- The selected provider's `init()` runs at startup. `OTP_PROVIDER=msg91` with any required
  variable missing throws and prevents boot.
- An unknown `OTP_PROVIDER` value throws, listing the registered names.
- `OTP_PROVIDER=mock` under `APP_ENV=production` emits the same loud `log.error` that
  `MOCK_PAYMENTS=true` already does.
- `OTP_TTL_SECONDS` and `OTP_MAX_ATTEMPTS` must parse as positive integers.

## Data flow

### `POST /auth/otp/send`

1. Validate phone is present.
2. Generate a 6-digit code.
3. Upsert into `otps`, resetting `attempts` to 0.
4. `await sendOtp(...)`.
   - Success → `{ sent: true, channel, exists }`; the mock provider additionally includes
     `mock_otp` and the existing hint.
   - `OtpDeliveryError` → **502** `{ detail: 'Could not send OTP, please try again' }`.
     The provider's raw error is logged server-side via `log.error` and never returned to
     the caller. The stored row is left in place; the next send overwrites it.

The route cannot report `sent: true` unless the provider confirmed handoff. This closes
the silent-success defect structurally rather than by convention.

### `POST /auth/otp/verify`

Evaluated in this order, before the existing user lookup:

1. **Universal-code bypass first.** When the mock provider is selected and the submitted
   code is `123456`, skip checks 2–5 entirely and proceed to login. This must precede the
   stored-row checks, because the universal code is required to work when no row exists
   at all (matching today's behaviour, where `universalOk` short-circuits the
   `!otpRec` test).
2. No stored row → 400 `Invalid OTP` (unchanged).
3. `attempts >= OTP_MAX_ATTEMPTS` → **429** `Too many incorrect attempts. Request a new OTP.`
4. `now - created_at > OTP_TTL_SECONDS` → **400** `OTP expired. Request a new one.`
5. Code mismatch → increment `attempts`, 400 `Invalid OTP`.
6. Match → delete the row, proceed to existing login/registration logic unchanged.

Checks 3 and 4 are ordered attempts-before-expiry deliberately: a caller who has burned
the attempt cap should be told to request a new code regardless of whether the old one has
also aged out, and the 429 is the more actionable message.

The universal `123456` bypass moves from `!IS_PROD` to "the mock provider is selected", so
it tracks the delivery mechanism rather than the environment. This is what allows a
production-configured staging deployment to remain usable.

**Accepted risk, explicitly:** with `OTP_PROVIDER=mock` on a publicly reachable
deployment, any caller can log in as any phone number. This is inherent to staging with
mocked authentication and is not introduced by this design — the current `mock_otp`
response field has the same property. It is acceptable pre-launch provided no real user
data is present. Setting `OTP_PROVIDER=msg91` closes it.

## Schema change

One column on `otps`:

```
attempts integer not null default 0
```

Generated via `npm run db:generate` and committed as SQL, so CI's schema-drift check and
the migration-based test database both stay green.

## Error handling

- `OtpDeliveryError` carries a provider-facing diagnostic message for logs; the HTTP layer
  substitutes a generic message for clients.
- Adapters classify failures explicitly: non-2xx, provider-level error bodies returned
  under HTTP 200, malformed responses, and network/timeout throws all raise
  `OtpDeliveryError`.
- The MSG91 adapter applies a 10-second request timeout so a hung provider cannot hold the
  Express handler open indefinitely.
- No provider response body is ever forwarded to the client.

## Testing

New tests:

- **msg91 adapter** against a stubbed fetch: success; provider error body under HTTP 200;
  non-2xx; network throw; timeout. Asserts the auth key never appears in thrown messages.
- **registry**: selects the configured provider; unknown name throws at boot; missing
  credentials for the selected provider throw at boot; a *non*-selected provider's missing
  credentials do not.
- **`/otp/send`**: returns 502 and does not claim `sent: true` when the provider throws.
- **`/otp/verify`**: expired code rejected; attempt cap returns 429; wrong guess
  increments `attempts`; successful verify clears the row; the universal code still works
  with no stored row while the mock provider is selected.

All 80 existing backend tests must remain green.

## Rollout

Staging today: `OTP_PROVIDER=mock`, `MOCK_PAYMENTS=true`.

Going live is two independent config flips, each safe to do alone:

- `OTP_PROVIDER=msg91` + the three `MSG91_*` variables.
- `MOCK_PAYMENTS=false` + the three `RAZORPAY_*` variables.

Either flip with incomplete configuration fails at boot rather than at runtime.

## Follow-ups (out of scope)

- `README.md`'s "Known issues" section still cites the production rate limiter and
  `drizzle-kit push --force` as open; both were fixed in INVESTIGATION §5.A and §5.B.
- Python-era stubs remain: `tests/__init__.py`, `test_reports/pytest/`,
  `test_reports/iteration_1.json` (INVESTIGATION §2.4).
- No frontend tests exist in any of the three packages.
