# `prod` Branch → `1darjeeling.in` Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a second, fully-isolated production Docker stack that deploys from the `prod` branch to `1darjeeling.in` on the same VPS, without changing the existing `main` → `onedarjeeling.duckdns.org` pipeline in any way.

**Architecture:** Three new files (a second compose file, a second GitHub Actions workflow, a system-Nginx reference site) plus runbook documentation. The new stack shares nothing with the existing one — distinct compose project name, container names, volumes, loopback port, and VPS checkout directory. The application code is domain-agnostic (frontend uses same-origin `/api`; backend reads its domain from `CORS_ORIGINS`/`MINIO_PUBLIC_URL` env), so the same commit deploys to both stacks and only each stack's `.env` differs. Nothing existing is edited except the runbook (documentation).

**Tech Stack:** Docker Compose, GitHub Actions (`appleboy/ssh-action`), system Nginx + Certbot on the VPS, Postgres 15 + MinIO. No application code changes.

**Design spec:** [docs/superpowers/specs/2026-07-23-prod-branch-1darjeeling-in-deploy-design.md](../specs/2026-07-23-prod-branch-1darjeeling-in-deploy-design.md)

## Global Constraints

- **Do not edit** `docker-compose.prod.yml`, `docker-compose.yml`, `.github/workflows/deploy.yml`, `deploy/nginx/app.conf`, `deploy/nginx/Dockerfile`, or any application code. The only existing file that may change is `deploy/VPS-RUNBOOK.md` (documentation).
- **Naming for the new stack (exact, verbatim):** compose project `1darjeeling-in`; containers `1darjeeling_in_postgres`, `1darjeeling_in_backend`, `1darjeeling_in_minio`, `1darjeeling_in_nginx`; volumes `pg_data_in`, `minio_data_in`; host port `127.0.0.1:8092:80`; VPS checkout dir `/var/www/1darjeeling-in`.
- **Domains:** `1darjeeling.in` and `www.1darjeeling.in`.
- **Branch:** all commits land on `ci/prod-branch-deploy` (already created from `origin/main`, current branch).
- **No new GitHub secrets** — reuse `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_PORT`.
- **The new stack must never leak the existing stack's identifiers.** No occurrence of `1darjeeling_prod_`, `pg_data_prod`, `minio_data_prod`, or host port `8091` in `docker-compose.in.yml`.
- Validation runs on Windows via the Bash tool (Git Bash). Docker daemon is not running locally and there is no root `.env`, so local validation uses `grep`/`diff`/PyYAML only; daemon-based checks (`docker compose config`, image build) happen on the VPS at deploy time.

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `docker-compose.in.yml` | Create | The `1darjeeling-in` stack definition (postgres, backend, minio, nginx), isolated from `1darjeeling-prod`. |
| `.github/workflows/deploy-prod.yml` | Create | Gate + deploy on push/PR to `prod`; SSH-deploy the `in` stack. |
| `deploy/host-nginx-site.in.conf.example` | Create | Reference system-Nginx site for `1darjeeling.in` → `127.0.0.1:8092`. |
| `deploy/VPS-RUNBOOK.md` | Modify | Inventory rows + a one-time "Bringing up the 1darjeeling.in stack" section (bootstrap, data copy, DNS, Certbot). |

---

### Task 1: `docker-compose.in.yml` — the second isolated stack

**Files:**
- Create: `docker-compose.in.yml`
- Reference (do not edit): `docker-compose.prod.yml`, `backend/Dockerfile`, `deploy/nginx/Dockerfile`

**Interfaces:**
- Consumes: `.env` at `/var/www/1darjeeling-in` on the VPS (POSTGRES_USER/PASSWORD/DB, MINIO_ROOT_USER/PASSWORD, backend secrets); the `backend/` and `deploy/nginx/` build contexts.
- Produces: compose project `1darjeeling-in` with nginx published on `127.0.0.1:8092`. Task 2's deploy job runs `docker compose -f docker-compose.in.yml`; Task 3's Nginx site proxies to `8092`; Task 4's runbook references all of these names.

- [ ] **Step 1: Create `docker-compose.in.yml`**

