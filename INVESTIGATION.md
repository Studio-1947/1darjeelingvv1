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

### 1.4 `ADMIN_PASSWORD` default is a real, weak, checked-in-adjacent default
`backend/src/config.ts:16` — `ADMIN_PASSWORD` defaults to the literal string `adminpassword123` if the env var isn't set, and this default is also what's written into `.env.example`-equivalent instructions and this very investigation's dev `.env`. Fine for local dev; **must not reach any shared/staging/production environment.**

**Action needed:** treat this as a deployment checklist item — fail startup (rather than silently default) if `APP_ENV=production` and `ADMIN_PASSWORD`/`JWT_SECRET`/`ADMIN_BOOTSTRAP_SECRET` are unset or equal to their dev defaults.

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
7. Everything else (§1.4, §2.3, §2.4, §3.4, §4) — lower urgency, mostly cleanup/decisions rather than bugs.
