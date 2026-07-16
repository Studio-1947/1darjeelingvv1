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

## Production deployment

The app deploys to a VPS as four containers behind one Nginx: `postgres`, `backend` (Express API), and a combined `nginx` container that bakes in both frontend static builds (public app at `/`, admin console at `/admin`) plus reverse-proxies `/api` and `/api-docs` to the backend. `certbot` runs alongside it renewing the TLS cert. Each app on the VPS owns its own Nginx + Certbot pair on its own domain — this one is `onedarjeeling.duckdns.org`, and it doesn't share a reverse proxy with anything else already running on the box.

### One-time VPS setup

1. **Clone the repo** to `/var/www/1darjeelingvv1` (already done) and `cd` into it.
2. **Create `.env`** from the template: `cp .env.production.example .env`, then fill in real values — a strong `POSTGRES_PASSWORD`, `JWT_SECRET`, `ADMIN_BOOTSTRAP_SECRET`, a changed `ADMIN_PASSWORD`, your Razorpay live keys (or leave `MOCK_PAYMENTS=true` until you're ready to charge real money), and `CERTBOT_EMAIL` for Let's Encrypt renewal notices. This file is gitignored — it stays on the server and is never pulled from or pushed to GitHub.
3. **Confirm DNS**: `onedarjeeling.duckdns.org` must already resolve to this VPS's IP (per your DuckDNS setup) before requesting a certificate.
4. **Bootstrap TLS and bring the stack up**:
   ```sh
   chmod +x deploy/init-letsencrypt.sh
   CERTBOT_EMAIL=you@example.com ./deploy/init-letsencrypt.sh
   ```
   This starts everything over plain HTTP first, obtains the real certificate via the webroot challenge, then switches Nginx to the HTTPS config and starts the renewal loop. It's idempotent — safe to re-run on a fresh clone; it skips straight to a normal `up -d --build` if a certificate already exists.
5. **Seed + bootstrap admin** (first time only): once containers are up, follow the same `/api/admin/bootstrap` flow described earlier in this README, but against `https://onedarjeeling.duckdns.org/api/...` instead of localhost.

### Ongoing deploys (GitHub Actions)

`.github/workflows/deploy.yml` SSHes into the VPS on every push to `main` and runs `git reset --hard origin/main && docker compose -f docker-compose.prod.yml up -d --build --remove-orphans`. It needs these **GitHub repo secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
|---|---|
| `VPS_HOST` | The VPS's IP or hostname |
| `VPS_USER` | The SSH user (e.g. `deploy`) |
| `VPS_SSH_KEY` | The **private** key of a deploy keypair (see below) |
| `VPS_PORT` | Optional, defaults to `22` |

**Generating the deploy key** (run once, on the VPS, as the `deploy` user):
```sh
ssh-keygen -t ed25519 -C "github-actions-deploy" -f ~/.ssh/gh_actions_deploy -N ""
cat ~/.ssh/gh_actions_deploy.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/gh_actions_deploy       # copy this whole output...
```
Paste that private key output as the `VPS_SSH_KEY` GitHub secret (the full `-----BEGIN OPENSSH PRIVATE KEY-----` block, unmodified). This is a *separate* keypair from whatever SSH key the VPS already uses to `git clone`/`git pull` from GitHub — that one lets the VPS talk to GitHub; this new one lets GitHub Actions talk to the VPS, the opposite direction. Never reuse the VPS's own GitHub-facing key for this.

Once the secrets are set, just `git push` to `main` and the workflow redeploys automatically — no manual SSH needed for routine updates. Re-run `deploy/init-letsencrypt.sh` manually only if you ever need to re-bootstrap TLS (e.g. a fresh clone on a new server).

## Known issues / further reading

This repo carries some rough edges from a rapid AI-assisted build. See **`INVESTIGATION.md`** for the full audit: stale docs, a dependency conflict, an unauthenticated seeding endpoint, and a couple of missing authorization checks worth fixing before any public deployment.
