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

### 3.5 ✅ FIXED — `ProviderOnboard.tsx` redirected to login on a direct/refreshed page load, even when already authenticated
`frontend/src/pages/ProviderOnboard.tsx:24-26` — `useEffect(() => { if (!user) nav('/login'); }, [user, nav])` doesn't check `authLoading`. `AuthContext` starts every fresh page load with `user: null` while its `GET /auth/me` call is in flight; this effect fires on that very first render and redirects to `/login` before the auth check ever resolves — even for a fully logged-in provider. Found while browser-testing the listing-management feature (§ provider dashboard work, 2026-07-16): navigating directly to `/provider/onboard` (e.g. a hard refresh, or a bookmarked link) bounces a logged-in provider back to the login screen. `ProviderDashboard.tsx`'s equivalent guard does this correctly (`if (authLoading) return; if (!user) { nav('/login'); return; }`) — `ProviderOnboard.tsx` is missing the `authLoading` check that its sibling page already has.

**Action needed:** add the same `authLoading` guard to `ProviderOnboard.tsx`. One-line fix, not made here to stay in scope of the listing-management task that surfaced it.

**Fixed 2026-08-04.** The guard now lives in `frontend/src/components/provider/onboard/useProviderOnboard.ts` (the effect moved into that hook after the page was split into step components): it returns early while `authLoading` is true and only redirects once the auth check has actually resolved.

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
8. ~~§1.6 (webhook + idempotent settlement)~~ — **done 2026-07-17**.
9. ~~§5.A–§5.G (rate limiting, migrations, CI gate, password hashing, error handling, order ownership, healthcheck)~~ — **done 2026-07-17**.
10. Remaining: §5.H (TypeScript 7 decision), §3.5 (`ProviderOnboard` authLoading guard), §2.3, §2.4, §3.4, §4 — cleanup and decisions rather than bugs.

---

## 5. Second-wave findings — 2026-07-17

Found in the re-audit that produced §1.4/§1.5. **A–G are now fixed** (2026-07-17); H remains a decision.

### 5.A ✅ FIXED — rate limiting was inoperative in production
`middleware/rateLimiter.ts` keyed on `req.ip`, but `app.set('trust proxy')` was never called. Both Nginx layers append `$proxy_add_x_forwarded_for` (verified in `deploy/host-nginx-site.conf.example` and `deploy/nginx/app.conf`), so every request reached Express carrying the proxy's address: **all callers shared one bucket**. Brute-force protection on `/admin/login` was gone, and the first 5 OTP requests in a minute locked out the entire platform.

**Fixed:** `app.set('trust proxy', TRUST_PROXY_HOPS)` — a hop **count** (2 in production, 0 in dev), deliberately not `true`. `true` trusts the leftmost `X-Forwarded-For` entry, which is entirely attacker-supplied; counting from the right means a forged prefix is ignored. Also swept expired entries (the store grew once per unique IP forever) and added a `Retry-After` header.

The limiter previously early-returned on `APP_ENV === 'test'`, so it had **zero test coverage** — it was untestable by construction. `rateLimiter()` now takes an `{ enabled }` override. 7 tests in `test/rateLimiter.test.ts`, including one asserting the spoofing case and one that *documents the old bug* (unrelated clients sharing a bucket without trust proxy). Verified `TRUST_PROXY_HOPS` resolves to 2/0/0 for production/development/test.

**Still true:** the store is in-memory, so counters reset on deploy and are per-process. Fine for one backend container; a second instance needs Redis.

### 5.B ✅ FIXED — `drizzle-kit push --force` ran on every production container start
`backend/Dockerfile` ran `push --force` at each boot, which diffs the live database against `schema.ts` and reconciles it **without asking** — a renamed or dropped column would silently take production data with it. There were no migration files and no backup of `pg_data_prod`.