```yaml
# Production stack for 1darjeeling.in — the SECOND isolated stack on this VPS,
# running ALONGSIDE the existing 1darjeeling-prod stack (onedarjeeling.duckdns.org,
# docker-compose.prod.yml). The two stacks share NOTHING: distinct compose project
# name, container names, volumes, and host port. That isolation is the whole reason
# a bad deploy of one stack cannot touch the other's data or uptime.
#
# Deployed automatically from the `prod` branch by .github/workflows/deploy-prod.yml.
# ALWAYS pass `-f docker-compose.in.yml` for this stack: a bare `docker compose` in
# this directory picks up the dev docker-compose.yml, and `-f docker-compose.prod.yml`
# is the OTHER production stack.
#
# Why an explicit `name:` AND distinct container/volume names (same reasoning as
# docker-compose.prod.yml): Compose derives a project name from the directory by
# default, so two compose files in the same folder with a same-named service are
# tracked as the SAME resource regardless of container_name. The `name:` below is
# what actually keeps this stack's resources separate; the distinct container and
# volume names are defense-in-depth on top of it. (container_name is a GLOBAL Docker
# namespace, not project-scoped, so distinct container names are mandatory, not
# optional.)
#
# Like the other stack, nginx here is bound to 127.0.0.1 only — the VPS's system
# Nginx + Certbot terminates TLS for 1darjeeling.in and reverse-proxies to this
# container's loopback port (8092). See deploy/VPS-RUNBOOK.md.
name: 1darjeeling-in

services:
  postgres:
    image: postgres:15-alpine
    container_name: 1darjeeling_in_postgres
    restart: unless-stopped
    environment:
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}
    volumes:
      - pg_data_in:/var/lib/postgresql/data
    # Lets `depends_on: condition: service_healthy` below mean "Postgres is accepting
    # connections", not merely "the container was started".
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: 1darjeeling_in_backend
    restart: unless-stopped
    env_file:
      - .env
    environment:
      # Computed here (not hand-duplicated in .env) so Postgres credentials live in
      # one place only.
      - DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
    depends_on:
      postgres:
        condition: service_healthy
      minio:
        condition: service_healthy

  minio:
    image: minio/minio:latest
    container_name: 1darjeeling_in_minio
    restart: unless-stopped
    environment:
      - MINIO_ROOT_USER=${MINIO_ROOT_USER}
      - MINIO_ROOT_PASSWORD=${MINIO_ROOT_PASSWORD}
    # No `ports:` on purpose — MinIO is internal-only. The backend reaches it over the
    # compose network (MINIO_ENDPOINT=http://minio:9000 in .env); the PUBLIC bucket is
    # served through nginx (deploy/nginx/app.conf), and the PRIVATE KYC bucket is never
    # exposed. See docker-compose.prod.yml / VPS-RUNBOOK.md §8 for the full rationale.
    volumes:
      - minio_data_in:/data
    command: server /data --console-address ":9001"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9000/minio/health/live"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  nginx:
    build:
      context: .
      dockerfile: deploy/nginx/Dockerfile
    container_name: 1darjeeling_in_nginx
    restart: unless-stopped
    ports:
      # Loopback-only — the VPS system Nginx proxy_passes 1darjeeling.in here.
      # 8091 is the OTHER stack; 8092 is this one. Change the host port (left of the
      # colon) if 8092 is ever taken (verify with `sudo ss -tlnp | grep 8092`).
      - "127.0.0.1:8092:80"
    depends_on:
      - backend
      - minio

volumes:
  pg_data_in:
  minio_data_in:
```

- [ ] **Step 2: Verify the file is well-formed YAML**

Run:
```bash
python -c "import yaml; yaml.safe_load(open('docker-compose.in.yml')); print('YAML OK')"
```
Expected: `YAML OK` (no traceback).

- [ ] **Step 3: Assert the isolation invariants (names present, no leakage of the other stack)**

