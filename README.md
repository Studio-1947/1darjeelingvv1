# 1 Darjeeling

Full-stack tourism + local marketplace for Darjeeling. Tourists discover spots, homestays, drivers, shops, cafes, events and biodiversity; service providers onboard and list their business; an internal admin app manages content and users.

## Monorepo layout

| Path              | What it is                                                                      | Stack                                                            |
| ----------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `backend/`        | REST API                                                                        | Node 20, Express 5, TypeScript, Drizzle ORM, PostgreSQL          |
| `frontend/`       | Public tourist/provider web app                                                 | React 19 (CRA + craco), Tailwind, react-i18next, react-router v7 |
| `frontend-admin/` | Internal admin dashboard                                                        | React 19, Vite, TypeScript, Tailwind                             |
| `memory/`         | Product requirements doc (`PRD.md`)                                             | —                                                                |
| `.agents/`        | AI coding-agent kit (skills/rules for assistants) — not part of the running app | —                                                                |

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
   cp .env.example .env   # then edit — see "Environment variables" below
   npm install
   npm run db:migrate     # applies drizzle/*.sql — same command production runs
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

`APP_ENV` is **required** — the backend refuses to start without it (it must be `development`, `test`, or `production`). It is deliberately not defaulted, because assuming `development` in production would silently enable the mock-OTP bypass. When `APP_ENV=production`, the backend also refuses to start if `JWT_SECRET`, `ADMIN_PASSWORD`, or `ADMIN_BOOTSTRAP_SECRET` is unset, left at a dev default, or still a `change_me_*` placeholder, or if `CORS_ORIGINS` is `*`. In development all of those fall back to insecure-but-convenient defaults.

`frontend-admin` reads `VITE_API_URL` (defaults to `http://localhost:8000/api` if unset — no `.env` needed for local dev).

## Database migrations

Schema lives in `backend/src/schema.ts`; the database is changed through versioned SQL migrations in `backend/drizzle/`, applied by `drizzle-kit migrate` and tracked in a `__drizzle_migrations` ledger so each runs exactly once.

To change the schema:

```sh
cd backend
# 1. edit src/schema.ts, then:
npm run db:generate    # writes a new drizzle/NNNN_*.sql — review it, it's part of the diff
npm run db:migrate     # apply locally
# 2. commit BOTH schema.ts and the generated .sql
```

