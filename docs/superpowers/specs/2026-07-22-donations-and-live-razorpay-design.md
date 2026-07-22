# Donations & Live Razorpay (Test Mode) — Design

> Date: 2026-07-22
> Status: Approved for planning
> Scope: Add a user-chosen-amount donation flow reachable from the header, and switch every payment flow from the mock gateway to real Razorpay test-mode checkout.

---

## 1. Goal

Two related changes:

1. **Donations.** A "Donate for good" entry point in the header lets a logged-in user give any amount they choose. It grants nothing — no access, no expiry, no listing. It is a gift.
2. **Real gateway everywhere.** `MOCK_PAYMENTS=false` locally, with Razorpay test credentials, so all four flows — `provider_registration` (₹99), `booking_commission` (₹1), `platform_support` (₹12) and the new `donation` (variable) — run through the real Razorpay checkout rather than the simulated modal.

## 2. Confirmed decisions

| Question | Decision |
|---|---|
| Who can donate | **Logged-in users only.** `payments.userId` stays `NOT NULL`; no migration. Logged-out visitors are sent to `/login?next=/donate`. |
| Entry point | **Header only.** A heart button beside the language switcher. `BottomNav` keeps its `grid-cols-5`. |
| Amount bounds | **₹10 minimum, ₹1,00,000 maximum** (1000–10000000 paise), enforced server-side. |
| What a donation grants | **Nothing.** No expiry, no access, no entitlement of any kind. |
| Gateway | **Real Razorpay test mode for every flow.** |

## 3. The amount problem

This is the only architecturally interesting part of the feature.

Today `POST /payments/order` contains:

```typescript
const amount = AMOUNTS[flow];
```

That one line is the reason nobody has to wonder whether a client can name its own price. A donation has no fixed price, so something has to change — but bolting `if (flow === 'donation') amount = req.body.amount` into that function erodes the very invariant the line exists to advertise.

Instead, one function owns the decision:

```typescript
resolveAmount(flow: string, body: any): { amount: number } | { error: { status: number; detail: string } }
```

- **Fixed flows** return `AMOUNTS[flow]` and ignore the request body entirely.
- **`donation`** is the *only* branch that reads `body.amount`. It must be an integer within `[DONATION_MIN_PAISE, DONATION_MAX_PAISE]`; anything else is a `400`.

Exactly one place decides an amount, the donation path is visible and independently testable, and the client-named-price capability cannot silently spread to another flow later.

### Validation rules for `donation`

Rejected with `400` when the submitted amount is:

- absent, `null`, or not a number
- not an integer (paise are indivisible; `1050.5` is meaningless)
- `NaN` or `Infinity`
- below `1000` paise (₹10) or above `10000000` paise (₹1,00,000)

The value is read from the body **once**, in `resolveAmount`, and the validated integer is what gets stored on the `payments` row and sent to Razorpay. The raw body value is never used again.

## 4. Ownership and settlement

`reference_id` for `donation` is the payer's own user id — the same rule as `platform_support`, enforced in `assertOwnsReference`, `403` otherwise. There is no other entity a donation could belong to.

**Settlement grants nothing.** `handlePaymentSuccess`'s `donation` branch performs no writes beyond the `payments` row that `settlePaymentOnce` already updated. It returns `{ amount }` so the thank-you screen can name the figure.

This is a deliberate property worth stating plainly: **no amount of donating gets anyone past the ₹12 support gate, or activates a provider, or confirms a booking.** A donation touches no entitlement, so it cannot accidentally confer one.

## 5. Gate interaction

- `/donate` is added to `SupportGate`'s `ALWAYS_ALLOWED`.
- `requireActiveSupport` is **not** applied to any donation route.

Putting donations behind the support paywall would be self-defeating: it would tell someone trying to give money that they must first pay ₹12 for the privilege.

## 6. Switching to real Razorpay

### Configuration

`backend/.env` (git-ignored, never committed):

```
MOCK_PAYMENTS=false
RAZORPAY_KEY_ID=rzp_test_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...
```

`config.ts` already refuses to start with `MOCK_PAYMENTS=false` and any of the three missing, so a partial setup fails loudly at boot rather than at the first payment.

### What changes behaviourally

