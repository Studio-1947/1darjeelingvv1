# Tourist Platform Support Fee Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the logged-in tourist experience behind a ₹12/year platform support & convenience fee, enforced both in the router and on the API.

**Architecture:** One new payment flow (`platform_support`) reusing the existing order → settle → side-effect machinery in `backend/src/routes/payments.ts`. One nullable column (`users.support_expires_at`) holding the expiry. Pure decision logic lives in `backend/src/lib/support.ts` (server) and `frontend/src/lib/support.ts` (client) so both sides are unit-testable without HTTP. A `requireActiveSupport` middleware guards tourist creates; a `SupportGate` component guards the router.

**Tech Stack:** Express 5, Drizzle ORM + Postgres, Vitest + Supertest (backend); CRA + React 19 + react-router 7 + i18next, Jest via craco (frontend).

**Spec:** `docs/superpowers/specs/2026-07-22-tourist-platform-support-fee-design.md`

## Global Constraints

- Amount is **1200 paise (₹12)**, set server-side only. Never read an amount from a request body.
- Duration is **365 days**, exported as `SUPPORT_DURATION_DAYS`.
- Expiry arithmetic is **monotonic**: `max(now, existing) + 365d`. Expiry may only move forward.
- Exemption is `role === 'admin' || (role === 'provider' && providerPaid === true)`. **Never `role === 'provider'` alone** — role flips to `provider` before the ₹99 is paid.
- The word **"membership"** must not appear in code, UI copy, or i18n keys. The word **"subscription"** must not appear in UI copy.
- Naming is fixed: flow `platform_support`, column `supportExpiresAt` / `support_expires_at`, middleware `requireActiveSupport`, route `/support`, error code `support_required`.
- The `/support` screen **must** carry a logout escape. A hard gate with no exit is a trap.
- All user-facing strings go through i18next, in **all four** locales: `en`, `hi`, `bn`, `ne`.
- Migrations are generated with `npm run db:generate` — never hand-write a file in `backend/drizzle/`.

## Deviation from the spec (Task 5 amends the spec to match)

The spec's §6 table lists booking **cancel** as a guarded route. This plan guards **creates only** — `POST /bookings`, `POST /favorites`, `POST /reviews` — and leaves cancel, unfavourite, and review-delete open.

Reasoning: the gate exists to stop unpaid accounts consuming value, not to trap users in commitments or hold their content hostage. Blocking cancel on a lapsed account means the user cannot cancel and simply no-shows, which is strictly worse for the provider than letting them cancel. Task 5 updates the spec so the two documents agree.

---

## File Structure

**Backend — create**
- `backend/src/lib/support.ts` — pure predicates and expiry arithmetic. No DB, no Express.
- `backend/src/middleware/support.ts` — `requireActiveSupport`.
- `backend/test/support.test.ts` — unit tests for `lib/support.ts`.
- `backend/test/platformSupport.test.ts` — integration tests for the payment flow and the middleware.

**Backend — modify**
- `backend/src/config.ts` — `SUPPORT_DURATION_DAYS`, `AMOUNTS.platform_support`.
- `backend/src/schema.ts` — `supportExpiresAt` on `users`.
- `backend/src/routes/payments.ts` — ownership branch, settlement branch, OpenAPI enums.
- `backend/src/routes/bookings.ts`, `favorites.ts`, `reviews.ts` — mount middleware on creates.
- `backend/test/helpers.ts` — `activateSupport`, and `registerUser` pays by default.

**Frontend — create**
- `frontend/src/lib/support.ts` — client-side mirror of the predicates.
- `frontend/src/lib/support.test.js` — unit tests for the above.
- `frontend/src/pages/Support.tsx` — the fee screen.
- `frontend/src/components/SupportGate.tsx` — the router gate.

**Frontend — modify**
- `frontend/src/lib/api.ts` — `isSupportRequiredError` + 402 response interceptor.
- `frontend/src/lib/api.test.js` — tests for `isSupportRequiredError`.
- `frontend/src/App.tsx` — `/support` route, `SupportGate` wrapper.
- `frontend/src/locales/{en,hi,bn,ne}.json` — the `support` string block.

---

### Task 1: Pure support logic

The decision rules live here so they can be tested without a database or an HTTP server, and so the middleware and the payment settlement share one definition.

**Files:**
- Create: `backend/src/lib/support.ts`
- Modify: `backend/src/config.ts:175` (after the `AMOUNTS` block)
- Test: `backend/test/support.test.ts`

**Interfaces:**
- Consumes: `SUPPORT_DURATION_DAYS` from `../config`
- Produces:
  - `SUPPORT_DURATION_DAYS: number` (from config)
  - `isExemptFromSupport(user: SupportUser): boolean`
  - `isSupportActive(user: SupportUser, now?: Date): boolean`
  - `computeSupportExpiry(existing: string | null | undefined, now?: Date): string`
  - `interface SupportUser { role: string; providerPaid?: boolean | null; supportExpiresAt?: string | null }`

- [ ] **Step 1: Add the duration constant to config**

Append to `backend/src/config.ts`, directly after the `AMOUNTS` block that ends at line 175:

```typescript
// Tourist platform support & convenience fee window, in days.
// See docs/superpowers/specs/2026-07-22-tourist-platform-support-fee-design.md
export const SUPPORT_DURATION_DAYS = 365;
```

- [ ] **Step 2: Write the failing tests**

