# Repo Audit — Findings & Investigation Needed

Audited 2026-07-16. Scope: `backend/`, `frontend/`, `frontend-admin/`, root config, and docs. Dev environment was stood up locally to validate several of these findings live (Postgres via Docker, backend on :8000, frontend on :3000, admin on :5173).

Severity is relative to "before this goes anywhere near a public/production deployment" — none of this blocks local development.

---

## 1. Security — needs a decision, not just a note

### 1.1 ✅ FIXED — `POST /api/dev/seed` was unauthenticated, gated only by an env var
`backend/src/routes/admin.ts` used to only check `if (IS_PROD) return 403`, and `IS_PROD` came from `APP_ENV === 'production'`, which **defaults to `'development'` if `APP_ENV` is unset**. Confirmed live pre-fix: `curl -X POST http://localhost:8000/api/dev/seed` succeeded with no credentials.

**Resolved 2026-07-16:** the route has been deleted entirely (the authenticated `/api/admin/seed` already covered the same need). `frontend-admin/src/pages/Admin.tsx`'s "reseed" button, which called `/dev/seed` directly, was updated to call `/admin/seed` instead. Validated live: `POST /dev/seed` now 404s; `/admin/seed` 401s without a token and succeeds (idempotently) with an admin token; the admin UI's HMR picked up the change with no errors.

### 1.2 ✅ FIXED — `POST /api/listings` had no role/ownership check
`backend/src/routes/listings.ts` used to let any authenticated user (tourist or provider) create a listing and pass an arbitrary `provider_id` in the body, trusted as-is.

**Resolved 2026-07-16:** the route now requires the caller to be either an admin (may set `provider_id` explicitly) or an active provider (listing is created under their own provider id — any `provider_id` in the body is ignored); anyone else gets `403`. Validated live: a plain tourist gets 403; an active provider's listing is force-attached to their own provider id even when a different `provider_id` is submitted; an admin's explicit `provider_id` is honored.

### 1.3 ✅ FIXED — `POST /api/payments/mock/complete` (and `/verify`) had no ownership check
`backend/src/routes/payments.ts` looked up the payment purely by `order_id` and never checked `payment.userId === req.user.id`. Any authenticated user who obtained/guessed another user's `order_id` could mark that order paid and trigger its side effects (activate someone else's provider, confirm someone else's booking).

**Resolved 2026-07-16:** both `/mock/complete` and `/verify` now return `403` if `payment.userId !== req.user.id`. Validated live with a two-user test: user B's attempt to complete user A's order now 403s; user A completing their own order still succeeds and confirms the booking correctly.

**⚠️ This fix was incomplete — see §1.5.** The ownership check closed the "complete someone else's order" hole but not the "complete *your own* order against someone else's reference" hole, and the regression test added here asserted only the former.

### 1.5 ✅ FIXED — `flow`/`reference_id` were trusted from the request body, not the order
Follow-up to §1.3, found 2026-07-17. Both `/mock/complete` and `/verify` passed the **body's** `flow` and `reference_id` into `handlePaymentSuccess(...)`, never comparing them against the stored `payment.flow` / `payment.referenceId`. §1.3's ownership check passed cleanly, because the order genuinely did belong to the caller — it was the *target* that was unvalidated.

Exploitable two ways, both confirmed live against the pre-fix code (each returned `200`):
- **Price bypass + privilege escalation:** buy your own ₹1 `booking_commission` order (100 paise), then complete it with `flow=provider_registration` and `reference_id=<any provider id>`. That activates a provider — potentially someone else's — for 1% of the ₹99 fee.
- **Free booking confirmation:** complete your own order against another user's `booking_id`, confirming their booking without paying its commission.

**Resolved 2026-07-17:** both routes now `400` if `payment.flow !== flow || payment.referenceId !== reference_id`, and pass the **stored** `payment.flow` / `payment.referenceId` into `handlePaymentSuccess(...)` rather than the body values (defense in depth — the body no longer reaches the side-effect handler at all). Two regression tests added to `backend/test/payments.test.ts` covering both exploits above; both were confirmed to fail against the old code (`expected 200 to be 400`) before the fix landed. Full suite: 47 passing.

