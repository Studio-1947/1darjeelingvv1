# Repo Audit — Findings & Investigation Needed

Audited 2026-07-16. Scope: `backend/`, `frontend/`, `frontend-admin/`, root config, and docs. Dev environment was stood up locally to validate several of these findings live (Postgres via Docker, backend on :8000, frontend on :3000, admin on :5173).

Severity is relative to "before this goes anywhere near a public/production deployment" — none of this blocks local development.

---

## 1. Security — needs a decision, not just a note

### 1.1 `POST /api/dev/seed` is unauthenticated, gated only by an env var
`backend/src/routes/admin.ts:17` — the only check is `if (IS_PROD) return 403`, and `IS_PROD` comes from `APP_ENV === 'production'` (`backend/src/config.ts`), which **defaults to `'development'` if `APP_ENV` is unset**. Confirmed live: `curl -X POST http://localhost:8000/api/dev/seed` succeeded with no credentials and inserted 27 listings.

If a deployment ever forgets to set `APP_ENV=production` explicitly, this becomes a public, unauthenticated write endpoint. There is already a separate, properly authenticated `/api/admin/seed` (same logic, duplicated) — **`/dev/seed` should either be removed or the duplication resolved**, and production-safety should not rely on a single env var defaulting the *wrong* way.

**Action needed:** decide whether `/dev/seed` is deleted (recommended — `/admin/seed` covers the same need for anyone with an admin token) or explicitly hard-disabled in any real deployment via infra config, not just `.env`.