Create `backend/test/support.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import {
  isExemptFromSupport,
  isSupportActive,
  computeSupportExpiry,
} from '../src/lib/support';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('isExemptFromSupport', () => {
  it('exempts admins', () => {
    expect(isExemptFromSupport({ role: 'admin' })).toBe(true);
  });

  it('exempts a provider who has paid the registration fee', () => {
    expect(isExemptFromSupport({ role: 'provider', providerPaid: true })).toBe(true);
  });

  it('does NOT exempt a provider who has not paid — role flips before payment', () => {
    expect(isExemptFromSupport({ role: 'provider', providerPaid: false })).toBe(false);
    expect(isExemptFromSupport({ role: 'provider' })).toBe(false);
    expect(isExemptFromSupport({ role: 'provider', providerPaid: null })).toBe(false);
  });

  it('does not exempt tourists', () => {
    expect(isExemptFromSupport({ role: 'tourist', providerPaid: true })).toBe(false);
  });
});

describe('isSupportActive', () => {
  const now = new Date('2026-07-22T00:00:00.000Z');

  it('is false when the user has never paid', () => {
    expect(isSupportActive({ role: 'tourist', supportExpiresAt: null }, now)).toBe(false);
    expect(isSupportActive({ role: 'tourist' }, now)).toBe(false);
  });

  it('is true while the expiry is in the future', () => {
    const future = new Date(now.getTime() + DAY_MS).toISOString();
    expect(isSupportActive({ role: 'tourist', supportExpiresAt: future }, now)).toBe(true);
  });

  it('is false once the expiry has passed', () => {
    const past = new Date(now.getTime() - DAY_MS).toISOString();
    expect(isSupportActive({ role: 'tourist', supportExpiresAt: past }, now)).toBe(false);
  });

  it('treats an unparseable stored value as inactive rather than throwing', () => {
    expect(isSupportActive({ role: 'tourist', supportExpiresAt: 'not-a-date' }, now)).toBe(false);
  });
});

describe('computeSupportExpiry', () => {
  const now = new Date('2026-07-22T00:00:00.000Z');

  it('grants 365 days from now for a first payment', () => {
    const result = computeSupportExpiry(null, now);
    expect(Date.parse(result) - now.getTime()).toBe(365 * DAY_MS);
  });

  it('extends an existing future window instead of restarting it', () => {
    const existing = new Date(now.getTime() + 100 * DAY_MS).toISOString();
    const result = computeSupportExpiry(existing, now);
    expect(Date.parse(result) - now.getTime()).toBe(465 * DAY_MS);
  });

  it('restarts from now when the existing window has already lapsed', () => {
    const existing = new Date(now.getTime() - 30 * DAY_MS).toISOString();
    const result = computeSupportExpiry(existing, now);
    expect(Date.parse(result) - now.getTime()).toBe(365 * DAY_MS);
  });

  it('never moves an expiry backwards', () => {
    const existing = new Date(now.getTime() + 500 * DAY_MS).toISOString();
    const result = computeSupportExpiry(existing, now);
    expect(Date.parse(result)).toBeGreaterThan(Date.parse(existing));
  });

  it('ignores an unparseable existing value and grants a full window', () => {
    const result = computeSupportExpiry('garbage', now);
    expect(Date.parse(result) - now.getTime()).toBe(365 * DAY_MS);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
cd backend && npx vitest run test/support.test.ts
```

Expected: FAIL — `Cannot find module '../src/lib/support'`.

- [ ] **Step 4: Write the implementation**

Create `backend/src/lib/support.ts`:

```typescript
import { SUPPORT_DURATION_DAYS } from '../config';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface SupportUser {
  role: string;
  providerPaid?: boolean | null;
  supportExpiresAt?: string | null;
}

/**
 * Exemption means "has already paid us" — not "claims to be a business".
 *
 * `role` flips to 'provider' the moment /providers/onboard is submitted, which is BEFORE the
 * ₹99 registration fee is paid. Exempting on role alone would therefore let any tourist submit
 * that form, flip their own role, and use the platform for free. `providerPaid` is the fact
 * that actually distinguishes them.
 */
export function isExemptFromSupport(user: SupportUser): boolean {
  if (user.role === 'admin') return true;
  return user.role === 'provider' && user.providerPaid === true;
}

/** A stored value that is absent or unparseable means "not active" — never throw on bad data. */
export function isSupportActive(user: SupportUser, now: Date = new Date()): boolean {
  if (!user.supportExpiresAt) return false;
  const expiry = Date.parse(user.supportExpiresAt);
  if (Number.isNaN(expiry)) return false;
  return expiry > now.getTime();
}

/**
 * Monotonic by construction: the expiry can only move forward.
 *
 * Two consequences that are both deliberate. Renewing early extends the remaining window
 * rather than truncating it, so nobody is punished for paying ahead of time. And a payment
 * settled twice — the webhook and the browser callback race by design — can never shorten
 * someone's access, even if settlePaymentOnce's guard were ever bypassed.
 */
export function computeSupportExpiry(
  existing: string | null | undefined,
  now: Date = new Date()
): string {
  const nowMs = now.getTime();
  const existingMs = existing ? Date.parse(existing) : NaN;
  const base = Number.isNaN(existingMs) || existingMs < nowMs ? nowMs : existingMs;
  return new Date(base + SUPPORT_DURATION_DAYS * DAY_MS).toISOString();
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd backend && npx vitest run test/support.test.ts
```

Expected: PASS — 13 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/support.ts backend/src/config.ts backend/test/support.test.ts
git commit -m "feat(support): add support-fee predicates and expiry arithmetic"
```

---

### Task 2: Database column

**Files:**
- Modify: `backend/src/schema.ts:3-14`
- Create: `backend/drizzle/0008_*.sql` (generated — do not hand-write)
- Test: `backend/test/platformSupport.test.ts`

**Interfaces:**
- Produces: `users.supportExpiresAt: string | null`, exposed on `req.user` and `GET /auth/me` automatically because `authenticateToken` selects the whole row (`backend/src/middleware/auth.ts:89`).

- [ ] **Step 1: Write the failing test**

Create `backend/test/platformSupport.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { nextPhone } from './helpers';

