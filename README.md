# 1 Darjeeling

Full-stack tourism + local marketplace for Darjeeling. Tourists discover spots, homestays, drivers, shops, cafes, events and biodiversity; service providers onboard and list their business; an internal admin app manages content and users.

## Monorepo layout

| Path              | What it is                                        | Stack |
|-------------------|----------------------------------------------------|-------|
| `backend/`        | REST API                                           | Node 20, Express 5, TypeScript, Drizzle ORM, PostgreSQL |
| `frontend/`       | Public tourist/provider web app                    | React 19 (CRA + craco), Tailwind, react-i18next, react-router v7 |
| `frontend-admin/` | Internal admin dashboard                           | React 19, Vite, TypeScript, Tailwind |
| `memory/`         | Product requirements doc (`PRD.md`)                | — |
| `.agents/`        | AI coding-agent kit (skills/rules for assistants) — not part of the running app | — |

The API is Postgres-backed via Drizzle ORM. See **`memory/PRD.md`** for the full product overview (personas, user journeys, feature inventory, business model, data model) and **`INVESTIGATION.md`** for the repo audit (security findings, doc drift, dependency issues) — both were rewritten 2026-07-16 to match the current codebase.

## Prerequisites

- Node.js 20+ (developed/tested with Node 22)
- Docker Desktop (for local PostgreSQL) — or a PostgreSQL 15 instance you already have
- Yarn Classic for `frontend/` (it ships a `yarn.lock` and pinned `packageManager`). If Yarn isn't installed globally, run it via Corepack: `corepack yarn@1.22.22 <command>`.
- `backend/` and `frontend-admin/` use plain `npm`.

## First-time setup

1. **Start Postgres**
   ```sh
   docker compose up -d postgres
   ```
   This starts `postgres:15-alpine` on `localhost:5432` (db `one_darjeeling`, user/pass `postgres`/`postgres`).

2. **Backend**
   ```sh
   cd backend
   cp .env.example .env   # then edit — see "Environment variables" below, .env.example is stale
   npm install
   npx drizzle-kit push   # creates/syncs tables from src/schema.ts
   npm run dev            # http://localhost:8000
   ```

3. **Frontend (public app)**
   ```sh
   cd frontend
   cp .env.example .env   # REACT_APP_BACKEND_URL=http://localhost:8000
   corepack yarn@1.22.22 install
   corepack yarn@1.22.22 start   # http://localhost:3000
   ```
   (`npm install` still fails here — CRA's `react-scripts@5.0.1` peer-requires `typescript@^3.2.1 || ^4` while the project intentionally runs `typescript@5.5.4`. This is inherent to CRA being unmaintained, not something to fix by downgrading TypeScript — Yarn tolerates it, which is why `frontend/` is Yarn-managed. See `INVESTIGATION.md` §3.1.)

4. **Admin dashboard**
   ```sh
   cd frontend-admin
   npm install
   npm run dev   # http://localhost:5173
   ```

5. **Seed sample data** (27 listings across all 7 categories) — requires an admin JWT:
   ```sh
   TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/admin/login \
     -H "Content-Type: application/json" \
     -d '{"phone":"admin","password":"adminpassword123"}' | node -e "let d='';process.stdin.on('data',c=>d+=c);process.stdin.on('end',()=>console.log(JSON.parse(d).token))")
   curl -X POST http://localhost:8000/api/admin/seed -H "Authorization: Bearer $TOKEN"
   ```
   (There used to be an unauthenticated `/api/dev/seed` shortcut — it was removed as a security fix; see `INVESTIGATION.md` §1.1. The admin app's "reseed" button in `frontend-admin` already calls the authenticated route above.)

Or install and run backend + frontend + admin together from the repo root:
```sh
npm run install:all
npm run dev
```
(`npm run install:all` installs each app with its own correct package manager — npm for `backend`/`frontend-admin`, Yarn for `frontend`. Plain `npm install` at the root only installs this root folder's own tooling, not the three sub-apps. Running `dev` still requires Postgres running and `.env` files already in place per steps above; it does not create them.)

## Environment variables

`backend/.env` — **the checked-in `.env.example` is out of date (Mongo-era)**; use this instead:

```
DATABASE_URL=postgres://postgres:postgres@localhost:5432/one_darjeeling
PORT=8000
JWT_SECRET=<random string>
MOCK_PAYMENTS=true
APP_ENV=development
CORS_ORIGINS=*
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
ADMIN_BOOTSTRAP_SECRET=<random string>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<change me>
```

`frontend/.env`:
```
REACT_APP_BACKEND_URL=http://localhost:8000
```

`frontend-admin` reads `VITE_API_URL` (defaults to `http://localhost:8000/api` if unset — no `.env` needed for local dev).

## API documentation

The backend serves interactive Swagger UI docs (generated from JSDoc `@openapi` annotations on each route) once it's running:

- Swagger UI: http://localhost:8000/api-docs
- Raw OpenAPI 3.0 spec (JSON): http://localhost:8000/api-docs.json

Every route across auth, users, providers, listings, bookings, payments, and admin is documented there, including request bodies, auth requirements (bearer JWT), and response shapes — use it as the source of truth for integrating against the API instead of reading route source directly.

## Auth & payments in dev

- OTP login is mocked: `POST /api/auth/otp/send` returns the OTP in the response body, and the universal code `123456` is always accepted (non-production only).
- Payments are mocked by default (`MOCK_PAYMENTS=true`): checkout completes instantly via `POST /api/payments/mock/complete` with no real Razorpay call. Set `MOCK_PAYMENTS=false` and provide real `RAZORPAY_KEY_ID`/`SECRET` to exercise the live HMAC-verified flow.
- Admin login: `POST /api/auth/admin/login` with `ADMIN_USERNAME`/`ADMIN_PASSWORD` from `.env`, or bootstrap a DB-backed admin via `POST /api/admin/bootstrap`.

## Known issues / further reading

This repo carries some rough edges from a rapid AI-assisted build. See **`INVESTIGATION.md`** for the full audit: stale docs, a dependency conflict, an unauthenticated seeding endpoint, and a couple of missing authorization checks worth fixing before any public deployment.