Run:
```bash
f=docker-compose.in.yml
errors=0
grep -q '^name: 1darjeeling-in$' "$f" || { echo "MISSING: name: 1darjeeling-in"; errors=1; }
[ "$(grep -c 'container_name: 1darjeeling_in_' "$f")" = "4" ] || { echo "EXPECTED 4 in_ container_names"; errors=1; }
grep -q '"127.0.0.1:8092:80"' "$f" || { echo "MISSING: 8092 port mapping"; errors=1; }
grep -q 'pg_data_in:' "$f" || { echo "MISSING: pg_data_in volume"; errors=1; }
grep -q 'minio_data_in:' "$f" || { echo "MISSING: minio_data_in volume"; errors=1; }
if grep -qE '1darjeeling_prod_|pg_data_prod|minio_data_prod|8091' "$f"; then
  echo "LEAK: found an existing-stack identifier in the new file:"; grep -nE '1darjeeling_prod_|pg_data_prod|minio_data_prod|8091' "$f"; errors=1
fi
[ "$errors" = "0" ] && echo "ALL ISOLATION CHECKS PASS" || echo "ISOLATION CHECKS FAILED"
```
Expected: `ALL ISOLATION CHECKS PASS`

- [ ] **Step 4: Human-review the diff against the existing prod stack**