**Fixed:** generated `drizzle/0000_hard_caretaker.sql` and switched the `CMD` to `drizzle-kit migrate`, which applies versioned SQL tracked in a `__drizzle_migrations` ledger (each migration runs once; re-deploys are no-ops). Confirmed safe to adopt because production has not been deployed yet (no data to baseline around). Validated by migrating a scratch database from empty and diffing `information_schema.columns` against the push-built schema: **62 columns, identical**, and a second `migrate` run is a clean no-op. README documents the generate→review→commit flow and warns off `push`.

**Follow-up found while revalidating (same day) — the first version of this fix had a hole.** `scripts/setup-test-db.ts` built the test schema with `drizzle-kit push`, i.e. straight from `schema.ts`, while production ran `migrate`. So a developer who edited `schema.ts` and forgot `npm run db:generate` would get a **green suite and a broken production deploy** — the CI gate added in §5.C could not have caught it. Demonstrated by adding a column to `schema.ts` without generating: `push` silently created it in the test database.

Closed two ways: `test:setup` now runs `migrate` (tests execute exactly the path production does — re-running the same demonstration, the test database correctly *lacks* the un-migrated column), and CI runs `drizzle-kit generate` and fails if it produces anything, which catches drift even for a column no test touches yet. Both verified: in-sync → `No schema changes, nothing to migrate` and a clean tree; drifted → new migration file appears and the check fails.

This is the §1.3/§1.5 lesson again, one level up: the *fix* was verified, but the *test infrastructure around the fix* was still using the old, more permissive path.

### 5.C ✅ FIXED — the deploy workflow ran no tests
Push to `main` went straight to `git reset --hard` + rebuild, so §3.3's suite never guarded a release.

**Fixed:** `.github/workflows/deploy.yml` now has a `test` job (Postgres service + health-gated wait, `npm ci`, `test:setup`, `tsc --noEmit`, `npm test`) and `deploy` declares `needs: test`.

This surfaced a prerequisite: the `one_darjeeling_test` database was created **by hand and documented nowhere** — only `vitest.config.ts` even named it — so `npm test` failed on a fresh clone and could not run in CI at all. Added `backend/scripts/setup-test-db.ts` (`npm run test:setup`), verified by dropping the test database entirely and rebuilding it from zero: **80 tests pass**, and re-running is idempotent.

### 5.D ✅ FIXED — password hashing was PBKDF2 at 1,000 iterations
`middleware/auth.ts` used 1,000 iterations — roughly 200× under OWASP's floor — and compared hashes with `!==`.

**Fixed:** 210,000 iterations. (Note: the first-pass audit cited ~600,000; that is the **PBKDF2-SHA256** figure. This code uses SHA512, whose OWASP floor is 210,000 — using 600k would have been ~3× the intended work factor for no benefit.) Measured ~120ms/hash, which is fine for a rare admin login and is precisely the operation worth making slow. Comparison is now `crypto.timingSafeEqual`.

Hashes are self-describing — `pbkdf2$<digest>$<iterations>$<salt>$<hash>` — so the work factor can rise again without locking anyone out. Legacy `salt:hash` values still verify at 1,000 iterations and are **transparently re-hashed on next successful login** (the only moment the plaintext exists), so no admin is locked out and no password reset is needed. 9 tests in `test/password.test.ts`, including the legacy round-trip, the in-place upgrade, and that a *failed* login neither admits nor upgrades.

### 5.E ✅ FIXED — no error handler or 404 handler, leaking SQL to callers
Worse than first reported. I flagged this as leaking stack traces "whenever `APP_ENV !== 'production'`" — in fact Express's built-in handler decides that by reading **`NODE_ENV`**, which this app never sets anywhere (it uses `APP_ENV`). So the leak was unconditional, **production included**.

Confirmed live: a 500 returned an HTML page containing the failing `insert into "listings" (...)` statement, its column list, and its parameter values — schema disclosure to any caller who can trigger an error.