describe('support column', () => {
  // Registers through the raw endpoint rather than the registerUser helper on purpose: a later
  // task makes that helper pay the fee by default, and this test must keep describing a user
  // who has never paid.
  it('starts a newly registered tourist with no support expiry', async () => {
    const phone = nextPhone();
    const res = await request(app)
      .post('/api/auth/otp/verify')
      .send({ phone, otp: '123456', name: 'Fresh Tourist' });

    expect(res.status).toBe(200);
    expect(res.body.user.supportExpiresAt).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
cd backend && npx vitest run test/platformSupport.test.ts
```

Expected: FAIL — `supportExpiresAt` is `undefined`, not `null`.

- [ ] **Step 3: Add the column to the schema**

In `backend/src/schema.ts`, add to the `users` table between `createdAt` (line 12) and `password` (line 13):

```typescript
  createdAt: text('created_at').notNull(),
  // Tourist platform support & convenience fee. null = never paid. Active while > now().
  supportExpiresAt: text('support_expires_at'),
  password: text('password'),
```

- [ ] **Step 4: Generate and apply the migration**

```bash
cd backend && npm run db:generate && npm run db:migrate && npm run test:setup
```

Expected: a new `backend/drizzle/0008_*.sql` containing
`ALTER TABLE "users" ADD COLUMN "support_expires_at" text;` — nullable, **no backfill**.

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd backend && npx vitest run test/platformSupport.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run the full backend suite to confirm nothing regressed**

```bash
cd backend && npm test
```

Expected: all pre-existing tests still pass — the column is additive and nothing reads it yet.

- [ ] **Step 7: Commit**

```bash
git add backend/src/schema.ts backend/drizzle backend/test/platformSupport.test.ts
git commit -m "feat(support): add users.support_expires_at column"
```

---

### Task 3: The `platform_support` payment flow

**Files:**
- Modify: `backend/src/config.ts:172-175` (`AMOUNTS`)
- Modify: `backend/src/routes/payments.ts:13-78` (`handlePaymentSuccess`), `:86-116` (`assertOwnsReference`), and the three OpenAPI `enum` lists at `:164`, `:300`, `:387`
- Modify: `backend/test/helpers.ts:11-20`
- Test: `backend/test/platformSupport.test.ts`

**Interfaces:**
- Consumes: `computeSupportExpiry` from `../lib/support`
- Produces:
  - flow `platform_support`, where `reference_id` is the payer's own user id. `handlePaymentSuccess` returns `{ supportExpiresAt: string }` for this flow.
  - `activateSupport(token: string, userId: string): Promise<void>` in `test/helpers.ts`
  - `registerUser` gains `paySupport?: boolean` (default `true`, applied only when the role is `tourist`)

The test-helper change lands here rather than with the middleware in Task 5. It cannot land earlier — there is no flow to pay. It must not land later — Task 3's own tests need `paySupport: false`, and TypeScript's excess-property check rejects an option the signature does not declare, which would break `npm run build`. Paying is harmless at this point because nothing is gated yet.

- [ ] **Step 1: Write the failing tests**

Append to `backend/test/platformSupport.test.ts`. Merge the helper import into the existing `import { nextPhone } from './helpers';` line at the top of the file rather than adding a second import from the same module:

```typescript
// top of file — replace the existing helpers import with:
import { nextPhone, registerUser } from './helpers';
```

```typescript
const DAY_MS = 24 * 60 * 60 * 1000;

async function paySupport(token: string, userId: string) {
  const orderRes = await request(app)
    .post('/api/payments/order')
    .set('Authorization', `Bearer ${token}`)
    .send({ flow: 'platform_support', reference_id: userId });
  expect(orderRes.status).toBe(200);

  const orderId = orderRes.body.order.id as string;
  const completeRes = await request(app)
    .post('/api/payments/mock/complete')
    .set('Authorization', `Bearer ${token}`)
    .send({ order_id: orderId, flow: 'platform_support', reference_id: userId });

  return { orderId, orderRes, completeRes };
}

async function me(token: string) {
  const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
  return res.body.user;
}

describe('platform_support payment flow', () => {
  it('charges 1200 paise regardless of anything in the request body', async () => {
    const { token, user } = await registerUser({ name: 'Support Payer', paySupport: false });
    const res = await request(app)
      .post('/api/payments/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ flow: 'platform_support', reference_id: user.id, amount: 1 });

    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(1200);
    expect(res.body.order.amount).toBe(1200);
  });

  it('refuses an order that references another user', async () => {
    const { token } = await registerUser({ name: 'Attacker', paySupport: false });
    const { user: victim } = await registerUser({ name: 'Victim', paySupport: false });

    const res = await request(app)
      .post('/api/payments/order')
      .set('Authorization', `Bearer ${token}`)
      .send({ flow: 'platform_support', reference_id: victim.id });

    expect(res.status).toBe(403);
  });

  it('stamps an expiry 365 days out when settled', async () => {
    const { token, user } = await registerUser({ name: 'First Timer', paySupport: false });
    const before = Date.now();

    const { completeRes } = await paySupport(token, user.id);
    expect(completeRes.status).toBe(200);

    const expiry = Date.parse((await me(token)).supportExpiresAt);
    expect(expiry - before).toBeGreaterThan(364 * DAY_MS);
    expect(expiry - before).toBeLessThan(366 * DAY_MS);
  });

  it('extends the existing window when paid a second time', async () => {
    const { token, user } = await registerUser({ name: 'Renewer', paySupport: false });

    await paySupport(token, user.id);
    const first = Date.parse((await me(token)).supportExpiresAt);

    await paySupport(token, user.id);
    const second = Date.parse((await me(token)).supportExpiresAt);

    expect(second - first).toBeGreaterThan(364 * DAY_MS);
    expect(second - first).toBeLessThan(366 * DAY_MS);
  });

  it('does not extend the window when the same order settles twice', async () => {
    const { token, user } = await registerUser({ name: 'Double Settler', paySupport: false });
    const { orderId } = await paySupport(token, user.id);
    const afterFirst = (await me(token)).supportExpiresAt;

    const replay = await request(app)
      .post('/api/payments/mock/complete')
      .set('Authorization', `Bearer ${token}`)
      .send({ order_id: orderId, flow: 'platform_support', reference_id: user.id });

    expect(replay.status).toBe(200);
    expect(replay.body.already).toBe(true);
    expect((await me(token)).supportExpiresAt).toBe(afterFirst);
  });
});
```

These tests pass `paySupport: false` to `registerUser`. That option is added in Step 7 below, so expect a type error until then.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd backend && npx vitest run test/platformSupport.test.ts
```

Expected: FAIL — the order request returns 400 `Invalid payment flow`.

- [ ] **Step 3: Add the amount**

In `backend/src/config.ts`, replace the `AMOUNTS` block at lines 172-175:

```typescript
export const AMOUNTS: Record<string, number> = {
  provider_registration: 9900,
  booking_commission: 100,
  platform_support: 1200
};
```

- [ ] **Step 4: Add the ownership rule**

In `backend/src/routes/payments.ts`, import the helper at the top alongside the existing imports:

```typescript
import { computeSupportExpiry } from '../lib/support';
```

Then inside `assertOwnsReference`, after the `booking_commission` block (ends line 111) and before the default refusal comment:

```typescript
  if (flow === 'platform_support') {
    // The reference is the payer themselves — there is no other entity to own. Requiring the
    // match is what stops someone creating a ₹12 order that credits a different account.
    if (referenceId !== userId) {
      return { status: 403, detail: 'You can only pay the support fee for your own account' };
    }
    return null;
  }
```

- [ ] **Step 5: Add the settlement side effect**

In `backend/src/routes/payments.ts`, inside `handlePaymentSuccess`, add a branch after the `booking_commission` block closes (line 76) and before `return null`:

```typescript
  } else if (flow === 'platform_support') {
    // Read-then-write rather than a single UPDATE ... GREATEST(...) expression. Two DIFFERENT
    // orders settling for the same user in the same instant could each read the same starting
    // value, costing the user one of the two years. At ₹12 a year and with settlement already
    // serialised per order by settlePaymentOnce, that race is not worth the untestable SQL.
    const [u] = await db.select().from(schema.users).where(eq(schema.users.id, userId)).limit(1);
    if (!u) return null;

    const supportExpiresAt = computeSupportExpiry(u.supportExpiresAt);
    await db.update(schema.users)
      .set({ supportExpiresAt })
      .where(eq(schema.users.id, userId));

    return { supportExpiresAt };
  }
```

- [ ] **Step 6: Update the OpenAPI enums**

In `backend/src/routes/payments.ts`, three `enum` lists name the valid flows. Change each from
`enum: [provider_registration, booking_commission]` to
`enum: [provider_registration, booking_commission, platform_support]`:

- line 164 (`/payments/order` request body)
- line 300 (`/payments/mock/complete` request body)
- line 387 (`/payments/verify` request body)

Also update the `reference_id` description at line 165 to:

```
 *               reference_id: { type: string, description: "Provider id (provider_registration), booking id (booking_commission), or the caller's own user id (platform_support)" }
```

- [ ] **Step 7: Teach the test helper to pay the fee**

In `backend/test/helpers.ts`, replace `registerUser` (lines 11-20) with:

```typescript
export async function activateSupport(token: string, userId: string) {
  const orderRes = await request(app)
    .post('/api/payments/order')
    .set('Authorization', `Bearer ${token}`)
    .send({ flow: 'platform_support', reference_id: userId });
  if (orderRes.status !== 200) {
    throw new Error(`activateSupport order failed: ${orderRes.status} ${JSON.stringify(orderRes.body)}`);
  }

  const res = await request(app)
    .post('/api/payments/mock/complete')
    .set('Authorization', `Bearer ${token}`)
    .send({ order_id: orderRes.body.order.id, flow: 'platform_support', reference_id: userId });
  if (res.status !== 200) {
    throw new Error(`activateSupport complete failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

export async function registerUser(opts: {
  name: string;
  role?: 'tourist' | 'provider';
  phone?: string;
  /** Set false to get a tourist who has NOT paid — for tests that exercise the gate itself. */
  paySupport?: boolean;
}) {
  const phone = opts.phone || nextPhone();
  const role = opts.role || 'tourist';
  const res = await request(app)
    .post('/api/auth/otp/verify')
    .send({ phone, otp: '123456', name: opts.name, role });
  if (res.status !== 200) {
    throw new Error(`registerUser failed: ${res.status} ${JSON.stringify(res.body)}`);
  }

  const token = res.body.token as string;
  const user = res.body.user;

  // Once Task 5 mounts the gate, a bare tourist registration cannot book, favourite or review.
  // Paying here keeps all ~66 existing call sites describing what they meant to describe.
  // Providers are left alone: they become exempt only when providerPaid is true, which is what
  // onboardActiveProvider arranges.
  if (role === 'tourist' && opts.paySupport !== false) {
    await activateSupport(token, user.id);
  }

  return { token, user, phone };
}
```

- [ ] **Step 8: Run the tests to verify they pass**

```bash
cd backend && npx vitest run test/platformSupport.test.ts
```

Expected: PASS — 6 tests.

- [ ] **Step 9: Run the full backend suite**

```bash
cd backend && npm test
```

Expected: all pass. Nothing is gated yet, so the only change in behaviour is an extra mock payment per registered tourist. `admin.test.ts` was checked and makes no assertions about payment counts or revenue; if any test does start failing on a payment total, that is the cause.

- [ ] **Step 10: Commit**

```bash
git add backend/src/config.ts backend/src/routes/payments.ts backend/test/helpers.ts backend/test/platformSupport.test.ts
git commit -m "feat(support): add platform_support payment flow"
```

---

### Task 4: The `requireActiveSupport` middleware

Built and unit-covered here; mounted on routes in Task 5. Splitting them means the middleware's own logic is reviewable on its own, before the task that changes behaviour for every existing tourist.

**Files:**
- Create: `backend/src/middleware/support.ts`
- Test: `backend/test/support.test.ts`

**Interfaces:**
- Consumes: `isExemptFromSupport`, `isSupportActive` from `../lib/support`
- Produces: `requireActiveSupport(req, res, next)` — Express middleware. Mount **after** `authenticateToken`. Responds `402 { detail, code: 'support_required' }`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/test/support.test.ts`:

```typescript
import { requireActiveSupport } from '../src/middleware/support';

function runMiddleware(user: any) {
  const req: any = { user };
  const result: any = { status: null, body: null, nextCalled: false };
  const res: any = {
    status(code: number) { result.status = code; return res; },
    json(body: any) { result.body = body; return res; },
  };
  requireActiveSupport(req, res, () => { result.nextCalled = true; });
  return result;
}

describe('requireActiveSupport', () => {
  const future = new Date(Date.now() + 30 * DAY_MS).toISOString();
  const past = new Date(Date.now() - 30 * DAY_MS).toISOString();

  it('401s when there is no authenticated user', () => {
    const r = runMiddleware(undefined);
    expect(r.status).toBe(401);
    expect(r.nextCalled).toBe(false);
  });

  it('402s a tourist who has never paid', () => {
    const r = runMiddleware({ role: 'tourist', supportExpiresAt: null });
    expect(r.status).toBe(402);
    expect(r.body.code).toBe('support_required');
    expect(r.nextCalled).toBe(false);
  });

  it('402s a tourist whose window has lapsed', () => {
    const r = runMiddleware({ role: 'tourist', supportExpiresAt: past });
    expect(r.status).toBe(402);
    expect(r.nextCalled).toBe(false);
  });

  it('passes a tourist with an active window', () => {
    const r = runMiddleware({ role: 'tourist', supportExpiresAt: future });
    expect(r.nextCalled).toBe(true);
    expect(r.status).toBeNull();
  });

  it('passes an admin', () => {
    const r = runMiddleware({ role: 'admin' });
    expect(r.nextCalled).toBe(true);
  });

  it('passes a provider who paid the registration fee', () => {
    const r = runMiddleware({ role: 'provider', providerPaid: true });
    expect(r.nextCalled).toBe(true);
  });

  it('402s a provider who has not paid the registration fee', () => {
    const r = runMiddleware({ role: 'provider', providerPaid: false });
    expect(r.status).toBe(402);
    expect(r.nextCalled).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd backend && npx vitest run test/support.test.ts
```

Expected: FAIL — `Cannot find module '../src/middleware/support'`.

- [ ] **Step 3: Write the middleware**

Create `backend/src/middleware/support.ts`:

```typescript
import { Request, Response, NextFunction } from 'express';
import { isExemptFromSupport, isSupportActive } from '../lib/support';

/**
 * Blocks the actions that cost the platform something until the annual support fee is active.
 * Mount AFTER authenticateToken, which is what puts the user row on the request.
 *
 * 402 rather than 403: the request is well-formed and the caller is who they claim to be — the
 * only thing missing is payment. That distinction matters to the client, which redirects on 402
 * but treats 403 as a genuine authorisation failure. The client keys on `code`, not the prose.
 */
export function requireActiveSupport(req: Request, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user) {
    return res.status(401).json({ detail: 'Missing token' });
  }

  if (isExemptFromSupport(user) || isSupportActive(user)) {
    return next();
  }

  return res.status(402).json({
    detail: 'A ₹12 annual platform support fee is required before you can do this.',
    code: 'support_required'
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd backend && npx vitest run test/support.test.ts
```

Expected: PASS — 20 tests total in the file.

- [ ] **Step 5: Commit**

```bash
git add backend/src/middleware/support.ts backend/test/support.test.ts
git commit -m "feat(support): add requireActiveSupport middleware"
```

---

### Task 5: Mount the gate on tourist creates

This is the step that changes behaviour for existing users. Task 3 already made `registerUser` pay the fee, so the existing suite should stay green.

**Files:**
- Modify: `backend/src/routes/bookings.ts:59`
- Modify: `backend/src/routes/favorites.ts:112`
- Modify: `backend/src/routes/reviews.ts:77`
- Modify: `docs/superpowers/specs/2026-07-22-tourist-platform-support-fee-design.md` (§6 table)
- Test: `backend/test/platformSupport.test.ts`

**Interfaces:**
- Consumes: `requireActiveSupport` from `../middleware/support`; `registerUser`, `createListing`, `onboardActiveProvider`, `activateSupport` from `./helpers`
- Produces: nothing new — this task wires existing pieces together.

- [ ] **Step 1: Write the failing tests**

Append to `backend/test/platformSupport.test.ts`, extending the existing helpers import at the top of the file to `import { nextPhone, registerUser, createListing, onboardActiveProvider } from './helpers';`:

```typescript
describe('support gate on tourist creates', () => {
  it('402s a tourist who has not paid', async () => {
    const { token } = await registerUser({ name: 'Unpaid Tourist', paySupport: false });
    const listing = await createListing();

    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id });

    expect(res.status).toBe(402);
    expect(res.body.code).toBe('support_required');
  });

  it('lets a tourist through once the fee is paid', async () => {
    const { token, user } = await registerUser({ name: 'Paid Tourist', paySupport: false });
    const listing = await createListing();
    await paySupport(token, user.id);

    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id });

    expect(res.status).toBe(200);
  });

  it('402s a provider who has not paid the registration fee', async () => {
    // role is already 'provider' but providerPaid is false — the loophole the exemption
    // rule exists to close.
    const { token } = await registerUser({ name: 'Unpaid Provider', role: 'provider' });
    const listing = await createListing();

    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id });

    expect(res.status).toBe(402);
  });

  it('lets an active provider through without paying the support fee', async () => {
    const { token } = await onboardActiveProvider({ name: 'Paid Provider' });
    const listing = await createListing();

    const res = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id });

    expect(res.status).toBe(200);
  });

  it('still lets a tourist whose window has lapsed remove their own data', async () => {
    // Withdrawal is deliberately not gated: trapping a lapsed user in a booking they cannot
    // cancel is worse for the provider than the cancellation would have been.
    const { token, user } = await registerUser({ name: 'Lapser' });
    const listing = await createListing();

    await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id });

    // Expire them. There is no API for this — the fee only ever moves the expiry forward — so
    // the test reaches into the DB directly, which is the only way to exercise a lapse without
    // waiting a year.
    await db.update(schema.users)
      .set({ supportExpiresAt: new Date(Date.now() - DAY_MS).toISOString() })
      .where(eq(schema.users.id, user.id));

    // Confirm the lapse actually took effect, so a silent no-op cannot make this test vacuous.
    const blocked = await request(app)
      .post('/api/favorites')
      .set('Authorization', `Bearer ${token}`)
      .send({ listing_id: listing.id });
    expect(blocked.status).toBe(402);

    const res = await request(app)
      .delete(`/api/favorites/${listing.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});
```

This test needs three more imports at the top of the file:

```typescript
import { eq } from 'drizzle-orm';
import { db, schema } from '../src/db';
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd backend && npx vitest run test/platformSupport.test.ts
```

Expected: FAIL — the unpaid-tourist and unpaid-provider cases return 200 because nothing is gated yet.

- [ ] **Step 3: Mount the middleware on the three create routes**

In `backend/src/routes/bookings.ts`, add to the imports:

```typescript
import { requireActiveSupport } from '../middleware/support';
```

and change line 59:

```typescript
router.post('/', authenticateToken, requireActiveSupport, async (req: Request, res: Response) => {
```

In `backend/src/routes/favorites.ts`, add the same import and change line 112:

```typescript
router.post('/', authenticateToken, requireActiveSupport, async (req: Request, res: Response) => {
```

In `backend/src/routes/reviews.ts`, add the same import and change line 77:

```typescript
router.post('/', authenticateToken, requireActiveSupport, async (req: Request, res: Response) => {
```

Leave `bookings.ts:338` (cancel), `favorites.ts:142` (delete), and `reviews.ts:129` (delete) **ungated** — see the deviation note at the top of this plan.

- [ ] **Step 4: Add a 402 response to each route's OpenAPI block**

Each of the three routes has an `@openapi` comment listing responses. Add to all three, keeping each file's existing indentation:

```
 *       402:
 *         description: The caller's annual platform support fee is not active
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/Error' }
```

- [ ] **Step 5: Run the full backend suite**

```bash
cd backend && npm test
```

Expected: PASS — all files. If a test fails with 402, that call site needs a paid tourist and Task 3's helper change did not reach it — check whether it builds a user by some route other than `registerUser`.

- [ ] **Step 6: Amend the spec to match the narrower gate**

In `docs/superpowers/specs/2026-07-22-tourist-platform-support-fee-design.md` §6, replace the three route rows:

```markdown
| `backend/src/routes/bookings.ts` | apply middleware to booking **create** only |
| `backend/src/routes/favorites.ts` | apply middleware to favorite **create** only |
| `backend/src/routes/reviews.ts` | apply middleware to review **create** only |
```

And add immediately below the table:

```markdown
### Withdrawal is not gated

Booking cancel, un-favourite, and review delete stay open to lapsed accounts. The gate exists to
stop unpaid accounts consuming value, not to trap users in commitments or hold their content
hostage — a lapsed user who cannot cancel simply no-shows, which is worse for the provider than
the cancellation would have been.
```

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes backend/test/platformSupport.test.ts docs/superpowers/specs/2026-07-22-tourist-platform-support-fee-design.md
git commit -m "feat(support): gate tourist creates behind the support fee"
```

---

### Task 6: Client-side support predicates and 402 handling

**Files:**
- Create: `frontend/src/lib/support.ts`
- Create: `frontend/src/lib/support.test.js`
- Modify: `frontend/src/lib/api.ts:9-17`
- Modify: `frontend/src/lib/api.test.js`

**Interfaces:**
- Produces:
  - `frontend/src/lib/support.ts` — `isExemptFromSupport(user)`, `isSupportActive(user)`, `needsSupport(user)`, `SUPPORT_ROUTE = '/support'`
  - `frontend/src/lib/api.ts` — `isSupportRequiredError(error): boolean`, plus a response interceptor

Tests here are plain `.js` files run by `craco test`, matching the note at the top of the existing `api.test.js`: the repo has no `@types/jest`, and adding it churns ~1700 lines of lockfile.

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/lib/support.test.js`:

```javascript
// Plain .js for the same reason as api.test.js — the repo has no @types/jest.
const { isExemptFromSupport, isSupportActive, needsSupport } = require('./support');

const DAY_MS = 24 * 60 * 60 * 1000;
const future = () => new Date(Date.now() + 30 * DAY_MS).toISOString();
const past = () => new Date(Date.now() - 30 * DAY_MS).toISOString();

describe('isExemptFromSupport', () => {
  it('exempts admins', () => {
    expect(isExemptFromSupport({ role: 'admin' })).toBe(true);
  });

  it('exempts only providers who have paid', () => {
    expect(isExemptFromSupport({ role: 'provider', providerPaid: true })).toBe(true);
    expect(isExemptFromSupport({ role: 'provider', providerPaid: false })).toBe(false);
    expect(isExemptFromSupport({ role: 'provider' })).toBe(false);
  });
});

describe('needsSupport', () => {
  it('is false without a user — logged-out browsing is free', () => {
    expect(needsSupport(null)).toBe(false);
    expect(needsSupport(undefined)).toBe(false);
  });

  it('is true for a tourist who has never paid', () => {
    expect(needsSupport({ role: 'tourist', supportExpiresAt: null })).toBe(true);
  });

  it('is true for a tourist whose window lapsed', () => {
    expect(needsSupport({ role: 'tourist', supportExpiresAt: past() })).toBe(true);
  });

  it('is false for a tourist with an active window', () => {
    expect(needsSupport({ role: 'tourist', supportExpiresAt: future() })).toBe(false);
  });

  it('is false for an admin and for a paid provider', () => {
    expect(needsSupport({ role: 'admin' })).toBe(false);
    expect(needsSupport({ role: 'provider', providerPaid: true })).toBe(false);
  });

  it('is true for an unpaid provider', () => {
    expect(needsSupport({ role: 'provider', providerPaid: false })).toBe(true);
  });
});

describe('isSupportActive', () => {
  it('treats unparseable values as inactive', () => {
    expect(isSupportActive({ role: 'tourist', supportExpiresAt: 'nonsense' })).toBe(false);
  });
});
```

Append to `frontend/src/lib/api.test.js`:

```javascript
describe('isSupportRequiredError', () => {
  const { isSupportRequiredError } = require('./api');

  it('recognises the support-required 402', () => {
    expect(isSupportRequiredError({
      response: { status: 402, data: { code: 'support_required' } },
    })).toBe(true);
  });

  it('ignores a 402 that is not about support', () => {
    expect(isSupportRequiredError({
      response: { status: 402, data: { code: 'something_else' } },
    })).toBe(false);
  });

  it('ignores other statuses and malformed errors', () => {
    expect(isSupportRequiredError({ response: { status: 403, data: { code: 'support_required' } } })).toBe(false);
    expect(isSupportRequiredError({})).toBe(false);
    expect(isSupportRequiredError(null)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd frontend && CI=true npx craco test --testPathPattern "src/lib" --watchAll=false
```

Expected: FAIL — `Cannot find module './support'`, and `isSupportRequiredError` is not a function.

- [ ] **Step 3: Write the client predicates**

Create `frontend/src/lib/support.ts`:

```typescript
export const SUPPORT_ROUTE = '/support';

export interface SupportUser {
  role: string;
  providerPaid?: boolean | null;
  supportExpiresAt?: string | null;
}

/**
 * Mirrors backend/src/lib/support.ts. Kept in step deliberately: this one decides what the user
 * SEES, the server's decides what the user may DO. The server is always the authority — if the
 * two ever disagree, the 402 interceptor below corrects the client.
 */
export function isExemptFromSupport(user: SupportUser): boolean {
  if (user.role === 'admin') return true;
  return user.role === 'provider' && user.providerPaid === true;
}

export function isSupportActive(user: SupportUser): boolean {
  if (!user.supportExpiresAt) return false;
  const expiry = Date.parse(user.supportExpiresAt);
  if (Number.isNaN(expiry)) return false;
  return expiry > Date.now();
}

/** Logged-out visitors never need it — public browsing stays free. */
export function needsSupport(user: SupportUser | null | undefined): boolean {
  if (!user) return false;
  return !isExemptFromSupport(user) && !isSupportActive(user);
}
```

- [ ] **Step 4: Add the 402 handling to the API client**

In `frontend/src/lib/api.ts`, insert after the existing request interceptor (line 15) and before `export default api`:

```typescript
import { SUPPORT_ROUTE } from './support';

/**
 * True when the server is telling us the caller's support fee is not active. The status alone is
 * not enough — 402 could mean something else later — so the machine-readable code decides.
 */
export function isSupportRequiredError(error: any): boolean {
  return error?.response?.status === 402 && error?.response?.data?.code === 'support_required';
}

// SupportGate is the primary gate, but client state goes stale: a window that lapsed mid-session,
// or a second tab holding an older user object. A 402 is the server's authoritative answer, so
// honour it. A full navigation rather than a router push, because axios has no router access —
// acceptable for a path that should be rare.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (isSupportRequiredError(error) && window.location.pathname !== SUPPORT_ROUTE) {
      window.location.assign(SUPPORT_ROUTE);
    }
    return Promise.reject(error);
  }
);
```

Move the `import { SUPPORT_ROUTE } from './support';` line up to sit with the `axios` import at the top of the file — it is written inline above only to show where the block goes.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd frontend && CI=true npx craco test --testPathPattern "src/lib" --watchAll=false
```

Expected: PASS — both files.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/support.ts frontend/src/lib/support.test.js frontend/src/lib/api.ts frontend/src/lib/api.test.js
git commit -m "feat(support): add client support predicates and 402 handling"
```

---

### Task 7: Copy in all four locales

**Files:**
- Modify: `frontend/src/locales/en.json`, `hi.json`, `bn.json`, `ne.json`

**Interfaces:**
- Produces: the `support.*` i18n keys consumed by Task 8.

The `hi`, `bn`, and `ne` strings below are drafted, not professionally translated. They are correct enough to ship behind the existing language switcher, but flag them for a native-speaker pass before a real launch.

- [ ] **Step 1: Add the English block**

Add a top-level `"support"` key to `frontend/src/locales/en.json`, as a sibling of `"nav"`:

```json
  "support": {
    "title": "A small token to keep 1 Darjeeling running",
    "amount_line": "₹12 for the year — a one-time platform support & convenience fee that goes toward maintenance, hosting and building costs.",
    "body": "That's ₹1 a month. It keeps the app running for travellers and keeps listings free for the small homestays, drivers and cafés on it.",
    "cta": "Pay ₹12 · valid 1 year",
    "reassurance": "Valid for one year. Nothing auto-charges — we'll ask you again next year.",
    "skip": "Not now — browse without an account",
    "modal_title": "Platform support fee",
    "modal_duration": "· 1 year",
    "privacy_link": "privacy policy",
    "error": "Payment could not be completed. Please try again."
  },
```

- [ ] **Step 2: Add the Hindi block**

Add the same key to `frontend/src/locales/hi.json`:

```json
  "support": {
    "title": "1 दार्जिलिंग को चलाए रखने के लिए एक छोटा सहयोग",
    "amount_line": "साल भर के लिए ₹12 — रखरखाव, होस्टिंग और निर्माण लागत के लिए एक बार का प्लेटफ़ॉर्म सहयोग एवं सुविधा शुल्क।",
    "body": "यानी ₹1 प्रति माह। इससे ऐप यात्रियों के लिए चलता रहता है और छोटे होमस्टे, ड्राइवरों और कैफ़े के लिए लिस्टिंग मुफ़्त रहती है।",
    "cta": "₹12 भुगतान करें · 1 वर्ष के लिए मान्य",
    "reassurance": "एक वर्ष के लिए मान्य। कोई स्वतः शुल्क नहीं कटेगा — हम अगले साल फिर पूछेंगे।",
    "skip": "अभी नहीं — बिना खाते के देखें",
    "modal_title": "प्लेटफ़ॉर्म सहयोग शुल्क",
    "modal_duration": "· 1 वर्ष",
    "privacy_link": "गोपनीयता नीति",
    "error": "भुगतान पूरा नहीं हो सका। कृपया पुनः प्रयास करें।"
  },
```

- [ ] **Step 3: Add the Bengali block**

Add the same key to `frontend/src/locales/bn.json`:

```json
  "support": {
    "title": "1 দার্জিলিং চালু রাখতে একটি ছোট সহযোগিতা",
    "amount_line": "বছরের জন্য ₹12 — রক্ষণাবেক্ষণ, হোস্টিং ও নির্মাণ খরচের জন্য এককালীন প্ল্যাটফর্ম সহায়তা ও সুবিধা ফি।",
    "body": "অর্থাৎ মাসে ₹1। এতে অ্যাপটি ভ্রমণকারীদের জন্য চালু থাকে এবং ছোট হোমস্টে, চালক ও ক্যাফের জন্য তালিকাভুক্তি বিনামূল্যে থাকে।",
    "cta": "₹12 দিন · ১ বছরের জন্য বৈধ",
    "reassurance": "এক বছরের জন্য বৈধ। স্বয়ংক্রিয়ভাবে কোনো টাকা কাটা হবে না — আগামী বছর আবার জিজ্ঞাসা করব।",
    "skip": "এখন নয় — অ্যাকাউন্ট ছাড়াই দেখুন",
    "modal_title": "প্ল্যাটফর্ম সহায়তা ফি",
    "modal_duration": "· ১ বছর",
    "privacy_link": "গোপনীয়তা নীতি",
    "error": "পেমেন্ট সম্পূর্ণ করা যায়নি। আবার চেষ্টা করুন।"
  },
```

- [ ] **Step 4: Add the Nepali block**

Add the same key to `frontend/src/locales/ne.json`:

```json
  "support": {
    "title": "1 दार्जिलिङ चलाइराख्न सानो सहयोग",
    "amount_line": "वर्षभरका लागि ₹12 — मर्मतसम्भार, होस्टिङ र निर्माण खर्चका लागि एकपटकको प्लेटफर्म सहयोग तथा सुविधा शुल्क।",
    "body": "अर्थात् महिनाको ₹1। यसले एप यात्रुहरूका लागि चलिरहन्छ र साना होमस्टे, चालक र क्याफेहरूका लागि सूचीकरण नि:शुल्क रहन्छ।",
    "cta": "₹12 तिर्नुहोस् · १ वर्षका लागि मान्य",
    "reassurance": "एक वर्षका लागि मान्य। स्वतः कुनै शुल्क कटिँदैन — अर्को वर्ष फेरि सोध्नेछौं।",
    "skip": "अहिले होइन — खाता बिना हेर्नुहोस्",
    "modal_title": "प्लेटफर्म सहयोग शुल्क",
    "modal_duration": "· १ वर्ष",
    "privacy_link": "गोपनीयता नीति",
    "error": "भुक्तानी पूरा हुन सकेन। कृपया फेरि प्रयास गर्नुहोस्।"
  },
```

- [ ] **Step 5: Verify all four files are valid JSON with matching keys**

```bash
cd frontend/src/locales && for f in en hi bn ne; do node -e "
  const k = Object.keys(require('./$f.json').support || {}).sort().join(',');
  console.log('$f', k);
"; done
```

Expected: four identical key lists —
`amount_line,body,cta,error,modal_duration,modal_title,privacy_link,reassurance,skip,title`

- [ ] **Step 6: Commit**

```bash
git add frontend/src/locales
git commit -m "feat(support): add support-fee copy in all four locales"
```

---

### Task 8: The `/support` screen

**Files:**
- Create: `frontend/src/pages/Support.tsx`

**Interfaces:**
- Consumes: `useAuth()` (`user`, `refresh`, `logout`), `createPaymentOrder` / `completeMockPayment` / `payWithRazorpay` from `@/lib/api`, `MockPaymentModal`, the `support.*` i18n keys
- Produces: default-exported `Support` page component, routed at `/support` in Task 9. Reads its post-payment destination from `location.state.from.pathname`.

- [ ] **Step 1: Write the component**

Create `frontend/src/pages/Support.tsx`:

```tsx
import React, { useState } from 'react';
import { useNavigate, useLocation, Navigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { HeartHandshake, Check } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { createPaymentOrder, completeMockPayment, payWithRazorpay } from '@/lib/api';
import MockPaymentModal from '@/components/MockPaymentModal';

export default function Support() {
  const { t } = useTranslation();
  const { user, refresh, logout } = useAuth();
  const nav = useNavigate();
  const location = useLocation();

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [payModal, setPayModal] = useState<any>(null);

  // Where SupportGate intercepted them. Falling back to the feed keeps a direct visit sensible.
  const destination = (location.state as any)?.from?.pathname || '/';

  if (!user) return <Navigate to="/login" replace />;

  const finish = async () => {
    await refresh();
    nav(destination, { replace: true });
  };

  const startPayment = async () => {
    setBusy(true);
    setErr('');
    try {
      const order = await createPaymentOrder({ flow: 'platform_support', reference_id: user.id });
      if (order.mock) {
        setPayModal({ amount: order.amount, order: order.order });
      } else {
        await payWithRazorpay({
          order: order.order,
          key_id: order.key_id,
          flow: 'platform_support',
          reference_id: user.id,
          description: t('support.modal_title'),
          prefill: { contact: user.phone, name: user.name },
        });
        await finish();
      }
    } catch (e: any) {
      setErr(e?.response?.data?.detail || t('support.error'));
    } finally {
      setBusy(false);
    }
  };

  const finishMockPayment = async () => {
    await completeMockPayment({
      order_id: payModal.order.id,
      flow: 'platform_support',
      reference_id: user.id,
    });
    setPayModal(null);
    await finish();
  };

  // The escape hatch. A hard gate on a logged-in user with no way out is a trap: they cannot
  // pay, cannot browse, cannot leave. Public browsing was always free — this makes it reachable.
  const browseAnonymously = () => {
    logout();
    nav('/', { replace: true });
  };

  return (
    <div className="mx-auto max-w-md px-4 md:px-8 py-8 md:py-14">
      <div className="mist-panel p-6 md:p-8" data-testid="support-screen">
        <div className="text-center">
          <div className="mx-auto w-14 h-14 rounded-2xl bg-pine text-white grid place-items-center">
            <HeartHandshake size={26} />
          </div>
          <h1 className="mt-4 font-display font-extrabold text-2xl md:text-3xl text-ink leading-tight">
            {t('support.title')}
          </h1>
        </div>

        <p className="mt-5 text-sm text-ink font-semibold">{t('support.amount_line')}</p>
        <p className="mt-3 text-sm text-ink-soft">{t('support.body')}</p>

        <button
          onClick={startPayment}
          disabled={busy}
          data-testid="support-pay"
          className="mt-7 w-full py-3 rounded-full bg-pine text-white font-extrabold btn-hover disabled:opacity-60"
        >
          {busy ? t('common.loading') : t('support.cta')}
        </button>

        <p className="mt-3 text-[11px] text-center text-ink-soft flex items-center justify-center gap-1">
          <Check size={11} /> {t('support.reassurance')}
        </p>

        {err && (
          <p data-testid="support-error" className="mt-4 text-sm text-flag font-semibold text-center">
            {err}
          </p>
        )}

        <button
          type="button"
          onClick={browseAnonymously}
          data-testid="support-skip"
          className="mt-6 w-full text-xs text-ink-soft underline"
        >
          {t('support.skip')}
        </button>

        <p className="mt-6 text-xs text-center text-ink-soft">
          <Link to="/privacy" className="underline">{t('support.privacy_link')}</Link>
        </p>
      </div>

      <MockPaymentModal
        open={!!payModal}
        onClose={() => setPayModal(null)}
        amount={payModal?.amount || 0}
        title={t('support.modal_title')}
        description={t('support.modal_duration')}
        onPay={finishMockPayment}
        prefill={{ upi: `${(user.name || 'traveller').toLowerCase().replace(/\s+/g, '')}@ybl` }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.json
```

Expected: no errors referencing `Support.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/Support.tsx
git commit -m "feat(support): add the /support fee screen"
```

---

### Task 9: `SupportGate` and routing

**Files:**
- Create: `frontend/src/components/SupportGate.tsx`
- Modify: `frontend/src/App.tsx:1-49`

**Interfaces:**
- Consumes: `needsSupport` from `@/lib/support`, `useAuth()`
- Produces: default-exported `SupportGate` wrapping `<Routes>` inside `<Layout>`.

- [ ] **Step 1: Write the gate**

Create `frontend/src/components/SupportGate.tsx`:

```tsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/context/AuthContext';
import { needsSupport } from '@/lib/support';

/**
 * Paths that must stay reachable while gated.
 *
 * /support     — the screen that lifts the gate; redirecting it to itself is a loop.
 * /login       — Login has its own redirect-when-authenticated effect; letting the gate fight
 *                it produces a loop, and a gated user may legitimately want to switch accounts.
 * /privacy     — linked from the support screen, and a policy page behind a paywall is absurd.
 * /provider/onboard — an unpaid provider needs support (providerPaid is false) but this is
 *                exactly where Login sends them to pay the ₹99. Gating it would deadlock
 *                provider onboarding entirely.
 */
const ALWAYS_ALLOWED = ['/support', '/login', '/privacy', '/provider/onboard'];

export default function SupportGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  // Render nothing rather than the gate while the session is still resolving, otherwise a
  // logged-in paid user gets a flash of the paywall on every hard refresh.
  if (loading) return null;

  if (!needsSupport(user)) return <>{children}</>;
  if (ALWAYS_ALLOWED.includes(location.pathname)) return <>{children}</>;

  return <Navigate to="/support" replace state={{ from: location }} />;
}
```

- [ ] **Step 2: Wire it into the router**

In `frontend/src/App.tsx`, add the two imports:

```tsx
import SupportGate from '@/components/SupportGate';
import Support from '@/pages/Support';
```

Wrap `<Routes>` and add the route — the whole `<Layout>` block becomes:

```tsx
          <Layout>
            <SupportGate>
              <Routes>
                <Route path="/" element={<Discover />} />
                <Route path="/spots" element={<Category typeOverride="spot" />} />
                <Route path="/homestays" element={<Category typeOverride="homestay" />} />
                <Route path="/drivers" element={<Category typeOverride="driver" />} />
                <Route path="/shops" element={<Category typeOverride="shop" />} />
                <Route path="/cafes" element={<Category typeOverride="cafe" />} />
                <Route path="/events" element={<Category typeOverride="event" />} />
                <Route path="/biodiversity" element={<Category typeOverride="biodiversity" />} />
                <Route path="/search" element={<Category typeOverride={undefined} />} />
                <Route path="/listing/:id" element={<ListingDetail />} />
                <Route path="/login" element={<Login />} />
                <Route path="/support" element={<Support />} />
                <Route path="/provider/onboard" element={<ProviderOnboard />} />
                <Route path="/provider/dashboard" element={<ProviderDashboard />} />
                <Route path="/dashboard" element={<TouristDashboard />} />
                <Route path="/saved" element={<Saved />} />
                <Route path="/responsible" element={<Responsible />} />
                <Route path="/privacy" element={<Privacy />} />
              </Routes>
            </SupportGate>
          </Layout>
```

- [ ] **Step 3: Verify it compiles and the suites still pass**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.json && CI=true npx craco test --watchAll=false
```

Expected: no type errors; all frontend tests pass.

- [ ] **Step 4: Manual verification**

There is no React Testing Library in this repo (`frontend/package.json` has no `@testing-library/*`), so the gate's rendering behaviour is verified by hand. With the backend running under `MOCK_PAYMENTS=true`:

```bash
cd backend && npm run dev
# in another shell
cd frontend && npm start
```

Walk each case and confirm:

1. Logged out, visit `/` — feed renders, **no** redirect.
2. Log in as a new tourist — lands on `/support`, not the feed.
3. From `/support`, click through to `/privacy` — reachable.
4. Try to navigate to `/dashboard` — bounced back to `/support`.
5. Pay ₹12 in the mock modal — lands on the destination that was intercepted, not `/`.
6. Hard-refresh the page — **no** flash of the paywall.
7. Log out, log back in — straight to the feed, no paywall.
8. Log in as a new **provider** — lands on `/provider/onboard`, not `/support`.
9. Click "Not now — browse without an account" from `/support` — logged out, on `/`, feed browsable.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/SupportGate.tsx frontend/src/App.tsx
git commit -m "feat(support): gate the router behind the support fee"
```

---

## Final verification

- [ ] **Backend suite**

```bash
cd backend && npm test
```

Expected: all files pass, including `support.test.ts` (20 tests) and `platformSupport.test.ts` (12 tests).

- [ ] **Frontend suite and type-check**

```bash
cd frontend && npx tsc --noEmit -p tsconfig.json && CI=true npx craco test --watchAll=false
```

- [ ] **Grep for banned vocabulary**

```bash
grep -rniE "membership|subscription" frontend/src backend/src frontend/src/locales
```

Expected: no hits. Any hit is a Global Constraints violation and must be renamed.

- [ ] **Confirm the exemption rule is never role-only**

```bash
grep -rn "role === 'provider'" backend/src frontend/src
```

Expected: only the two lines inside `lib/support.ts` (server and client), each `&&`-ed with `providerPaid === true`.
