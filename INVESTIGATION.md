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