**Fixed:** JSON 404 handler and a central error handler in `app.ts`. 5xx responses are now a generic `{"detail":"Internal server error"}` with the real error logged server-side; 4xx keep their own message (malformed JSON now correctly returns **400** rather than a 500 HTML page); CORS rejections are tagged `403`. 4 tests in `test/errors.test.ts` assert no stack frames, file paths, or SQL reach the response.

### 5.F ✅ FIXED — `/payments/order` didn't verify `reference_id` belongs to the caller
Graded "medium" initially; on closer reading it was a live escalation. §1.5 stopped an order being *redeemed* against someone else's reference, but nothing stopped an attacker **creating** the order that way: pay ₹1 with `reference_id` set to a stranger's booking and `handlePaymentSuccess` confirms *their* booking; pay ₹99 against a stranger's provider and it activates. Confirmed pre-fix — all three probes returned `200`.

**Fixed:** `assertOwnsReference()` validates at order creation that the reference exists (`404`) and belongs to the caller (`403`), and refuses unknown flows by default so a future flow can't be added without an ownership rule. 3 regression tests.

### 5.G ✅ FIXED — `depends_on` without `condition: service_healthy`
The backend raced Postgres on boot, and with (B) the auto-reconcile fired at a database that might not be up. **Fixed:** `pg_isready` healthcheck on the postgres service + `condition: service_healthy` on the backend. Validated with `docker compose config`.

### 5.H ⏳ OPEN — `backend/package.json` pins `typescript: ^7.0.2`
TypeScript 7 (the native port) is the production build compiler, arrived at via a drifted caret range rather than a deliberate choice. `tsc --noEmit` and `npm run build` are both clean on it today, so this is a decision to make rather than a bug: pin it intentionally, or move back to a 5.x line.

---

## 6. Third-wave findings — 2026-07-20

### 6.A 🟡 PARTIALLY RESOLVED — outbound messaging was never built; two sites stub it and report success

Found while designing the OTP provider layer. The backend has two places that must send a
message to a user, and **both are stubbed with a dev-only `log.info` that does nothing in
production while reporting success to the caller.** No SMS, WhatsApp, or email provider
exists anywhere in `backend/`.

| Site | Dev behaviour | Production behaviour |
| --- | --- | --- |
| `src/routes/auth.ts:69` — OTP delivery | returns the code in the response body | nothing sent; still returns `{ sent: true }` |
| `src/routes/payments.ts:63` — booking confirmation | logs `[MOCK NOTIFY]` | nothing sent; no error, no signal |

**Why this is a launch blocker, not a rough edge:**

- **OTP:** production login is impossible. A user requests a code, receives nothing, and
  `/auth/otp/verify` requires an exact DB match — the `123456` universal code is gated on
  `!IS_PROD`. This fails visibly and would be reported on day one.
- **Booking confirmation:** worse, because it fails *invisibly*. A tourist pays, the
  payment settles, the booking row is written, and both dashboards render correctly — but
  neither the tourist nor the provider is ever told. Nothing in the system indicates a
  failure. The discovery path is a guest arriving at a homestay that was never informed.

Note the contrast with payments, which has the correct shape already: `MOCK_PAYMENTS=false`
with incomplete Razorpay configuration **refuses to boot**. The messaging sites have no
equivalent guard, which is how both reached production-ready state unnoticed.

**Action:** the OTP half is designed in
`docs/superpowers/specs/2026-07-20-otp-provider-layer-design.md` — a provider-agnostic
messaging layer where real delivery is a config change, a half-configured provider fails at
boot, and the route cannot report `sent: true` without provider confirmation. That design
deliberately scopes the *notification* half out, because it needs product decisions first
(who is notified, on which events, in which of the four supported locales) and blocking the
login fix on those would be the wrong trade. **Booking notifications remain open and must
be closed before real bookings are taken.**

**Partially resolved 2026-07-20:** the OTP half is closed — `src/messaging/` provides a
provider-agnostic delivery layer, `/auth/otp/send` returns 502 rather than a false
`sent: true`, and a half-configured provider fails at boot. **The booking-confirmation half
remains open** and must be closed before real bookings are taken.

