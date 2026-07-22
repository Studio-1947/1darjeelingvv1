# Tourist Platform Support Fee — Design

> Date: 2026-07-22
> Status: Approved for planning
> Scope: Gate the logged-in tourist experience behind a ₹12/year platform support & convenience fee. Adds one payment flow, one user column, one middleware, one screen. Provider onboarding, the ₹99 registration fee, and the ₹1 booking commission are unchanged.

---

## 1. Goal

Every tourist who logs in must pay **₹12 for the year** before reaching any logged-in surface. The money is framed to the user not as a membership or a subscription, but as a **platform support & convenience fee** covering maintenance, hosting and build costs — a token amount that keeps listings free for the small homestays, drivers and cafés on the platform.

Logged-out browsing stays completely free. The Discover feed, category grids and listing detail pages remain public to anyone without a session, exactly as today.

## 2. Confirmed decisions

These were settled during brainstorming and are not open for reinterpretation during planning:

| Question | Decision |
|---|---|
| What does the fee gate? | **Hard gate immediately after login.** An unpaid tourist with a session cannot reach the feed, listings, or dashboard. |
| Annual window | **365 days rolling from payment.** No grace period. On expiry the next login hits the same gate. |
| Who is subject | **All tourists, including accounts that existed before launch.** No grandfathering, no backfill. |
| Backend enforcement | **Middleware on tourist write routes.** Public GETs stay open. Not frontend-only. |
| Flow steps | **Paywall screen only.** No profile/interests wizard. |
| Framing | **Platform support & convenience fee**, never "membership" or "subscription". |
| State model | **One nullable column on `users`.** The existing `payments` table remains the ledger. |

## 3. Naming

The word "membership" appears nowhere — not in code, not in UI, not in i18n keys. It implies a club with benefits; this is cost recovery.

| Concept | Name |
|---|---|
| Payment flow | `platform_support` |
| User column | `support_expires_at` / `supportExpiresAt` |
| Middleware | `requireActiveSupport` |
| Route | `/support` |
| Error code | `support_required` |

## 4. Data model

A single nullable column on `users`:

```
supportExpiresAt: text('support_expires_at')   // ISO 8601, nullable
```

- `null` — has never paid.
- Active when `supportExpiresAt > now()`.

`payments` needs **no schema change**. The new flow writes rows with `flow = 'platform_support'`, `referenceId` = the payer's own user id, `amount = 1200`. These appear in the existing admin PaymentsTab automatically.

### Why one column rather than a `memberships` table

The `payments` table already answers "who paid what, when". The only genuinely new fact is "when does access end" — one column. Reads are free because `authenticateToken` already loads the full user row (`backend/src/middleware/auth.ts:89`), so `req.user` and `GET /auth/me` expose it with no extra query and no token format change (no forced logout on deploy).

If admin-granted comp memberships or tiers are ever needed, a `memberships` table can be added later and this column becomes its cache. That is not in scope now.

### Expiry arithmetic

On settlement:

```
newExpiry = max(now, existingExpiry ?? now) + SUPPORT_DURATION_DAYS
```

This does two jobs:

1. **Early renewal is additive.** Paying with 100 days left yields 465 days, not 365 — the user is not punished for renewing early.
2. **It is monotonic.** The expiry can only move forward, so a double-delivered webhook can never shorten someone's access even if `settlePaymentOnce`'s guard were somehow bypassed.

## 5. Who is exempt

Exemption means **"has already paid us"**, not "claims to be a business".

```
exempt = role === 'admin'
      || (role === 'provider' && providerPaid === true)
```

### Why `providerPaid` must be part of the check

`role` flips to `provider` the moment a user submits `/providers/onboard` — *before* the ₹99 is paid. Exempting all providers would therefore let any tourist submit the onboarding form, flip their role, and browse for free. Requiring `providerPaid` closes that.

Unpaid providers are not stranded by this: `Login.tsx` already routes them to `/provider/onboard`, where they pay ₹99 and become exempt. They are gated from tourist surfaces in the meantime, which is correct — they have paid nothing.

## 6. Backend changes

| File | Change |
|---|---|
| `backend/src/config.ts` | `AMOUNTS.platform_support = 1200`; export `SUPPORT_DURATION_DAYS = 365` |
| `backend/src/schema.ts` | add `supportExpiresAt` to `users` |
| `backend/drizzle/` | one migration adding the nullable column; **no backfill** |
| `backend/src/routes/payments.ts` | `assertOwnsReference`: `platform_support` branch requiring `referenceId === userId` |
| `backend/src/routes/payments.ts` | `handlePaymentSuccess`: `platform_support` branch applying the expiry arithmetic |
| `backend/src/middleware/support.ts` *(new)* | `requireActiveSupport` |
| `backend/src/routes/bookings.ts` | apply middleware to booking **create** only |
| `backend/src/routes/favorites.ts` | apply middleware to favorite **create** only |
| `backend/src/routes/reviews.ts` | apply middleware to review **create** only |
| `backend/src/swagger.ts` | document the new flow and the 402 response |

### Withdrawal is not gated

Booking cancel, un-favourite, and review delete stay open to lapsed accounts. The gate exists to
stop unpaid accounts consuming value, not to trap users in commitments or hold their content
hostage — a lapsed user who cannot cancel simply no-shows, which is worse for the provider than
the cancellation would have been.

### `assertOwnsReference` — `platform_support`