Run:
```bash
diff docker-compose.prod.yml docker-compose.in.yml
```
Expected: differences are confined to the header comment, `name:`, the four `container_name`s, the nginx `ports:` value/comment, the `minio` no-ports comment, and the two volume names. If any *service structure* (images, healthchecks, depends_on, env keys, build contexts) differs, fix it — the two stacks must be structurally identical.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.in.yml
git commit -m "feat(deploy): add isolated 1darjeeling-in compose stack for 1darjeeling.in"
```

---

### Task 2: `.github/workflows/deploy-prod.yml` — gate + deploy on `prod`

**Files:**
- Create: `.github/workflows/deploy-prod.yml`
- Reference (do not edit): `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: repo secrets `VPS_HOST`/`VPS_USER`/`VPS_SSH_KEY`/`VPS_PORT`; `docker-compose.in.yml` (Task 1) present at repo root; a pre-existing clone at `/var/www/1darjeeling-in` on the VPS (created in Task 4's runbook bootstrap).
- Produces: on push to `prod` (or manual dispatch), a deployed `1darjeeling-in` stack. The `test` and `frontend` jobs are byte-for-byte the same gates as `deploy.yml`.

- [ ] **Step 1: Create `.github/workflows/deploy-prod.yml`**

```yaml
name: Deploy to VPS (prod → 1darjeeling.in)

# Parallel to deploy.yml, for the SECOND production stack. A push to `prod` runs the
# same gates as main, then deploys the 1darjeeling-in stack (docker-compose.in.yml)
# to 1darjeeling.in. The main → onedarjeeling.duckdns.org pipeline (deploy.yml) is a
# separate workflow and is unaffected by anything here. This workflow triggers ONLY on
# the `prod` branch, so it sits inert on main.
on:
  push:
    branches: [prod]
  pull_request:
    branches: [prod]
  workflow_dispatch: {}

jobs:
  # Identical gate to deploy.yml's `test` job: a red backend suite or schema/migration
  # drift must stop the release before anything touches the VPS.
  test:
    name: Backend tests
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: postgres
        ports:
          - 5432:5432
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
          cache-dependency-path: backend/package-lock.json

      - name: Install dependencies
        working-directory: backend
        run: npm ci

      - name: Verify migrations are up to date with schema.ts
        working-directory: backend
        run: |
          npx drizzle-kit generate
          if [ -n "$(git status --porcelain drizzle)" ]; then
            echo "::error::schema.ts has changes with no committed migration. Run 'npm run db:generate' and commit the generated SQL."
            git status --porcelain drizzle
            exit 1
          fi
          echo "migrations are in sync with schema.ts"

      - name: Create test database and apply migrations
        working-directory: backend
        run: npm run test:setup

      - name: Typecheck
        working-directory: backend
        run: npx tsc --noEmit

      - name: Run tests
        working-directory: backend
        run: npm test

  # Identical gate to deploy.yml's `frontend` job: JSX/type errors and lockfile drift
  # must fail here, before the merge, not inside `docker build` during the deploy.
  frontend:
    name: Frontend builds
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: yarn
          cache-dependency-path: frontend/yarn.lock

      - name: Install frontend dependencies
        working-directory: frontend
        run: corepack enable && corepack prepare yarn@1.22.22 --activate && yarn install --frozen-lockfile

      - name: Typecheck frontend
        working-directory: frontend
        run: npx tsc --noEmit

      - name: Build frontend
        working-directory: frontend
        run: yarn build

      - name: Install admin dependencies
        working-directory: frontend-admin
        run: npm ci

      - name: Typecheck admin
        working-directory: frontend-admin
        run: npx tsc --noEmit

      - name: Build admin
        working-directory: frontend-admin
        run: npm run build

  deploy:
    name: Deploy
    needs: [test, frontend] # a red suite or a broken build must stop the release
    # Deploy only on a real push to prod (or a manual dispatch). Without this guard the
    # pull_request trigger above would ship every opened PR straight to the VPS.
    if: github.event_name != 'pull_request'
    runs-on: ubuntu-latest
    steps:
      # An unset GitHub secret silently becomes an empty string, so a missing VPS_USER
      # reaches sshd as a blank username and surfaces as a broken-key error. Name the
      # actual problem here. Values are never printed, only whether they're set.
      - name: Check required secrets are set
        env:
          VPS_HOST: ${{ secrets.VPS_HOST }}
          VPS_USER: ${{ secrets.VPS_USER }}
          VPS_SSH_KEY: ${{ secrets.VPS_SSH_KEY }}
        run: |
          missing=""
          if [ -z "$VPS_HOST" ]; then missing="$missing VPS_HOST"; fi
          if [ -z "$VPS_USER" ]; then missing="$missing VPS_USER"; fi
          if [ -z "$VPS_SSH_KEY" ]; then missing="$missing VPS_SSH_KEY"; fi
          if [ -n "$missing" ]; then
            echo "::error::Missing repository secret(s):$missing — add them under Settings > Secrets and variables > Actions. VPS_USER should be the SSH login (e.g. 'deploy')."
            exit 1
          fi
          echo "All required secrets are present."
          echo "VPS_USER is set (${#VPS_USER} chars); VPS_SSH_KEY is set (${#VPS_SSH_KEY} chars)."

      - name: SSH into VPS and redeploy the 1darjeeling.in stack
        uses: appleboy/ssh-action@v1.2.0
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          port: ${{ secrets.VPS_PORT || 22 }}
          script: |
            set -euo pipefail
            cd /var/www/1darjeeling-in
            git fetch origin prod
            git reset --hard origin/prod
            docker compose -f docker-compose.in.yml up -d --build --remove-orphans
            docker image prune -f
```

- [ ] **Step 2: Verify the workflow is well-formed YAML**

Run:
```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/deploy-prod.yml')); print('YAML OK')"
```
Expected: `YAML OK`

- [ ] **Step 3: Assert the prod-specific invariants**

Run:
```bash
f=.github/workflows/deploy-prod.yml
errors=0
grep -q 'branches: \[prod\]' "$f" || { echo "MISSING: prod branch trigger"; errors=1; }
grep -q 'cd /var/www/1darjeeling-in' "$f" || { echo "MISSING: in checkout dir"; errors=1; }
grep -q 'git reset --hard origin/prod' "$f" || { echo "MISSING: reset to origin/prod"; errors=1; }
grep -q 'docker-compose.in.yml' "$f" || { echo "MISSING: in compose file"; errors=1; }
grep -q "if: github.event_name != 'pull_request'" "$f" || { echo "MISSING: PR deploy guard"; errors=1; }
if grep -qE 'branches: \[main\]|/var/www/1darjeelingvv1|origin/main|docker-compose.prod.yml' "$f"; then
  echo "LEAK: the prod workflow references the main stack:"; grep -nE 'branches: \[main\]|/var/www/1darjeelingvv1|origin/main|docker-compose.prod.yml' "$f"; errors=1
fi
[ "$errors" = "0" ] && echo "ALL WORKFLOW CHECKS PASS" || echo "WORKFLOW CHECKS FAILED"
```
Expected: `ALL WORKFLOW CHECKS PASS`

- [ ] **Step 4: Confirm the gate jobs match `deploy.yml` (same strictness)**

Run:
```bash
python - <<'PY'
import yaml
a = yaml.safe_load(open('.github/workflows/deploy.yml'))
b = yaml.safe_load(open('.github/workflows/deploy-prod.yml'))
for job in ('test', 'frontend'):
    assert a['jobs'][job]['steps'] == b['jobs'][job]['steps'], f"{job} steps differ between deploy.yml and deploy-prod.yml"
print("test + frontend gate jobs are identical to deploy.yml")
PY
```
Expected: `test + frontend gate jobs are identical to deploy.yml`
(If it fails, reconcile `deploy-prod.yml`'s gate steps to match `deploy.yml` exactly — the deploy job legitimately differs and is not compared here.)

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/deploy-prod.yml
git commit -m "feat(ci): add deploy-prod workflow (prod branch → 1darjeeling.in)"
```

---

### Task 3: `deploy/host-nginx-site.in.conf.example` — system-Nginx reference

**Files:**
- Create: `deploy/host-nginx-site.in.conf.example`
- Reference (do not edit): `deploy/host-nginx-site.conf.example`

**Interfaces:**
- Consumes: the `in` stack's nginx on `127.0.0.1:8092` (Task 1).
- Produces: the operator's `/etc/nginx/sites-available/1darjeeling.in` template referenced by Task 4's runbook bring-up section.

- [ ] **Step 1: Create `deploy/host-nginx-site.in.conf.example`**

```nginx
# Reference only — this is NOT used by Docker or docker-compose.in.yml.
# It's the file to create on the VPS's system Nginx (not in this repo's
# containers) at /etc/nginx/sites-available/1darjeeling.in, matching the exact
# convention already used for every other app on this box (compare
# deploy/host-nginx-site.conf.example, which does the same for the
# onedarjeeling.duckdns.org stack on port 8091).
#
# Install it with:
#   sudo cp deploy/host-nginx-site.in.conf.example /etc/nginx/sites-available/1darjeeling.in
#   sudo ln -s /etc/nginx/sites-available/1darjeeling.in /etc/nginx/sites-enabled/
#   sudo nginx -t && sudo systemctl reload nginx
#   sudo certbot --nginx -d 1darjeeling.in -d www.1darjeeling.in
#
# That last command edits this file in place to add the SSL block and the
# HTTP->HTTPS redirect, exactly like it already did for the other certs on this
# VPS — nothing more to do after that; Certbot's existing renewal timer covers
# this cert too. DNS for 1darjeeling.in must resolve to this VPS before certbot
# runs (see deploy/VPS-RUNBOOK.md).

server {
    server_name 1darjeeling.in www.1darjeeling.in;

    # Uploads (listing images, KYC docs) are sent as base64 JSON, ~33% larger than the
    # raw file. The container's nginx (deploy/nginx/app.conf) already allows 30m; set the
    # same ceiling here so a large upload isn't rejected at THIS system-Nginx layer with a
    # bare 413 before it ever reaches the app. (The container then returns a clean JSON
    # 400/413.) Unlike the onedarjeeling example, this line is set explicitly rather than
    # relying on the system Nginx global default.
    client_max_body_size 30m;

    location / {
        proxy_pass http://127.0.0.1:8092;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 80;
}
```

- [ ] **Step 2: Assert the site proxies to the right port and domains, not the other stack**

The check targets the *active* `proxy_pass` directive, not the header comment (which
deliberately mentions the sibling example on 8091 for orientation).

Run:
```bash
f=deploy/host-nginx-site.in.conf.example
errors=0
grep -q 'server_name 1darjeeling.in www.1darjeeling.in;' "$f" || { echo "MISSING: 1darjeeling.in server_name"; errors=1; }
grep -q 'proxy_pass http://127.0.0.1:8092;' "$f" || { echo "MISSING: proxy to 8092"; errors=1; }
if grep -q 'proxy_pass http://127.0.0.1:8091' "$f"; then
  echo "LEAK: proxies to the other stack's port 8091:"; grep -n 'proxy_pass http://127.0.0.1:8091' "$f"; errors=1
fi
[ "$errors" = "0" ] && echo "NGINX SITE CHECKS PASS" || echo "NGINX SITE CHECKS FAILED"
```
Expected: `NGINX SITE CHECKS PASS`

- [ ] **Step 3: Commit**

```bash
git add deploy/host-nginx-site.in.conf.example
git commit -m "docs(deploy): add system-Nginx site reference for 1darjeeling.in"
```

---

### Task 4: `deploy/VPS-RUNBOOK.md` — inventory + bring-up runbook

**Files:**
- Modify: `deploy/VPS-RUNBOOK.md`

**Interfaces:**
- Consumes: all names/ports/paths from Tasks 1–3.
- Produces: operator documentation for the one-time bring-up (bootstrap, data copy, DNS, Certbot) and ongoing deploy notes. No code depends on it.

- [ ] **Step 1: Add the `in` stack to the domain inventory table (§1)**

In `deploy/VPS-RUNBOOK.md`, find the row:
```
| `onedarjeeling.duckdns.org` | 8091 | `1darjeeling-prod` | `/var/www/1darjeelingvv1` |
```
Insert immediately **below** it:
```
| `1darjeeling.in` | 8092 | `1darjeeling-in` | `/var/www/1darjeeling-in` |
```

- [ ] **Step 2: Add a second-stack container table (§1)**

Find the heading `### This app's containers` and its table. Immediately **after** that table (before the `---` that closes §1), insert:
```markdown

### This app's second stack — 1darjeeling.in (`1darjeeling-in`)

Same shape as the table above, isolated from it (separate project, containers, volumes,
port). Deployed from the `prod` branch by `.github/workflows/deploy-prod.yml`.

| Container | Role | Ports |
| --------- | ---- | ----- |
| `1darjeeling_in_nginx` | serves both frontend builds, proxies `/api` + `/api-docs` to backend, proxies the public MinIO bucket path | `127.0.0.1:8092->80` |
| `1darjeeling_in_backend` | Express API | internal only |
| `1darjeeling_in_postgres` | database (volume `pg_data_in`) | internal only |
| `1darjeeling_in_minio` | object storage: public listing images + private KYC documents (volume `minio_data_in`) | internal only — no published host port, by design (see §8) |
```

- [ ] **Step 3: Note the second deploy path in §3 ("Deploying")**

Find, in §3, the paragraph beginning `Routine deploys are automatic: push to `main``. Immediately **after** that paragraph, insert:
```markdown

There are now **two** independent auto-deploy paths, one per stack:

| Branch | Workflow | Stack | Compose file | Domain |
| ------ | -------- | ----- | ------------ | ------ |
| `main` | `deploy.yml` | `1darjeeling-prod` | `docker-compose.prod.yml` | `onedarjeeling.duckdns.org` |
| `prod` | `deploy-prod.yml` | `1darjeeling-in` | `docker-compose.in.yml` | `1darjeeling.in` |

A push to `main` deploys the first stack and never touches the second; a push (or a
`main` → `prod` merge) to `prod` deploys the second and never touches the first.
**For the `1darjeeling.in` stack always pass `-f docker-compose.in.yml`** — a bare
`docker compose` in `/var/www/1darjeeling-in` would pick up the dev file, and
`-f docker-compose.prod.yml` is the OTHER stack.
```

- [ ] **Step 4: Add the bring-up section**

Find the `## See also` heading near the end of the file. Immediately **before** it, insert the following new section:
```markdown
## 9. Bringing up the 1darjeeling.in (prod) stack — one-time

The `deploy-prod.yml` workflow assumes the clone and `.env` already exist at
`/var/www/1darjeeling-in`, exactly as `deploy.yml` assumes `/var/www/1darjeelingvv1`
does. These are the one-time steps to create them and go live. **Every step here is
additive — none of it touches the existing `1darjeeling-prod` stack or its volumes.**

### 9.1 Verify the port is free

```sh
sudo ss -tlnp | grep 8092   # prints nothing if free
```
If 8092 is taken, pick another loopback port and change it in **both** `docker-compose.in.yml`
(nginx `ports:`) and the system-Nginx site (`proxy_pass`).

### 9.2 Bootstrap the checkout and .env

```sh
sudo git clone git@github.com:Studio-1947/1darjeelingvv1.git /var/www/1darjeeling-in
cd /var/www/1darjeeling-in
git checkout prod
cp .env.production.example .env
# Then edit .env — the 1darjeeling.in stack has its OWN .env, distinct from the other
# stack's. Set at minimum:
#   APP_ENV=production
#   CORS_ORIGINS=https://1darjeeling.in
#   MINIO_PUBLIC_URL=https://1darjeeling.in
#   MOCK_PAYMENTS / MESSAGING_PROVIDER — real values when going truly live
# See §4 for the backend's startup refusals if a value is missing or left at a placeholder.
```

> **If you will copy data over (§9.3) via the volume method**, set `POSTGRES_USER`,
> `POSTGRES_PASSWORD`, and `POSTGRES_DB` in this `.env` to the SAME values the source
> stack's Postgres volume was initialised with. Postgres reads its password from the
> volume only on first init, so a copied volume keeps the source's password; a mismatched
> `.env` then can't connect (same failure mode as §4's "Database connection refused").

### 9.3 Copy data from the existing stack (one-time cutover)

Two methods. The **volume tar-copy** is exact (both stacks run identical Postgres 15 /
MinIO images) and is recommended; the **`pg_dump` + `mc mirror`** method avoids stopping
the source but has more moving parts.

**⚠️ The MinIO copy includes the PRIVATE KYC bucket (Aadhaar/PAN/licence scans).** Treat
every archive and volume as sensitive personal data per §8 — encrypt at rest, restrict
access, delete temporaries when done. Never publish a MinIO port to do this.

**Method A — volume tar-copy (recommended; brief source downtime):**
```sh
# 1. Create the in stack's volumes by bringing it up once, then stop it:
cd /var/www/1darjeeling-in
docker compose -f docker-compose.in.yml up -d --build
docker compose -f docker-compose.in.yml stop postgres minio

# 2. Stop the SOURCE stack's postgres + minio for a consistent snapshot
#    (brief downtime on onedarjeeling.duckdns.org):
cd /var/www/1darjeelingvv1
docker compose -f docker-compose.prod.yml stop postgres minio

# 3. Overwrite the in volumes with the source data (clears the empty freshly-migrated
#    data first). Source volumes: 1darjeeling-prod_*; target volumes: 1darjeeling-in_*.
docker run --rm \
  -v 1darjeeling-prod_pg_data_prod:/from:ro \
  -v 1darjeeling-in_pg_data_in:/to \
  alpine sh -c 'rm -rf /to/* /to/..?* /to/.[!.]* 2>/dev/null; cd /from && tar cf - . | (cd /to && tar xf -)'

docker run --rm \
  -v 1darjeeling-prod_minio_data_prod:/from:ro \
  -v 1darjeeling-in_minio_data_in:/to \
  alpine sh -c 'rm -rf /to/* /to/..?* /to/.[!.]* 2>/dev/null; cd /from && tar cf - . | (cd /to && tar xf -)'

# 4. Restart the source stack (site back up), then start the in stack on the copied data:
cd /var/www/1darjeelingvv1 && docker compose -f docker-compose.prod.yml start postgres minio
cd /var/www/1darjeeling-in && docker compose -f docker-compose.in.yml start postgres minio
```

**Method B — no source downtime (`pg_dump` + `mc mirror`):**
```sh
# Postgres: dump the live source DB, restore into a freshly-migrated in DB.
# (Bring the in stack up first so migrations create the schema, then load data.)
docker exec 1darjeeling_prod_postgres pg_dump -U "$SRC_USER" -d "$SRC_DB" --no-owner --format=custom > /tmp/src.dump
# copy /tmp/src.dump to the in DB and restore with pg_restore --clean --if-exists inside
# 1darjeeling_in_postgres. Handle the KYC-adjacent data as sensitive; delete /tmp/src.dump after.
#
# MinIO: mirror both buckets from source to target using `mc` inside a throwaway container
# aliased to each MinIO's internal endpoint. Mirror the PUBLIC and PRIVATE buckets separately;
# never expose either port to do it.
```

### 9.4 DNS (not yet pointed)

Add A records at your DNS provider:
```
1darjeeling.in.      A   <VPS_PUBLIC_IP>
www.1darjeeling.in.  A   <VPS_PUBLIC_IP>
```
Confirm before running Certbot:
```sh
dig +short 1darjeeling.in
dig +short www.1darjeeling.in
```
Containers can be up before DNS resolves — only TLS issuance waits on it.

### 9.5 System Nginx + TLS

```sh
sudo cp /var/www/1darjeeling-in/deploy/host-nginx-site.in.conf.example \
        /etc/nginx/sites-available/1darjeeling.in
sudo ln -s /etc/nginx/sites-available/1darjeeling.in /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx     # nginx -t MUST say "syntax is ok" first
sudo certbot --nginx -d 1darjeeling.in -d www.1darjeeling.in
```
Certbot rewrites the site in place for TLS + redirect; the shared renewal timer covers it.

### 9.6 First deploy and verify

```sh
# If you did NOT already bring it up in §9.3, do it now:
cd /var/www/1darjeeling-in && docker compose -f docker-compose.in.yml up -d --build

docker compose -f docker-compose.in.yml ps
curl -I http://127.0.0.1:8092/                 # 200 straight from the container
curl -s https://1darjeeling.in/api             # {"app":"1 Darjeeling","status":"ok"} through the whole chain
```
If the first works and the second doesn't, the fault is system Nginx or DNS, not this app.
From here on, merging into `prod` auto-deploys this stack via `deploy-prod.yml`.
```

- [ ] **Step 5: Assert the runbook edits are present and well-formed**

Run:
```bash
f=deploy/VPS-RUNBOOK.md
errors=0
grep -q '| `1darjeeling.in` | 8092 | `1darjeeling-in` | `/var/www/1darjeeling-in` |' "$f" || { echo "MISSING: inventory row"; errors=1; }
grep -q '## 9. Bringing up the 1darjeeling.in (prod) stack' "$f" || { echo "MISSING: bring-up section"; errors=1; }
grep -q '1darjeeling_in_nginx' "$f" || { echo "MISSING: second-stack container table"; errors=1; }
grep -q 'docker-compose.in.yml' "$f" || { echo "MISSING: in compose reference"; errors=1; }
python -c "import re,sys; t=open('$f').read(); sys.exit(0 if t.count('```')%2==0 else 1)" || { echo "UNBALANCED code fences"; errors=1; }
[ "$errors" = "0" ] && echo "RUNBOOK CHECKS PASS" || echo "RUNBOOK CHECKS FAILED"
```
Expected: `RUNBOOK CHECKS PASS`

- [ ] **Step 6: Commit**

```bash
git add deploy/VPS-RUNBOOK.md
git commit -m "docs(runbook): document the 1darjeeling.in second stack and its bring-up"
```

---

## Post-implementation (operator / out of scope for this plan)

These are **not** code steps — they are the human go-live actions, fully documented in runbook §9:

1. Open a PR from `ci/prod-branch-deploy` into `main`; merge once green. (The existing `onedarjeeling.duckdns.org` site rebuilds identically — the new files are inert on `main`.)
2. On the VPS, run runbook §9.1–§9.5 (port check, clone + `.env`, data copy, DNS, Certbot).
3. Merge `main` → `prod` to trigger the first `deploy-prod.yml` run (or bring the stack up manually per §9.6).
4. Verify per §9.6.

## Self-Review Notes

- **Spec coverage:** §3 architecture → Task 1 (compose) + Global Constraints (naming/isolation). §4.1 → Task 1. §4.2 → Task 2. §4.3 → Task 3. §4.4 → Task 4. §4.5 (env note) → folded into runbook §9.2 (Task 4, Step 4), as the spec permitted. §5 bring-up → Task 4 §9. §6 CI flow → Tasks 2 + 4 (§3 table). §7 verify/rollback → runbook §9.6. §9 risks (port, `-f`, KYC, password, inert-on-main) → all covered in Task 1/4 content.
- **No new secrets, no edits to existing pipeline** — enforced by Global Constraints and the Task 1/2 leak-checks.