**✅ FULLY RESOLVED 2026-08-04.** The booking half is now closed on the same shape as the OTP half:

- `MessagingProvider` gained `sendNotification()`, with a closed set of `NotificationTemplate`
  values (Indian DLT rules mean each transactional message needs its own pre-approved template, so
  the list is fixed and registered, not invented per call). `msg91.ts` implements it against the
  Flow API — the OTP endpoint could never have carried these, since it only ever sends a code.
- `src/lib/notifications.ts` notifies the guest and the host on confirmation, and the guest on
  cancellation. It never throws (it runs after the money has moved and the booking is written, so
  a gateway timeout must not 500 a delivered service and invite a double payment) and it never
  fails silently: `bookings.tourist_notified_at`, `provider_notified_at` and `notify_error` record
  what actually happened, so a missing notification is a queryable fact instead of an absence.
- `NOTIFY_BOOKINGS` has **no default under `APP_ENV=production`** — the same treatment
  `MOCK_PAYMENTS` gets, and for the same reason. Silence is refused; an operator has to say
  whether bookings notify anyone. `NOTIFY_BOOKINGS=true` with `MESSAGING_PROVIDER=mock` boots but
  logs a loud error, because that combination records attempts and delivers nothing.
- Pinned by `test/bookingIntegrity.test.ts` — one test asserts a confirmed booking carries evidence
  that the guest was told, another asserts that a listing with no reachable host records *why*
  nobody could be reached rather than leaving the field blank.

### 6.B ✅ FIXED — OTPs never expired and had no per-code attempt cap

`otps.created_at` is written but never read by `/auth/otp/verify`, so an issued code stays
valid indefinitely until a newer one replaces it for that phone. There is also no per-code
attempt counter — only the 10/min per-IP route limit, which permits roughly 50 guesses per
window against a 6-digit code.

Harmless while codes are mock-only. Real the moment codes travel over SMS and linger in
inboxes. Both are addressed in the design doc above (5-minute TTL, 5-attempt cap, one
`attempts` column on `otps`).

**Resolved 2026-07-20:** `/auth/otp/verify` now enforces a 5-minute TTL (`OTP_TTL_SECONDS`)
and a 5-attempt cap (`OTP_MAX_ATTEMPTS`) backed by a new `otps.attempts` column, reset
whenever a code is reissued. The universal mock code is evaluated before the stored-row
checks so it still works with no row present.

### 6.C ✅ FIXED — per-phone rate limiter implemented on `/otp/send`

`/otp/send` was previously rate-limited per IP only (5 requests/60s). It now also runs a per-phone rate limiter (3 requests/60s per phone number, keyed by `req.body.phone`) via `rateLimiter`'s `keyExtractor` option in `middleware/rateLimiter.ts`. This prevents SMS pumping/billing abuse across rotating IPs and protects the 5-attempt verification cap on `/otp/verify`. Fixed 2026-08-06 with unit test coverage in `test/rateLimiter.test.ts`.

**Extended 2026-08-21 — daily budgets (`lib/otpSendBudget.ts`).** The per-minute limiter is in-memory and per-process, so its windows are wiped by every deploy, and it caps the *rate* without capping the *total*: 3/min sustained is 4,320 messages a day to a single number, and rotating the number costs an attacker nothing. That is noise under `MESSAGING_PROVIDER=mock` and a bill under a real provider, which is what SMS pumping monetises. `/otp/send` now also reserves against durable daily counters in `otp_send_counters` — `OTP_MAX_SENDS_PER_PHONE_PER_DAY` (default 10) and `OTP_MAX_SENDS_PER_DAY` (default 1000, platform-wide) — before a code is generated. The reservation is released if delivery fails, so a provider outage costs nobody their budget. Both refusals are 429 with `Retry-After`; the global one is deliberately vague in the response body and loud in the log. Covered by `test/otpSendBudget.test.ts` and `test/otpSendBudgetRoute.test.ts`.