The migration is what runs in production (`backend/Dockerfile`'s `CMD` runs `drizzle-kit migrate` before starting the server), so an un-committed migration means a deploy that doesn't have the table it expects.

> **Do not use `drizzle-kit push` against any database you care about.** It diffs the live database against `schema.ts` and reconciles it without asking — a renamed or dropped column takes its data with it. Production used to run `push --force` on every container start; that's what the migrations above replaced. `db:push` remains in `package.json` for throwaway local databases only.

## Running the tests

```sh
cd backend
npm run test:setup   # creates one_darjeeling_test + applies migrations (idempotent, needs Postgres up)
npm test             # vitest
```

Tests run against `one_darjeeling_test`, a **separate database** from your dev one, because the suite truncates every table between tests. Re-run `test:setup` after adding a migration.

`test:setup` applies **migrations**, deliberately — not `db:push`. Building the test schema straight from `schema.ts` would mean a forgotten `db:generate` still produced a green suite while production came up missing the column. Tests therefore run against exactly what production runs. CI additionally fails if `schema.ts` has changes with no committed migration, and a red suite blocks the deploy (`.github/workflows/deploy.yml`).

## API documentation

The backend serves interactive Swagger UI docs (generated from JSDoc `@openapi` annotations on each route) once it's running:

- Swagger UI: http://localhost:8000/api-docs
- Raw OpenAPI 3.0 spec (JSON): http://localhost:8000/api-docs.json

Every route across auth, users, providers, listings, bookings, payments, and admin is documented there, including request bodies, auth requirements (bearer JWT), and response shapes — use it as the source of truth for integrating against the API instead of reading route source directly.

## Auth & payments in dev

- OTP login is mocked: `POST /api/auth/otp/send` returns the OTP in the response body, and the universal code `123456` is always accepted (non-production only).
- Payments are mocked by default (`MOCK_PAYMENTS=true`): checkout completes instantly via `POST /api/payments/mock/complete` with no real Razorpay call. Set `MOCK_PAYMENTS=false` and provide real `RAZORPAY_KEY_ID`/`SECRET` to exercise the live HMAC-verified flow.
- Admin login: `POST /api/auth/admin/login` with `ADMIN_USERNAME`/`ADMIN_PASSWORD` from `.env`, or bootstrap a DB-backed admin via `POST /api/admin/bootstrap`.

## Razorpay setup

Payments are mocked by default. Everything below is only needed to take **real** money.

### How the flow works

```
1. Browser  → POST /api/payments/order        → backend creates a Razorpay order, stores it (status=created)
2. Browser  → Razorpay Checkout (checkout.js) → customer pays on Razorpay's UI
3a. Browser → POST /api/payments/verify       → HMAC-verified callback  ─┐
3b. Razorpay→ POST /api/payments/webhook      → HMAC-verified server call ┴→ whichever arrives first settles
4. Settlement → provider activated / booking confirmed (exactly once)
```

**Both 3a and 3b matter.** 3a is best-effort: if the customer closes the tab after paying, it never fires, and without 3b that payment is charged by Razorpay but never settled in the app — money taken, nothing delivered. 3b is the authoritative path and works even with the browser gone. They race by design; settlement is idempotent, so the loser is a no-op (`already: true`).

Amounts are **never** taken from the client: `AMOUNTS` in `backend/src/config.ts` is the only source (`provider_registration` ₹99, `booking_commission` ₹1). The flow/reference a payment settles is read from the stored order, not the request body — see `INVESTIGATION.md` §1.5 for why.

### 1. Get your API keys

Razorpay Dashboard → **Account & Settings → API Keys → Generate Key**. You get a key id (`rzp_test_*` or `rzp_live_*`) and a **key secret shown exactly once** — copy it now. Start in **Test Mode** (toggle in the dashboard).

### 2. Create the webhook

Dashboard → **Settings → Webhooks → Add New Webhook**:

| Field         | Value                                                        |
| ------------- | ------------------------------------------------------------ |
| Webhook URL   | `https://onedarjeeling.duckdns.org/api/payments/webhook`     |
| Secret        | Any long random string you generate — **you choose this**    |
| Active Events | `payment.captured` and `order.paid`                          |

The **Secret is not your key secret** — it's a separate value you invent here and paste into `RAZORPAY_WEBHOOK_SECRET`. It's what proves an incoming webhook is really from Razorpay.

Generate one with:

```sh
openssl rand -hex 32
```

### 3. Configure the backend

```
MOCK_PAYMENTS=false
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=<the key secret shown once at generation>
RAZORPAY_WEBHOOK_SECRET=<the secret you invented in step 2>
```

The backend refuses to start if `MOCK_PAYMENTS=false` and any of these is missing, or if a `rzp_test_*` key is used while `APP_ENV=production`. No `/api` path changes are needed — the existing `/api` proxy already routes the webhook.

### 4. Test cards (Test Mode only)

| Scenario     | Card                  | Details                          |
| ------------ | --------------------- | -------------------------------- |
| Success      | `4111 1111 1111 1111` | any future expiry, any CVV       |
| Failure      | `4000 0000 0000 0002` | any future expiry, any CVV       |
| UPI success  | `success@razorpay`    | —                                |
| UPI failure  | `failure@razorpay`    | —                                |

Use OTP `1234` on the 3-D Secure page. Never use real card numbers in Test Mode.

### 5. Testing the webhook locally

Razorpay can't reach `localhost`, so either tunnel or forge a delivery yourself.

**Tunnel** (real end-to-end): run `ngrok http 8000`, then set the dashboard webhook URL to `https://<id>.ngrok-free.app/api/payments/webhook`.

**Forge a delivery** (no tunnel; signs the body exactly like Razorpay does):

```sh
SECRET='your_webhook_secret'
ORDER_ID='mock_order_abc123'   # an order_id you got back from POST /api/payments/order
BODY="{\"event\":\"payment.captured\",\"payload\":{\"payment\":{\"entity\":{\"id\":\"pay_test_1\",\"order_id\":\"$ORDER_ID\"}}}}"
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET" -r | cut -d' ' -f1)

curl -s -X POST http://localhost:8000/api/payments/webhook \
  -H "Content-Type: application/json" \
  -H "X-Razorpay-Signature: $SIG" \
  -d "$BODY"
# → {"ok":true,"already":false}   (send it again → {"ok":true,"already":true})
```

The signature covers the **raw bytes**, so the body must be sent verbatim — this is why `app.ts` mounts `express.raw()` for this one path ahead of `express.json()`. Reformatting the JSON invalidates the signature.

### 6. Go-live checklist

- [ ] Dashboard **KYC/activation** complete — live keys don't work until Razorpay approves the account.
- [ ] Switched dashboard to **Live Mode** and regenerated `rzp_live_*` keys.
- [ ] Webhook re-created in **Live Mode** (test-mode webhooks do **not** carry over) and pointed at the production URL.
- [ ] `MOCK_PAYMENTS=false` and all three Razorpay vars set in the VPS `.env`.
- [ ] One real low-value transaction end-to-end, then confirm in Dashboard → Webhooks that the delivery returned **200**.
- [ ] Settlement account added (Dashboard → Settings → Settlements), or money sits in the Razorpay balance.

## Production deployment

This VPS already runs a **system-level Nginx + Certbot** in front of several other apps (each its own `sites-available` file, each with its own DuckDNS domain and Let's Encrypt cert via `certbot --nginx`). This app follows the exact same convention rather than introducing its own — it does **not** run its own Nginx/Certbot on ports 80/443.

The app itself deploys as three containers: `postgres`, `backend` (Express API), and an `nginx` container that bakes in both frontend static builds (public app at `/`, admin console at `/admin`) and reverse-proxies `/api` + `/api-docs` to the backend. That `nginx` container is bound to `127.0.0.1:8091` only — never exposed directly. The VPS's existing system Nginx is what actually terminates TLS and is reachable from the internet; it reverse-proxies `onedarjeeling.duckdns.org` to `127.0.0.1:8091`, exactly like it already does for the other apps on this box (compare `/etc/nginx/sites-available/s47-task.duckdns.org`).

### One-time VPS setup

1. **Clone the repo** to `/var/www/1darjeelingvv1` (already done) and `cd` into it.
2. **Create `.env`** from the template: `cp .env.production.example .env`, then fill in real values — a strong `POSTGRES_PASSWORD`, `JWT_SECRET`, `ADMIN_BOOTSTRAP_SECRET`, a changed `ADMIN_PASSWORD`, and your Razorpay live keys (or leave `MOCK_PAYMENTS=true` until you're ready to charge real money). This file is gitignored — it stays on the server and is never pulled from or pushed to GitHub.
3. **Confirm 8091 is free**: `sudo ss -tlnp | grep 8091` should print nothing. If it's taken, pick a different port in `docker-compose.prod.yml`'s `nginx.ports` and in step 5 below.
4. **Bring the app containers up**:
   ```sh
   docker compose -f docker-compose.prod.yml up -d --build
   curl -I http://127.0.0.1:8091/   # sanity check — should be 200, straight from this container
   ```
5. **Add the host Nginx site** (this is the one step that touches the shared system Nginx — it only _adds_ a new file, never edits an existing one):
   ```sh
   sudo cp deploy/host-nginx-site.conf.example /etc/nginx/sites-available/onedarjeeling.duckdns.org
   sudo ln -s /etc/nginx/sites-available/onedarjeeling.duckdns.org /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   ```
   `nginx -t` must print "syntax is ok" / "test is successful" before you reload — if it doesn't, stop and fix the config rather than reloading anyway (a bad reload here would affect every other app on this box, not just this one).
6. **Issue the TLS cert** via the same Certbot already managing the other domains' certs:
   ```sh
   sudo certbot --nginx -d onedarjeeling.duckdns.org
   ```
   This edits the site file in place to add the SSL block and HTTP→HTTPS redirect — the same thing it already did for the other five certs visible in `sudo certbot certificates`. No separate renewal setup needed; the existing Certbot timer on this VPS picks it up automatically.
7. **Seed + bootstrap admin** (first time only): once containers are up, follow the same `/api/admin/bootstrap` flow described earlier in this README, but against `https://onedarjeeling.duckdns.org/api/...` instead of localhost.

### Ongoing deploys (GitHub Actions)

`.github/workflows/deploy.yml` SSHes into the VPS on every push to `main` and runs `git reset --hard origin/main && docker compose -f docker-compose.prod.yml up -d --build --remove-orphans`. It needs these **GitHub repo secrets** (Settings → Secrets and variables → Actions):

| Secret        | Value                                               |
| ------------- | --------------------------------------------------- |
| `VPS_HOST`    | The VPS's IP or hostname                            |
| `VPS_USER`    | The SSH user (e.g. `deploy`)                        |
| `VPS_SSH_KEY` | The **private** key of a deploy keypair (see below) |
| `VPS_PORT`    | Optional, defaults to `22`                          |

**Generating the deploy key** (run once, on the VPS, as the `deploy` user):

```sh
ssh-keygen -t ed25519 -C "gh-actions-1darjeeling" -f ~/.ssh/gh_actions_1darjeeling -N ""
cat ~/.ssh/gh_actions_1darjeeling.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/gh_actions_1darjeeling  # copy this whole output...
rm ~/.ssh/gh_actions_1darjeeling   # ...then delete it; GitHub is now the only copy
```

**Use a key dedicated to this repo, and name it after the repo** — both matter on a VPS hosting several projects:

- Every key in `deploy`'s `authorized_keys` logs in as `deploy`, so they all have identical power over the whole box. A per-repo key doesn't isolate anything; what it gives you is **revocation** (drop one line to cut off one project, instead of rotating every project at once) and **attribution** (`auth.log` records the fingerprint, so you can see which project connected).
- GitHub Actions secrets can be read by anyone able to modify a workflow in that repo. Share one key across repos and write access to the least-careful repo becomes access to _all_ of them.
- The `-C` comment is the only thing distinguishing entries in `authorized_keys`. Naming every project's key `github-actions-deploy` produces a list you can't safely revoke from, because you can't tell what each line is for. Name it after the repo and the file documents itself.

Check what's currently trusted with `ssh-keygen -lf ~/.ssh/authorized_keys`; anything you can't account for should be removed.

Paste that private key output as the `VPS_SSH_KEY` GitHub secret (the full `-----BEGIN OPENSSH PRIVATE KEY-----` block, unmodified). This is a _separate_ keypair from whatever SSH key the VPS already uses to `git clone`/`git pull` from GitHub — that one lets the VPS talk to GitHub; this new one lets GitHub Actions talk to the VPS, the opposite direction. Never reuse the VPS's own GitHub-facing key for this.

Once the secrets are set, just `git push` to `main` and the workflow redeploys automatically — no manual SSH needed for routine updates. The workflow only touches this app's own containers (`docker compose -f docker-compose.prod.yml up -d --build`); it never touches the host Nginx config, so routine deploys can't affect other apps on the box. Re-run steps 5–6 above manually only if you ever need to set this app up on a fresh VPS.

## Known issues / further reading

This repo carries some rough edges from a rapid AI-assisted build. See **`INVESTIGATION.md`** for the full audit — what's been fixed (stale docs, a dependency conflict, an unauthenticated seeding endpoint, the authorization and payment-binding holes, and config that used to fail open) and the **"Still open"** table of what hasn't been, including inoperative production rate limiting and `drizzle-kit push --force` auto-migrating the production database on every deploy. Read that table before any public deployment.