**Lesson worth generalizing:** §1.3 fixed the specific check that had been demonstrated and wrote a test asserting exactly that check. The green suite then read as "payments are authorized," which is what hid this for a day. When fixing an authorization bug, enumerate *every* attacker-controlled input the handler consumes — here, `userId` was validated and `flow`/`reference_id` were not.

### 1.4 ✅ FIXED — weak/insecure config defaults could silently reach production
Originally filed as just `ADMIN_PASSWORD` defaulting to `adminpassword123`. Re-audit 2026-07-17 found the same pattern on two more variables, and the combination was materially worse than any one of them:

- **`JWT_SECRET` defaulted to the literal `'supersecretjwtkey12345!'`** (`config.ts:8`). Combined with `middleware/auth.ts:42-51` — where `sub === 'admin-system'` grants full admin with **no database lookup at all** — anyone who could read that constant could mint a permanent admin token offline. In a public repo, the secret is public.
- **`APP_ENV` defaulted to `'development'`** (`config.ts:10`). This is the *exact* failure mode §1.1 was burned by: the `/dev/seed` fix deleted the route but left the fail-open default in place. With `APP_ENV` unset in production, `routes/auth.ts:125` accepts the universal OTP `123456` for **any phone number** and `/otp/send` returns the live OTP in the response body — total account takeover from one missing variable. It also silently disabled any `IS_PROD`-gated guard, including the ones prescribed by this very section.