---

## 7. Fourth-wave findings — 2026-07-21 (KYC/provider-lifecycle hardening pass)

### 7.A ⏳ OPEN — one-shot dedupe migrations leave orphaned private-bucket objects (chore)

Two migrations delete duplicate rows whose `file_key` pointed at objects in the private
storage bucket, and neither cleans up the object itself:

- `backend/drizzle/0004_tired_nemesis.sql` — dedupes `kyc_documents` down to one row per
  `(provider_id, doc_type)` before adding that unique index.
- `backend/drizzle/0005_chief_firelord.sql` — dedupes `providers` down to one row per
  `user_id` before adding *that* unique index. Since `kyc_documents.provider_id` has an
  `ON DELETE CASCADE` FK, deleting a duplicate provider row also cascades into deleting its
  `kyc_documents` rows (and, transitively, their storage objects go unreferenced too).

Both are one-shot, run-once-against-existing-data migrations, so leaving the storage side
as a manual/deferred cleanup is an acceptable trade-off for shipping the DB-level
correctness fix now rather than blocking it on wiring up a bucket-listing cleanup job. It is
a real leak, though (unreferenced objects sit in the private bucket indefinitely, at
whatever the storage cost is), and each migration file now carries a comment saying so.

**Action needed:** a one-off cleanup script (or a documented manual step) that lists the
private bucket, diffs against `file_key` values still referenced by `kyc_documents`, and
deletes what's left over — run once against any environment that has actually applied
0004/0005 against pre-fix data. Not implemented here; recorded so it isn't lost.

---

## 8. Fifth-wave findings — 2026-08-04 (pre-go-live gap audit)

Found by auditing the repo and the two live deployments against the question "what stops this
taking real bookings and real money today?". Every item below is closed unless marked otherwise.

### 8.A ✅ FIXED — two guests could pay for the same homestay and the same nights

`routes/bookings.ts` blocked a new booking only against rows already in status `confirmed`, and
`routes/payments.ts` flipped a booking to `confirmed` with **no availability check at all**. So two
travellers could each open a checkout for the same room and dates, each pay, and each be confirmed.
Nothing downstream noticed; both dashboards rendered a valid booking. The discovery path was two
parties arriving at one homestay.

Note for anyone reading older notes: a pending-hold fix for this was *described* in a 2026-07-31
bug-scan session and **never landed in the code**. It was still fully reproducible on `main`.

Closed in two halves, because one alone is not enough:

- **A hold window** (`lib/bookingAvailability.ts`, `BOOKING_HOLD_MINUTES`, default 15). A
  `pending_payment` booking now blocks overlapping dates while its checkout is live, and stops
  doing so once abandoned. This handles the common case without freezing a room on every closed tab.
- **A serialised re-check at settlement.** The hold cannot catch two checkouts that were both
  legitimately open when they started, and an overlap query alone cannot either — under READ
  COMMITTED each transaction reads a snapshot taken before the other committed, so both see "no
  clash". Confirmation therefore takes a `FOR UPDATE` row lock on the shared *listing* first, which
  forces concurrent confirmations for that listing into a queue. The loser is cancelled and
  **refunded**, and told why.

The pre-existing test asserting that overlapping pending bookings are always allowed was the bug
written down as an expectation; it is replaced in `test/bookings.test.ts` by tests for the hold
holding, the hold expiring, and non-homestay types being unaffected. `test/bookingIntegrity.test.ts`
covers the settlement race end to end.

### 8.B ✅ FIXED — money could be taken but never given back

There was no refund path anywhere: `grep -r refund backend/src` returned nothing. Cancelling a
booking flipped `status` to `cancelled` and kept the money, with no record that anything was owed.
The only way to return a rupee was the Razorpay dashboard, by hand, if anyone remembered.