`referenceId` must equal the calling user's id, else `403`. This mirrors the existing rule that an order is bound to something the caller owns at creation time, and prevents a user creating a ₹12 order that credits somebody else's account.

### `requireActiveSupport`

Runs after `authenticateToken`. Passes exempt users through. Otherwise, if `supportExpiresAt` is null or in the past:

```
402 { detail: "...", code: "support_required" }
```

`402 Payment Required` is the honest status here and gives the frontend an unambiguous signal distinct from `401` (bad token) and `403` (not yours). The machine-readable `code` is what the client keys on, not the prose.

It is applied to **tourist write routes only**. Public GETs stay open, and — importantly — `GET /auth/me` stays open, because the `/support` screen itself must be able to read the user while unpaid.

### The two layers have different jobs

`SupportGate` is the **product** gate: it is what makes an unpaid tourist unable to reach the feed, listings or dashboard in the app. `requireActiveSupport` is the **value** gate: it makes sure nothing that actually costs the platform something — a booking, a favourite, a review — can be performed by an unpaid account, no matter what client is talking to the API.

This means an unpaid tourist holding a token could still `GET` their (empty) booking list directly from the API. That is accepted deliberately: it exposes nothing that was not already theirs, and blanket-gating every authenticated GET would break the `/support` screen and buy nothing.

## 7. Frontend changes

### `SupportGate`

One component mounted inside `BrowserRouter`, above `<Routes>`. If there is a user, they are not exempt, and their support is inactive, it redirects to `/support`, preserving the intended destination so the user lands where they meant to go after paying. Logged-out visitors are never touched.

Placing the gate here rather than per-route means a new route cannot accidentally ship ungated.

### `/support` screen

Reuses the existing payment plumbing unchanged, exactly as `useBookingFlow` does:

1. `createPaymentOrder({ flow: 'platform_support', reference_id: user.id })`
2. mock order → `MockPaymentModal`; real order → `payWithRazorpay`
3. on success → `refresh()` from `AuthContext` to pick up the new expiry → navigate to the stored destination

### The logout escape is mandatory

A hard gate on a logged-in user with no exit is a trap: they cannot pay, cannot browse, cannot leave. The screen carries a secondary action — **"Not now — browse without an account"** → `logout()` → `/`. Public browsing was always free; this only makes it reachable from behind the gate.

### `402` response interceptor

`frontend/src/lib/api.ts` has only a request interceptor today. Add a response interceptor that redirects to `/support` on `402` with `code === 'support_required'`, covering stale client state where `SupportGate` believes the user is paid but the server disagrees.

### Copy

All strings go through i18n (`frontend/src/locales/`), consistent with the existing language switcher.

> **A small token to keep 1 Darjeeling running**
>
> ₹12 for the year — a one-time platform support & convenience fee that goes toward maintenance, hosting and building costs.
>
> That's ₹1 a month. It keeps the app running for travellers and keeps listings free for the small homestays, drivers and cafés on it.
>
> **[ Pay ₹12 · valid 1 year ]**
>
> Valid for one year. Nothing auto-charges — we'll ask you again next year.

Two constraints on this copy:

- The button states the amount plainly.
- The reassurance is **"nothing auto-charges"**, not "this isn't a subscription". Mechanically this *is* a recurring annual charge; "support fee" is the framing, and it is an accurate one, since the money genuinely covers hosting and maintenance. But the claim we put on screen has to be the one that survives scrutiny. No Razorpay mandate or token is created, so "nothing auto-charges" is verifiably true and addresses the actual fear — a silent debit. If auto-renewal is ever added, this line must be removed in the same change.

## 8. Error handling

| Case | Behaviour |
|---|---|
| Payment abandoned / modal closed | Order stays `created`; user remains on `/support`; can retry. No orphaned state. |
| Razorpay unreachable | Existing `502` path in `POST /payments/order` surfaces as a retryable error on the screen. |
| Webhook arrives, browser callback lost | `settlePaymentOnce` settles it; the user's next `/auth/me` reflects the expiry. |
| Both webhook and verify arrive | Idempotent by `settlePaymentOnce`; expiry arithmetic is monotonic regardless. |
| Client thinks paid, server disagrees | `402` interceptor redirects to `/support`. |
| Expiry passes mid-session | Next gated write returns `402` → redirect. Not force-logged-out. |

## 9. Testing

Following the existing `backend/test/payments.test.ts` patterns.

**Payment flow**
- Order with `reference_id` = another user's id → `403`
- Amount is `1200` regardless of anything in the request body
- Settling stamps expiry ≈ now + 365d
- Renewing with 100 days remaining extends to `existing + 365d`, not `now + 365d`
- Settling the same order twice is a no-op

**Middleware**
- Tourist who has never paid → `402`
- Tourist whose expiry is in the past → `402`
- Tourist with a valid expiry → passes
- Admin → passes
- Provider with `providerPaid = true` → passes
- **Provider with `providerPaid = false` → `402`** (the role-flip loophole)

**Frontend**
- `SupportGate` redirects an unpaid tourist away from `/dashboard` and preserves the destination
- Logged-out visitor reaching `/` is not redirected
- Logout escape from `/support` returns to public browsing

## 10. Explicitly out of scope

- Auto-renewal, Razorpay mandates, or any recurring charge
- Refunds and refund tooling
- Admin-granted or comped support
- A `memberships` table, tiers, or plans
- Backfilling existing tourists with free access
- Any profile/interests/personalisation step
- Changes to the ₹99 provider registration or ₹1 booking commission
- Reminder notifications before expiry