**Resolved 2026-07-17:** `config.ts` now validates at startup and throws rather than guessing:
- `APP_ENV` is **required** and must be one of `development | test | production`. No default — an unset value is an operator mistake, not a request for dev mode.
- `JWT_SECRET`, `ADMIN_PASSWORD`, `ADMIN_BOOTSTRAP_SECRET` must be set to a real value when `APP_ENV=production`; startup fails if any is unset, equal to its dev default, or still a `change_me_*` placeholder from `.env.production.example` (that last check exists because the template's placeholders are *not* the dev defaults and would otherwise have passed validation).
- `CORS_ORIGINS=*` is rejected in production; `MOCK_PAYMENTS=true` in production logs a loud warning (legitimate before go-live, so not fatal).

Validated by running the config module as a real subprocess across nine env combinations — every guard throws with a message naming the offending variable, and `development` / `test` / a fully-populated production config all load clean. Server boot re-confirmed (`GET /api` → 200); full suite 47 passing; `tsc --noEmit` clean. `.env.example` and `.env.production.example` updated to document which variables are required vs. defaulted.

### 1.6 ✅ FIXED — settlement was not idempotent, and there was no webhook at all
Found 2026-07-17 while wiring up real Razorpay. Two coupled problems:

**No webhook receiver.** The only path that settled a payment was the browser callback into `/payments/verify`. That callback is best-effort — if the customer closes the tab (or their connection drops) after paying on Razorpay's UI, it never fires. Razorpay captures the money, but the app never activates the provider or confirms the booking: **charged, nothing delivered, no record**. This is the single most common way a Razorpay integration loses money in production, and it had no mitigation here.

**`/verify` had no idempotency guard.** It never checked `payment.status === 'paid'` before running side effects, so a replayed callback ran `handlePaymentSuccess` again — which for `provider_registration` **inserts a listing every time**. Latent while `/verify` was the only settlement path; adding a webhook would have made double-delivery the *normal* case (webhook + callback both fire, by design), turning a latent bug into duplicate listings on essentially every real registration. The webhook could not be added safely until this was fixed.

**Resolved 2026-07-17:**
- Added `settlePaymentOnce()`, which settles via a conditional `UPDATE ... WHERE order_id = ? AND status <> 'paid' RETURNING`. The DB does the locking: whichever caller wins gets a row and runs the side effects; the loser gets zero rows and skips them. Correct under a genuine webhook/callback race, not just sequential replay. `/mock/complete` and `/verify` both route through it.
- Added `POST /api/payments/webhook`, authenticated by `X-Razorpay-Signature` (HMAC-SHA256 of the raw body against `RAZORPAY_WEBHOOK_SECRET`) rather than a bearer token, since Razorpay has no session. Handles `payment.captured` and `order.paid`; acknowledges everything else with 200 so Razorpay stops retrying, and returns 500 only on transient failures where a retry is actually wanted. Signature comparison is `crypto.timingSafeEqual` (also applied to `/verify`, which previously used `!==`).
- `app.ts` mounts `express.raw()` for the webhook path **ahead of** `express.json()` — the signature covers the exact bytes sent, and re-serialising parsed JSON changes them.
- `config.ts` now refuses to start when `MOCK_PAYMENTS=false` and any Razorpay variable is missing, and rejects `rzp_test_*` keys under `APP_ENV=production`.

Validated: 10 new tests in `backend/test/webhook.test.ts` (signature rejection incl. a body-tamper case, unhandled-event ack, unknown-order ack, browser-never-returns settlement, triple delivery → one listing, webhook/callback race → one listing, `order.paid`). The two idempotency tests were confirmed to **fail** with the `status <> 'paid'` guard removed, so they genuinely cover the regression. The README's local-webhook curl snippet was executed verbatim against a live server and returns the documented output. Full suite: **57 passing**.

**Still open (see the table below):** `/payments/order` does not verify that `reference_id` belongs to the caller (item F).

---

## 2. Documentation drift — the docs describe a different app than the code

### 2.1 ✅ FIXED — `memory/PRD.md` described the wrong backend entirely
The old PRD said: *"Backend: FastAPI + motor (async MongoDB) + PyJWT + razorpay SDK"* and *"DB: MongoDB (`one_darjeeling`)"*. The actual code (`backend/`) is **Express 5 + TypeScript + Drizzle ORM + PostgreSQL**, confirmed by `backend/src/db.ts`, `backend/drizzle.config.ts`, and `docker-compose.yml` (which provisions `postgres:15-alpine`, not Mongo).

**Resolved 2026-07-16:** `memory/PRD.md` has been fully rewritten against the current codebase — personas, user journeys, feature inventory (with an explicit done/not-done table), business model, data model, API surface (pointing at the live Swagger docs rather than duplicating it), tech stack, design system, and backlog. It also surfaces a real design-vs-implementation drift found while rewriting it: the design brief specifies Bengali as the default UI language, but `frontend/src/i18n.ts` actually defaults to English — worth a product decision on which one is intended going forward.

### 2.2 `backend/.env.example` is from the Mongo era and is missing the one variable the app requires to boot
It lists `MONGO_URL` and `DB_NAME`, neither of which `backend/src/*` reads. `backend/src/db.ts:9` does `if (!process.env.DATABASE_URL) throw new Error(...)` — **following `.env.example` verbatim produces a backend that crashes on startup.** `PORT` is also absent from the example (defaults to 8000 in code, but not documented).

**Action needed:** rewrite `.env.example` to match `config.ts`/`db.ts` (done ad hoc for this session in the README; should be committed to the file itself).

### 2.3 `test_result.md` / testing protocol reflects a different agent workflow
The file's YAML testing-protocol header describes a `main_agent` / `testing_agent` handoff convention (task file for coordinating with a separate testing AI agent) that doesn't correspond to anything in this repo's actual CI or scripts — there's no test runner wired to read/write it (`backend/package.json`'s `test` script is a no-op placeholder: `"echo \"Error: no test specified\" && exit 1"`). It reads as leftover scaffolding from the AI app-builder platform (see §4) this project originated on, not as live process documentation.

**Action needed:** decide if this workflow is still wanted. If not, it's safe to remove; if so, it should say who/what actually runs "the testing agent" in this repo today.

### 2.4 `tests/` directory is an empty stub
`tests/__init__.py` is the only file — a leftover Python test package scaffold with nothing in it, inconsistent with the now-TypeScript backend. `test_reports/pytest/` is similarly an empty placeholder (`.gitkeep` only), while `test_reports/iteration_1.json` documents a *previous* FastAPI-based backend's test run (references Mongo-era behavior, a `/app/memory/test_credentials.md` path, and a public "emergent" testing URL that doesn't exist in this repo's deployment).

**Action needed:** either remove these Python-era stubs or replace with real backend tests (there currently are none — see §3.3).

---

## 3. Correctness / dependency issues

### 3.1 ✅ FIXED — `frontend/package.json` had an unresolved peer-dependency conflict
`react-day-picker@8.10.1` peer-required `date-fns@^2.28.0 || ^3.0.0`, but the project pinned `date-fns@4.1.0`. Confirmed live pre-fix: `npm install` in `frontend/` failed outright with `ERESOLVE`.

**Resolved 2026-07-16:** investigation showed `react-day-picker` was only ever imported by one file, `frontend/src/components/ui/calendar.jsx` — an unused shadcn scaffold component that no page or component in the app actually imports. `date-fns` itself was never imported directly anywhere. Rather than downgrade/upgrade to paper over the mismatch, both were removed as genuinely dead weight, along with the now-orphaned `calendar.jsx`. Also removed `frontend/package-lock.json`, a stale committed npm lockfile alongside the project's actual `yarn.lock` (the project pins Yarn via `packageManager`) — a second, undocumented source of package-manager drift. Validated: `yarn install` reinstalls clean with no peer warnings for either package; `node_modules` no longer contains `date-fns` or `react-day-picker`.

**Residual, deliberately not fixed:** clearing this conflict exposed a *second*, unrelated `npm install` failure — `react-scripts@5.0.1` (Create React App) peer-requires `typescript@^3.2.1 || ^4`, while the project intentionally runs `typescript@5.5.4`. This is not dead code to remove; it's CRA being unmaintained and never updating its peer range past TS4, and Yarn Classic already tolerates it (hence why this project pins Yarn for the frontend in the first place). Downgrading TypeScript to satisfy npm's stricter resolution would be a real regression for no benefit. See §3.4 for the broader CRA/React 19 fragility this is part of.

### 3.2 ✅ FIXED — Root `package.json`'s `install:all` silently assumed npm everywhere
`npm install --prefix frontend` hit the ERESOLVE failure above — the root convenience script didn't account for `frontend/` being a Yarn-managed package, and (per §3.1's residual finding) never fully can be made npm-clean without downgrading TypeScript against the project's intent.

**Resolved 2026-07-16:** `install:all` now shells out to Yarn (via Corepack) for the `frontend/` leg specifically, instead of pretending plain npm works there.

### 3.3 ✅ FIXED — No backend tests existed
`backend/package.json`'s `test` script used to be a placeholder that always exited 1. All "testing" evidence in the repo (`test_result.md`, `test_reports/iteration_1.json`) is manual/historical QA notes from an earlier iteration of the app, not an automated suite — there was no regression safety net for the auth/payments/bookings logic described above.

**Resolved 2026-07-16:** added Vitest + Supertest, an isolated `one_darjeeling_test` Postgres database (same container, separate DB — `vitest.config.ts` injects `DATABASE_URL` before any app module loads, so it never touches the dev database), and split `src/server.ts` into `src/app.ts` (the exportable Express app, testable without binding a port) + a thin `server.ts` entrypoint. 36 tests across 5 files (`auth`, `listings`, `payments`, `bookings`, `admin`) cover the core flows plus explicit regression coverage for every authorization fix in §1 — e.g. a dedicated test asserts a plain tourist gets 403 creating a listing, another asserts user B gets 403 completing user A's payment order. Run via `npm test` in `backend/`. Confirmed the test DB is fully isolated from the dev DB (dev retained its 31 listings after a full test run; test DB is independently seeded/truncated per test).

### 3.4 `frontend/craco.config.js` / CRA + React 19 combination
`react-scripts@5.0.1` (CRA) was never officially updated for React 19; the project pins React 19.0.0 alongside it via `craco` overrides and a long `resolutions` block in `package.json` to force-compatible transitive versions. It builds and runs (verified: `webpack compiled successfully` on `yarn start`), but this is a manually-patched combination, not an officially supported one — future dependency bumps are likely to reintroduce breakage that the `resolutions` block is currently suppressing.

**Action needed:** no immediate action; flagging as a maintenance risk. A future migration to Vite (already used successfully in `frontend-admin/`) would remove the need for CRA/craco entirely.

### 3.5 `ProviderOnboard.tsx` redirects to login on a direct/refreshed page load, even when already authenticated
`frontend/src/pages/ProviderOnboard.tsx:24-26` — `useEffect(() => { if (!user) nav('/login'); }, [user, nav])` doesn't check `authLoading`. `AuthContext` starts every fresh page load with `user: null` while its `GET /auth/me` call is in flight; this effect fires on that very first render and redirects to `/login` before the auth check ever resolves — even for a fully logged-in provider. Found while browser-testing the listing-management feature (§ provider dashboard work, 2026-07-16): navigating directly to `/provider/onboard` (e.g. a hard refresh, or a bookmarked link) bounces a logged-in provider back to the login screen. `ProviderDashboard.tsx`'s equivalent guard does this correctly (`if (authLoading) return; if (!user) { nav('/login'); return; }`) — `ProviderOnboard.tsx` is missing the `authLoading` check that its sibling page already has.

**Action needed:** add the same `authLoading` guard to `ProviderOnboard.tsx`. One-line fix, not made here to stay in scope of the listing-management task that surfaced it.

---

## 4. Non-app scaffolding in the repo

`.agents/` (an AI coding-agent "kit" — skills, workflows, rules for AI assistants) and the `@emergentbase/visual-edits` dev dependency in `frontend/package.json` indicate this project originated on an AI app-builder platform (referenced directly in `test_reports/iteration_1.json` as "public URL" testing against `/app/...` paths). None of this is wired into the running application — it's tooling for AI-assisted development, not product code. Worth knowing so it isn't mistaken for application architecture, but no action needed unless the team wants to strip AI-builder-specific tooling out.

---

## Suggested priority order

1. ~~§1.2 and §1.3 (missing authorization checks)~~ — **done**.
2. ~~§1.1 (`/dev/seed`)~~ — **done**.
3. ~~§2.1 (PRD rewrite)~~ — **done**.
4. ~~§2.2 (`.env.example` rewrite)~~ — **done**.
5. ~~§3.1/§3.2 (dependency conflict + root install script)~~ — **done**.
6. ~~§3.3 (backend test suite)~~ — **done**.
7. ~~§1.5 (payment reference binding)~~ and ~~§1.4 (config fails closed)~~ — **done 2026-07-17**.
8. Everything else (§2.3, §2.4, §3.4, §3.5, §4) — lower urgency, mostly cleanup/decisions rather than bugs.

---

## Still open — found 2026-07-17, not yet fixed

These came out of the same re-audit that produced §1.4/§1.5. None are fixed; listing them so they aren't lost.

| # | Issue | Where | Why it matters |
| - | ----- | ----- | -------------- |
| A | **Rate limiting is inoperative in production.** Keys on `req.ip`, but `app.set('trust proxy')` is never called. Behind system Nginx → container Nginx, every request carries the same proxy IP. | `middleware/rateLimiter.ts:24` | All users share one bucket: brute-force protection on `/admin/login` is gone, *and* the first 5 OTP requests/minute lock out the whole platform. Also in-memory, so it resets every deploy. |
| B | **`drizzle-kit push --force` runs on every prod container start.** | `backend/Dockerfile:13` | `push --force` reconciles the DB to the schema without asking — a renamed/removed column silently drops production data on deploy. No migration files, and no backup of `pg_data_prod`. |
| C | **Deploy workflow runs no tests.** Push to `main` → `git reset --hard` → rebuild. | `.github/workflows/deploy.yml` | §3.3's suite exists precisely as a regression net and nothing runs it. (It would not have caught §1.5 — see that entry's lesson — but it's the missing half of that work.) |
| D | **Password hashing is PBKDF2 at 1,000 iterations.** | `middleware/auth.ts:10-18` | OWASP guidance is ~600,000 for PBKDF2-SHA512 — this is ~600× under, and it only protects admin passwords. |
| E | **No error handler or 404 handler.** `app.ts` ends at the router mounts. | `src/app.ts` | Thrown async routes hit Express's default handler, leaking stack traces whenever `APP_ENV !== 'production'`. |
| F | **`/payments/order` doesn't verify `reference_id` belongs to the caller.** | `routes/payments.ts:121` | Same root cause as §1.5 (reference IDs unvalidated against the caller), though §1.5's fix means an unowned reference can no longer be *settled*. |
| G | **`depends_on` without `condition: service_healthy`.** | `docker-compose.prod.yml` | Backend races Postgres on boot; combined with (B), the auto-migration runs against a DB that may not be ready. |
| H | **`backend/package.json` pins `typescript: ^7.0.2`** — TypeScript 7 (the native port) as the production build compiler, via a drifted caret range rather than a deliberate choice. | `backend/package.json` | Worth an explicit decision. |