`lib/refunds.ts` now owns this. It is idempotent per *payment* row rather than per booking, so a
double-cancel, a retried webhook and an admin clicking twice all converge on one refund. It never
throws — it runs on paths that have already taken the money and already committed the cancellation,
so a Razorpay outage must not 500 them — but a failed attempt is **recorded on the row**
(`refund_reason` set, `refunded_at` still null, `status` still `paid`, because the money genuinely
is still with the platform and reporting otherwise would make the books lie). That combination is
the operator's queue, served by `GET /api/admin/refunds/pending`, with
`POST /api/admin/payments/:id/refund` to retry or to refund out of band.

Wired into booking cancellation and into the double-booking guard above.

### 8.C ✅ FIXED — the site had no Terms, Refund or Contact page

Only `/privacy` existed. Beyond the legal exposure, this is a hard gate on the payment gateway:
Razorpay will not activate a live account without a reachable Terms & Conditions, Refund/Cancellation
policy and Contact page, and the Consumer Protection (E-Commerce) Rules, 2020 require a named
grievance route regardless of gateway.

Added `/terms`, `/refunds` and `/contact`, plus a `LegalDocument` component the four policy pages now
share (they were the same document shape differing only in content). The fee figures in the copy are
taken from `config.ts` — ₹12/yr support, ₹1 booking, ₹99 registration, ₹10–₹1,00,000 donations — and
the refund timelines match what `lib/refunds.ts` actually does.

**⚠ Still needs a human:** the copy is a good-faith draft written against what the code does, not
legal advice. Before go-live, someone with authority should confirm the named grievance officer,
the jurisdiction clause (currently Darjeeling, West Bengal), and GST/invoicing treatment.

### 8.D ✅ FIXED — no database backups

`deploy/VPS-RUNBOOK.md` §7 carried "No database backups" as a known issue from the day the box was
set up. Both stacks now run a `db-backup` sidecar (`deploy/backup/pg-backup.sh`): `pg_dump -Fc` on
start and every 24h, 14-day retention, into a volume deliberately separate from the data volume.
Restore and off-host copy procedures are documented in §7.1.

**⚠ Still needs a human:** the dumps live on the same host as the database. Copying them off the box
is a documented manual step, not an automated one — a dead VPS still takes both.

### 8.E ✅ FIXED — the HTML was served with no security headers

`app.ts` set the right headers, but only on responses Express produced — which is `/api` and nothing
else. The HTML, JS and CSS that actually execute in the browser came from the nginx container, bare:
no `X-Frame-Options`, no `X-Content-Type-Options`, no CSP. Confirmed against the live site.

Added to the two static locations in `deploy/nginx/app.conf`, per-location rather than at server
level for two reasons documented there: nginx's `add_header` does not inherit into a location that
declares any of its own, and a server-level rule would append a duplicate of every header to the
proxied `/api` responses that Express already sets.

### 8.F ✅ FIXED — assorted launch defects

- **Broken PWA/SEO assets.** `manifest.json` and `index.html` referenced `logo192.png`,
  `logo512.png` and a favicon that were not in the repo, so every visitor fetched 404s and iOS
  home-screen installs got a page screenshot. Generated from `logo.svg`; added `robots.txt` and
  `sitemap.xml`, neither of which existed.
- **No global API rate limit.** Only named endpoints were limited; listing search, the public feed,
  listing detail and reviews had no ceiling at all. Added a 300/min/IP backstop across `/api`, well
  above human browsing so the tighter per-route limits still bite first.
- **Missing translations.** `hi`, `bn` and `ne` were each missing 22 UI keys, including navigation
  items. (A raw key-count diff reports 111 per language, but the remainder are the policy
  documents, which are English-only by design and reach other languages by i18next fallback.)
  Filled. Three English strings whose em-dashes had been stripped by an earlier encoding accident
  were repaired at the same time.

### 8.G ✅ RESOLVED — the 1darjeeling.in backend is down