`POST /payments/order` stops returning `mock: true`, so every frontend caller takes its `payWithRazorpay` branch instead of opening `MockPaymentModal`. That branch already exists and is used by `useBookingFlow`, `ProviderOnboard`, `Support` and (new) `Donate` — no frontend change is required for the switch itself.

`POST /payments/mock/complete` returns `400 Mock payments disabled`, which is correct and already tested.

### The webhook caveat

Razorpay delivers webhooks to a public URL. It cannot reach `localhost`, so during local testing the authoritative settlement path is **not** exercised by real Razorpay traffic. Local verification therefore relies on:

1. the browser callback into `POST /payments/verify` (real signature, real payment id), and
2. a locally-generated, correctly-signed `POST /payments/webhook` request that proves the handler's own logic.

This is a gap in *environment*, not in code — the webhook handler is unchanged and already covered by `webhook.test.ts`. Exercising it against genuine Razorpay delivery requires a public tunnel or a deployed environment, and is called out in §9 as work that remains.

### The test suite is unaffected

`backend/vitest.config.ts` sets `MOCK_PAYMENTS: 'true'` in its own env block, so the suite continues to exercise the mock path regardless of what `.env` says. Tests stay hermetic and require no Razorpay credentials.

## 7. Backend changes

| File | Change |
|---|---|
| `backend/src/config.ts` | `DONATION_MIN_PAISE = 1000`, `DONATION_MAX_PAISE = 10000000` |
| `backend/src/lib/payments.ts` *(new)* | `resolveAmount(flow, body)` — pure, no DB, no Express |
| `backend/src/routes/payments.ts` | use `resolveAmount`; `donation` branches in `assertOwnsReference` and `handlePaymentSuccess`; OpenAPI enums and the `amount` request property |
| `backend/test/donations.test.ts` *(new)* | flow + validation coverage |
| `backend/test/payments.test.ts` | unchanged; existing flows must keep passing |

`donation` is deliberately **absent** from the `AMOUNTS` map — its presence there would imply a fixed price. `resolveAmount` recognises it explicitly.

## 8. Frontend changes

| File | Change |
|---|---|
| `frontend/src/pages/Donate.tsx` *(new)* | preset chips ₹100 / ₹250 / ₹500 / ₹1000 + custom amount; mirrors `Support.tsx`'s payment flow |
| `frontend/src/components/Header.tsx` | heart button beside the language switcher, linking to `/donate` |
| `frontend/src/components/SupportGate.tsx` | `/donate` added to `ALWAYS_ALLOWED` |
| `frontend/src/App.tsx` | `/donate` route |
| `frontend/src/lib/api.ts` | `createPaymentOrder` gains an optional `amount` |
| `frontend/src/locales/{en,hi,bn,ne}.json` | `donate.*` block |

Client-side amount validation mirrors the server's bounds for immediate feedback, but the server's check is authoritative — the client's is a courtesy, not a control.

Logged-out visitors clicking Donate go to `/login?next=%2Fdonate`, reusing the existing `next` parameter that `Login.tsx` already honours.

## 9. Verification

### Automated
- `resolveAmount` unit tests: every rejection case in §3, plus both boundaries accepted (exactly ₹10 and exactly ₹1,00,000) and both just-outside values rejected.
- Integration: donation order creation, foreign `reference_id` → 403, settlement grants no expiry, existing flows unaffected.
- Full backend suite must stay green.

### Against real Razorpay test mode
- Create an order for each of the four flows through the live test API, proving the credentials and the request shape.
- Verify the signature path using an HMAC computed locally with the real key secret, exactly as Razorpay computes it.
- Drive `POST /payments/webhook` with a correctly signed payload.

### What cannot be verified in this environment
- **Completing a card payment.** Razorpay's checkout is a browser modal; there is no browser automation here. The order → checkout → callback round trip needs a human.
- **Genuine Razorpay webhook delivery.** Requires a public URL (see §6).

Both are listed so nobody mistakes "the suite is green" for "money has moved".

## 10. Out of scope

- Anonymous/logged-out donations (would need a nullable `payments.user_id`)
- Recurring donations, mandates, or any auto-charge
- Donation receipts, 80G certificates, or tax documentation
- A public donor list or leaderboard
- Refunds
- Changing the ₹99, ₹1, or ₹12 amounts
- Moving production off mock payments — this design covers local test-mode setup only