### 1.2 `POST /api/listings` has no role/ownership check
`backend/src/routes/listings.ts:78` — any authenticated user (tourist or provider, doesn't matter) can create a listing, and can pass an arbitrary `provider_id` in the body that is trusted as-is (`providerId: provider_id || req.user.id`). Nothing checks the caller is an active/paid provider, or that `provider_id` belongs to them.

**Impact:** any logged-in tourist can spam the discovery feed with fake listings, or attach a listing to someone else's `provider_id` so it shows up as theirs. Since login only requires a phone number + mock OTP, this is cheap to do.

**Action needed:** decide the intended authorization model (only `role === 'provider'` with `providerPaid === true`? only via `/providers/onboard` → payment flow, never directly?) and enforce it here.

### 1.3 `POST /api/payments/mock/complete` has no ownership check
`backend/src/routes/payments.ts:152` — looks up the payment purely by `order_id` and never checks `payment.userId === req.user.id`. Any authenticated user who obtains/guesses another user's `order_id` can mark that order paid and trigger its side effects (activate someone else's provider listing, or confirm someone else's booking). `order_id`s are UUID-derived so not trivially guessable, but this is real-money-adjacent logic (provider activation, booking confirmation) with a missing authorization check that costs one `eq()` clause to fix. The same gap does not apply to `/verify` (real Razorpay flow) in practice, since a valid HMAC signature can't be forged without the secret — but it has the same missing ownership check on principle.

**Action needed:** add `and(eq(payments.orderId, order_id), eq(payments.userId, req.user.id))` to both routes.

### 1.4 `ADMIN_PASSWORD` default is a real, weak, checked-in-adjacent default
`backend/src/config.ts:16` — `ADMIN_PASSWORD` defaults to the literal string `adminpassword123` if the env var isn't set, and this default is also what's written into `.env.example`-equivalent instructions and this very investigation's dev `.env`. Fine for local dev; **must not reach any shared/staging/production environment.**

**Action needed:** treat this as a deployment checklist item — fail startup (rather than silently default) if `APP_ENV=production` and `ADMIN_PASSWORD`/`JWT_SECRET`/`ADMIN_BOOTSTRAP_SECRET` are unset or equal to their dev defaults.

---

## 2. Documentation drift — the docs describe a different app than the code

### 2.1 `memory/PRD.md` describes the wrong backend entirely
The PRD says: *"Backend: FastAPI + motor (async MongoDB) + PyJWT + razorpay SDK"* and *"DB: MongoDB (`one_darjeeling`)"*. The actual code (`backend/`) is **Express 5 + TypeScript + Drizzle ORM + PostgreSQL**, confirmed by `backend/src/db.ts`, `backend/drizzle.config.ts`, and `docker-compose.yml` (which provisions `postgres:15-alpine`, not Mongo). The migration from FastAPI/Mongo to Express/Postgres happened at some point but the PRD was never updated.

**Action needed:** either regenerate the "Architecture" section of the PRD from the current code, or add a visible "superseded" banner pointing at the real stack — right now anyone onboarding from the PRD will set up the wrong database.

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

### 3.1 `frontend/package.json` has an unresolved peer-dependency conflict
`react-day-picker@8.10.1` peer-requires `date-fns@^2.28.0 || ^3.0.0`, but the project pins `date-fns@4.1.0`. Confirmed live: `npm install` in `frontend/` fails outright with `ERESOLVE`. `yarn install` (the package manager actually pinned via `packageManager` and `yarn.lock`) resolves it silently with a warning, papering over the same conflict rather than fixing it. Whether `react-day-picker`'s date-fns v4 usage actually works at runtime hasn't been verified beyond "it compiles."

**Action needed:** either downgrade `date-fns` to `^3.x`, or upgrade `react-day-picker` to a version with v4 peer support, and confirm no one runs `npm install` here expecting it to work (the root `package.json`'s `install:all` script does exactly that and will break).

### 3.2 Root `package.json`'s `install:all` silently assumes npm everywhere
`npm install --prefix frontend` will hit the same ERESOLVE failure as above — the root convenience script doesn't account for `frontend/` being a Yarn-managed package. Anyone running `npm run install:all` from the repo root hits a hard failure on the frontend leg.

**Action needed:** either make `install:all` shell out to Yarn for `frontend/`, or resolve 3.1 so plain npm works everywhere.

### 3.3 No backend tests exist
`backend/package.json`'s `test` script is a placeholder that always exits 1. All "testing" evidence in the repo (`test_result.md`, `test_reports/iteration_1.json`) is manual/historical QA notes from an earlier iteration of the app, not an automated suite. There is currently no regression safety net for the auth/payments/bookings logic described above.

**Action needed:** decide if automated tests are in scope; if so, the payment-flow and auth routes (§1) are the highest-value places to start given they already have at least one missing-authorization-check finding each.

### 3.4 `frontend/craco.config.js` / CRA + React 19 combination
`react-scripts@5.0.1` (CRA) was never officially updated for React 19; the project pins React 19.0.0 alongside it via `craco` overrides and a long `resolutions` block in `package.json` to force-compatible transitive versions. It builds and runs (verified: `webpack compiled successfully` on `yarn start`), but this is a manually-patched combination, not an officially supported one — future dependency bumps are likely to reintroduce breakage that the `resolutions` block is currently suppressing.

**Action needed:** no immediate action; flagging as a maintenance risk. A future migration to Vite (already used successfully in `frontend-admin/`) would remove the need for CRA/craco entirely.

---

## 4. Non-app scaffolding in the repo

`.agents/` (an AI coding-agent "kit" — skills, workflows, rules for AI assistants) and the `@emergentbase/visual-edits` dev dependency in `frontend/package.json` indicate this project originated on an AI app-builder platform (referenced directly in `test_reports/iteration_1.json` as "public URL" testing against `/app/...` paths). None of this is wired into the running application — it's tooling for AI-assisted development, not product code. Worth knowing so it isn't mistaken for application architecture, but no action needed unless the team wants to strip AI-builder-specific tooling out.

---

## Suggested priority order

1. **§1.2 and §1.3** (missing authorization checks) — small, well-defined code changes, real integrity risk even in mock-payment mode.
2. **§1.1** (`/dev/seed`) — delete or hard-gate; trivial fix, currently live-exploitable if `APP_ENV` is ever misconfigured.
3. **§2.1/§2.2** (PRD + `.env.example` rewrite) — no code risk, but actively misleads anyone onboarding.
4. **§3.1/§3.2** (dependency conflict + root install script) — fix once, stop yarn/npm from silently diverging.
5. Everything else (§1.4, §2.3, §2.4, §3.3, §3.4, §4) — lower urgency, mostly cleanup/decisions rather than bugs.