Not a code defect, but the single thing most in the way of going live. On `https://1darjeeling.in`
the SPA and admin console serve (200) while **every `/api` path returns 502** — nginx is up and
serving static files, so the failure is isolated to the `1darjeeling_in_backend` container. DNS and
TLS are fine; the GoDaddy registrar hold that previously blocked this domain has been lifted.

Most likely causes, in order: a startup refusal from `config.ts` (it throws on `change_me_*`
placeholders, an unset `MOCK_PAYMENTS` or `NOTIFY_BOOKINGS` under `APP_ENV=production`, a localhost
`MINIO_PUBLIC_URL`, or `CORS_ORIGINS=*`), then the drizzle migration hang when Postgres is
unreachable. Diagnose with `docker logs 1darjeeling_in_backend --tail 50` on the VPS.

The other stack, `onedarjeeling.duckdns.org`, is healthy.

**Resolved by 2026-08-04 afternoon.** `https://1darjeeling.in/api` answers `200`, `/api/listings`
serves, and a stack-specific `.env.1darjeeling-in.example` now exists so the placeholder-copying
that caused the outage cannot recur silently. Storage on that stack was still failing afterwards —
see §8.I, which turned out to be a different bug entirely.

### 8.I ✅ FIXED — object storage buckets were created lazily, so a fresh stack was never ready

Found 2026-08-04 while diagnosing `1darjeeling.in` reporting `{"status":"degraded"}` from
`/api/health` with `storage.ok=false` on a stack whose MinIO configuration was, it turned out,
entirely correct — credentials matched, MinIO was answering, nginx was proxying.

`bootstrapBucket()` and `bootstrapKycBucket()` were called **only** from inside `uploadToMinIO()`
and `uploadPrivate()` (`lib/s3.ts`). Bucket creation was therefore lazy: a freshly deployed stack
had no buckets at all until somebody happened to upload a photo. `1darjeeling.in` never did — its
listings were *copied in* from the other stack rather than uploaded — so no bucket was ever
created, `checkStorage()`'s `HeadBucket` failed forever, and the readiness endpoint reported
`degraded` on a healthy box. **This is the worst place for a false alarm: `/api/health` is
precisely what §8.E-era monitoring guidance tells an uptime monitor to watch, so it would have
paged continuously since the stack went up.** The secondary cost is that lazy creation makes the
first provider to add a listing photo the person who discovers any bucket-level misconfiguration.

Two things made the live diagnosis harder than it should have been, both worth remembering:

- **`/api/health` reports `err.message`** (`app.ts`). `HeadBucket` is a HEAD request, so *every*
  error response has an empty body and the AWS SDK falls back to the generic string
  `"UnknownError"` — it does not distinguish 403 from 404. Two hypotheses (rejected credentials,
  then a missing bucket) were argued from that string before it was established that the string
  carries no such information. It does prove MinIO *answered*, though: an unreachable MinIO
  surfaces `ENOTFOUND`/`ECONNREFUSED` verbatim.
- **An anonymous `GET /one-darjeeling/<key>` returned 403, not 404**, because MinIO answers
  `AccessDenied` rather than confirming a bucket does not exist. That reads like a policy problem
  and is not one. After the fix the same request correctly returns 404.

**Fixed:** `ensureBucketsExist()` creates both buckets at startup, called from `server.ts` after
`listen()`. It never throws — storage being unreachable at boot must not stop the server starting,
since every route not touching object storage still works and `/api/health` goes on reporting the
truth — and the calls in the upload paths are left in place as the retry for a MinIO that comes up
late. 6 tests in `test/storageBootstrap.test.ts`, which mock the S3 client itself rather than
`lib/s3` (stubbing the module would assert nothing, since the behaviour under test *is* what
`lib/s3` sends). Confirmed non-vacuous: with the KYC half removed 1 test fails, and with the
bootstrap stubbed out entirely 3 fail, including the one asserting a fresh stack reports healthy.
One test asserts that exactly one bucket is made anonymously readable and that it is the public
one — asserted over the whole set rather than the KYC bucket's absence, so a future third bucket
cannot quietly become public either. Full suite: **346 passing**.

The live stack was unblocked by hand (`mc mb` + `mc anonymous set download` on the public bucket
only) before this fix was written; the fix is what stops it recurring on the next deployment.

**Follow-up the same day — the manual unblock was itself wrong, and the fix above would not have
repaired it.** `mc anonymous set download` is a preset that grants `s3:ListBucket` *in addition to*
`s3:GetObject`. The app's own policy grants `s3:GetObject` alone, deliberately: a browser loading a
listing photo always knows the URL it wants, so the ability to enumerate every key buys nothing and
gives away the full index of everything ever uploaded, including images belonging to unpublished or
deleted listings. Confirmed live — `GET https://1darjeeling.in/one-darjeeling/` returned a complete
`<ListBucketResult>`, while the same request to `onedarjeeling.duckdns.org`, whose bucket the app
created itself, correctly returned `AccessDenied`.

The reason it would have persisted is the second half of the same design flaw: **the policy was
applied only at bucket creation.** A bucket whose permissions were wrong stayed wrong forever — no
redeploy would ever look at them again, and the only repair was somebody remembering to run `mc` by
hand. So `bootstrapBucket()` now re-asserts the policy on **both** paths, existing bucket included.
The trade-off is accepted deliberately: a manual policy change is reverted on the next restart,
because a manual policy change here is a mistake. Permissions on these two buckets should be
answerable by reading the code, not by asking who last typed a command on the server.

`bootstrapKycBucket()` gets the stricter treatment, since one mistyped bucket name in an
`mc anonymous` command is all it takes and the contents are government identity documents: when the
bucket already exists it reads the policy, and **any** policy found is logged at error level with a
`SECURITY:` prefix before being deleted. Logged rather than silently repaired on purpose — quietly
fixing it would hide the fact that someone's Aadhaar scans were reachable, which is the part a human
needs to know. The expected answer is `NoSuchBucketPolicy`, and that path logs nothing, so the alarm
stays meaningful.

Validated end to end against a real MinIO, not just the mocks: a throwaway instance was put into the
exact broken live state (`mc anonymous set download` on *both* buckets, both confirmed listable by
anonymous HTTP), the compiled server was booted against it, and it logged the `SECURITY:` line for
the KYC bucket and re-applied the public bucket's policy. Afterwards anonymous `LIST` returns
`AccessDenied` on both, anonymous `GET` of a known key still returns `200` with its content, the KYC
bucket reports `private`, and `/api/health` reports `ok`. Suite now **349 passing**; each new
assertion was confirmed to fail against the unfixed code.

### 8.J ⏳ OPEN — 1darjeeling.in serves every listing image from the staging domain

All six listings on the canonical domain store image URLs of the form
`https://onedarjeeling.duckdns.org/one-darjeeling/<uuid>` — the same UUIDs *and* titles as rows on
the staging stack, so they were copied across with staging's URLs intact. The objects live in
`minio_data_prod`, not `minio_data_in`.

Two consequences: production depends on the staging box for its photos, and because
`deploy/nginx/app.conf` stamps `X-Robots-Tag` on the image path as well as the HTML (added in the
§8-era SEO work, deliberately, so staging's copies of the pictures are not indexed under the wrong
domain), **production's listing photos are currently served `noindex, nofollow`**.

**Action needed:** either `mc mirror` the six objects into `minio_data_in` and rewrite
`listings.image` / `providers.images` / `users.avatar`, or — probably faster and definitely safer
for six images — re-upload them through the `1darjeeling.in` admin console, which now that §8.I is
fixed writes correct `https://1darjeeling.in/...` URLs. Do not run the URL rewrite before the
objects exist in the target bucket, or working images become 404s.

### 8.H ⏳ OPEN — test content is live in production

A tourist spot titled **"admin test"** with description **"qeqwe"** is served in the public feed on
`onedarjeeling.duckdns.org`. Delete it from the admin console's Tourist Spots tab before launch.
