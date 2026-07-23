# `prod` Branch → `1darjeeling.in` Deployment — Design

> Date: 2026-07-23
> Status: Approved for planning
> Scope: Add a parallel, fully-isolated production stack for `1darjeeling.in`, deployed automatically when code is merged into the `prod` branch — while leaving the existing `main` → `onedarjeeling.duckdns.org` pipeline completely unchanged.

---

## 1. Goal

Today, a push to `main` runs [.github/workflows/deploy.yml](../../../.github/workflows/deploy.yml) and deploys the `1darjeeling-prod` Docker stack to `onedarjeeling.duckdns.org`. We want a second path: merging into the existing `prod` branch deploys a **separate** stack to `1darjeeling.in`, for both backend and frontend, on the **same VPS**.

The overriding constraint from the user: **"main branch deployments will be the same, and nothing should break."** Therefore this design *adds* a parallel path and touches nothing on the existing one — no edits to `deploy.yml`, `docker-compose.prod.yml`, `deploy/nginx/app.conf`, or the existing stack's containers/volumes.

## 2. Confirmed decisions

| Question | Decision |
|---|---|
| Where does `1darjeeling.in` run | **Same VPS** (`srv1775618`), as a second fully-isolated stack alongside `1darjeeling-prod`. |
| Data for the new stack | **Copy current data over** from the existing stack (Postgres + MinIO) as a one-time cutover step. |
| DNS for `1darjeeling.in` | **Not set up yet** — runbook documents the A-record + Certbot sequence; container bring-up does not block on it, only TLS does. |
| How the files land | Implement on a dedicated branch cut **from `main`** (not from the current `feat/provider-kyc`, which carries unrelated feature commits) → merge to **`main`** first (the new workflow is dormant there) → then merge `main` → `prod` to trigger the first prod deploy. |
| Compose structure | **Separate `docker-compose.in.yml`** (not a parameterized single file), to keep the existing `docker-compose.prod.yml` byte-for-byte untouched. |
| Data-copy method | **Volume tar-copy** (exact, version-matched) recommended; **`pg_dump` + `mc mirror`** documented as the no-downtime alternative. |
| Deploy secrets | **Reuse existing** `VPS_HOST` / `VPS_USER` / `VPS_SSH_KEY` / `VPS_PORT` — same box, no new secrets. |

## 3. Architecture — two isolated stacks, sharing nothing

The VPS-RUNBOOK's §6 ("Adding a new project to this box") is exactly this pattern. The two stacks run side by side and share no compose project, container, volume, port, or checkout directory.

| | Existing (`main`) — unchanged | New (`prod`) — added |
|---|---|---|
| Domain | `onedarjeeling.duckdns.org` | `1darjeeling.in` (+ `www`) |
| Compose project (`name:`) | `1darjeeling-prod` | `1darjeeling-in` |
| Compose file | `docker-compose.prod.yml` | `docker-compose.in.yml` *(new)* |
| Containers | `1darjeeling_prod_{postgres,backend,minio,nginx}` | `1darjeeling_in_{postgres,backend,minio,nginx}` |
| Volumes | `pg_data_prod`, `minio_data_prod` | `pg_data_in`, `minio_data_in` |
| Loopback port (host side) | `127.0.0.1:8091` | `127.0.0.1:8092` *(verify free first)* |
| VPS checkout dir | `/var/www/1darjeelingvv1` | `/var/www/1darjeeling-in` *(new clone)* |
| `.env` | its own | its own, with real `1darjeeling.in` values |
| GitHub Actions workflow | `deploy.yml` (push/PR to `main`) | `deploy-prod.yml` (push/PR to `prod`) *(new)* |

### Why the code needs no per-domain changes

The application is already domain-agnostic, so **the same commit deploys to both stacks** and only each stack's `.env` differs:

- **Frontend** — the nginx image build deliberately does *not* set `REACT_APP_BACKEND_URL`; the SPA falls back to a same-origin `/api` base (see `deploy/nginx/Dockerfile` and `deploy/nginx/app.conf`). No hostname is baked into the bundle.
- **Admin** — built with `VITE_API_URL=/api` (same-origin), also domain-agnostic.
- **Backend** — every domain-specific value comes from env: `CORS_ORIGINS`, `MINIO_PUBLIC_URL` (see `backend/src/config.ts`).

### Why `deploy/nginx/app.conf` is NOT modified

`app.conf` contains a single `server {}` block. With one server block, nginx treats it as the **default server** for that listen socket and serves any `Host`, so it handles `1darjeeling.in` traffic correctly despite `server_name onedarjeeling.duckdns.org`. The mismatch is cosmetic. Leaving the file untouched guarantees the `in` stack builds the *identical* nginx image the existing stack does, and guarantees zero behavioural change to the existing stack. (Traffic reaches this container only via the VPS system Nginx `proxy_pass` to its loopback port, with `proxy_set_header Host $host`.)

### Volume-name collision — belt and braces

Docker Compose namespaces named volumes by project name, so `pg_data_in` under project `1darjeeling-in` becomes `1darjeeling-in_pg_data_in` — already distinct from `1darjeeling-prod_pg_data_prod`. We use distinct *base* names anyway, matching the runbook's stated "explicit distinct container/volume names as defense-in-depth" rationale. `container_name`, by contrast, is a **global** Docker namespace (not project-scoped), so distinct container names are mandatory, not optional.

## 4. Files to add (nothing existing is edited)

### 4.1 `docker-compose.in.yml` (new)

A sibling of `docker-compose.prod.yml`, identical in structure and semantics (same `backend/` build context, same `deploy/nginx/Dockerfile` context, same healthchecks, same `env_file: .env`, same computed `DATABASE_URL`, MinIO with no published port, nginx on loopback only), differing **only** in:

- `name: 1darjeeling-in`
- the four `container_name`s → `1darjeeling_in_*`
- nginx host port → `"127.0.0.1:8092:80"`
- volume names → `pg_data_in`, `minio_data_in` (both in the service `volumes:` refs and the top-level `volumes:` block)

The file carries a header comment explaining it is the second isolated stack and why every distinguishing name matters (mirroring the existing prod file's isolation warning).

**Rejected alternative:** a single parameterized compose file using `${STACK}` / `${NGINX_PORT}`. It avoids duplication but requires editing `docker-compose.prod.yml`, which touches main's deploy path — against the "main stays the same / nothing breaks" constraint. The cost of the separate file is that future stack-shape changes must be applied in two places; that is an accepted, explicit trade-off.

### 4.2 `.github/workflows/deploy-prod.yml` (new)

Structurally parallel to `deploy.yml`:

```yaml
on:
  push:
    branches: [prod]
  pull_request:
    branches: [prod]
  workflow_dispatch: {}
```

- **`test` job** and **`frontend` job** — the same gates as `deploy.yml` (backend suite against an ephemeral Postgres, migration-drift check, backend typecheck/tests; frontend + admin install/typecheck/build). Prod is gated at least as strictly as main.
- **`deploy` job** — `needs: [test, frontend]`, `if: github.event_name != 'pull_request'`, plus the same "required secrets are set" preflight. It SSHes into the **same VPS** (reusing the existing secrets) and runs:

  ```sh
  cd /var/www/1darjeeling-in
  git fetch origin prod
  git reset --hard origin/prod
  docker compose -f docker-compose.in.yml up -d --build --remove-orphans
  docker image prune -f
  ```

This workflow only triggers on the `prod` branch, so it sits inert on `main` and causes no change to the existing pipeline.

### 4.3 `deploy/host-nginx-site.in.conf.example` (new)

A reference system-Nginx site file for `1darjeeling.in` → `127.0.0.1:8092`, mirroring the existing `deploy/host-nginx-site.conf.example` (server_name + proxy_pass to the loopback port; the SSL block is added in-place by Certbot). Reference-only; not consumed by Docker.

### 4.4 `deploy/VPS-RUNBOOK.md` (edited — documentation only)

- Add `1darjeeling.in → 8092 → 1darjeeling-in → /var/www/1darjeeling-in` to the domain/port inventory table and a companion "this app's second stack" container table.
- Add a new section, **"Bringing up the 1darjeeling.in (prod) stack"**, covering the one-time bootstrap, data copy, DNS, and Certbot steps in §5 below.
- Note in the "Deploying" section that pushes to `prod` deploy the `in` stack, and that every `docker compose` command for it must pass `-f docker-compose.in.yml`.

### 4.5 `.env.production.example` (optional, edited — documentation only)

Add a short comment noting that the `in` stack has its **own** `.env` in `/var/www/1darjeeling-in`, with `CORS_ORIGINS` and `MINIO_PUBLIC_URL` set to `https://1darjeeling.in`. No new variables are introduced. (May be folded into the runbook instead to avoid churn; final call at planning time.)

## 5. One-time VPS bring-up, data copy & DNS/TLS (operator runbook)

These are one-time operator steps, documented in the runbook — not automated by the workflow (the workflow assumes the clone and `.env` already exist, exactly as the existing `main` deploy assumes `/var/www/1darjeelingvv1` already exists).

1. **Verify the port is free:** `sudo ss -tlnp | grep 8092` prints nothing. If taken, pick another loopback port and adjust `docker-compose.in.yml` + the system-Nginx site.
2. **Bootstrap the checkout:** `git clone` the repo into `/var/www/1darjeeling-in`, `git checkout prod`, then create `.env` from `.env.production.example` with real secrets and `CORS_ORIGINS=https://1darjeeling.in`, `MINIO_PUBLIC_URL=https://1darjeeling.in`. (Payments/OTP: set `MOCK_PAYMENTS` and `MESSAGING_PROVIDER` to real values when going truly live; the backend enforces this at startup.)
3. **Copy data over** from the existing stack into the `in` volumes (one-time cutover):
   - **Recommended — volume tar-copy** (exact, version-matched; both stacks run identical Postgres 15 / MinIO images). Follow the runbook §8 backup/restore shape: tar `pg_data_prod` → restore into `pg_data_in`, tar `minio_data_prod` → restore into `minio_data_in`, **before** the `in` stack's first boot. Requires a brief stop of the *source* postgres/minio for a consistent snapshot. With this method, `in`'s `POSTGRES_PASSWORD` **must equal** the password the source volume was initialized with (Postgres initializes its password once, from the volume).
   - **Alternative — no source downtime:** online `pg_dump` of the source DB restored into a freshly-migrated `in` DB, plus `mc mirror` of both MinIO buckets. More moving parts; lets `in` use independent credentials.
   - ⚠️ The MinIO copy includes the **private KYC bucket** (government ID scans). Handle every archive per runbook §8: encrypt at rest, restrict access, delete when done.
4. **DNS (not yet set up):** add A records `1darjeeling.in` and `www.1darjeeling.in` → the VPS public IP; confirm with `dig +short 1darjeeling.in`. The containers can be brought up before DNS resolves — only TLS issuance waits on it.
5. **System Nginx + TLS:** copy `deploy/host-nginx-site.in.conf.example` to `/etc/nginx/sites-available/1darjeeling.in`, symlink into `sites-enabled`, `sudo nginx -t`, `sudo systemctl reload nginx`, then `sudo certbot --nginx -d 1darjeeling.in -d www.1darjeeling.in`. The shared Certbot renewal timer covers the new cert.
6. **First deploy:** merge `main` → `prod`; `deploy-prod.yml` builds and starts the `in` stack. (Or run the manual `docker compose -f docker-compose.in.yml up -d --build` once during bring-up.)

## 6. CI/CD flow (end state)

- Push/merge to **`main`** → `deploy.yml` runs exactly as today → `onedarjeeling.duckdns.org`. **Unchanged.**
- Push/merge to **`prod`** → `deploy-prod.yml` runs the same gates → on green, deploys `docker-compose.in.yml` → `1darjeeling.in`.
- PRs targeting either branch run that branch's gates without deploying.

## 7. Verification & rollback

- **Verify:** `curl -I http://127.0.0.1:8092/` (container direct, bypasses TLS) → then `curl -s https://1darjeeling.in/api` → `{"app":"1 Darjeeling","status":"ok"}`. If the first works and the second doesn't, the fault is system Nginx or DNS, not this app.
- **Isolation / rollback:** the `in` stack can be stopped, rebuilt, or `down` (never `-v`) independently; no operation on it touches `1darjeeling-prod` or its volumes, and vice versa. A bad `prod` deploy never affects `onedarjeeling.duckdns.org`.

## 8. Out of scope

- No changes to application code, routes, or the database schema.
- No changes to the existing `main`/`onedarjeeling.duckdns.org` pipeline or stack.
- No new GitHub secrets or CI infrastructure beyond the one new workflow file.
- Automating the one-time VPS bootstrap (clone, `.env`, DNS, Certbot, data copy) — these remain documented manual steps, consistent with how the existing stack was brought up.

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Port `8092` already in use on the box | Step 1 verifies with `ss` before committing to it. |
| Copying data clobbers the wrong volume | Distinct volume names + always pass `-f docker-compose.in.yml`; the runbook's §5 "always pass `-f`" warning is restated for the `in` file. |
| KYC documents leak via the copy | KYC copy handled under runbook §8 encryption rules; the `in` nginx keeps the same `return 404` guard on the KYC bucket path. |
| `POSTGRES_PASSWORD` mismatch after volume-copy | Explicitly documented: match `in`'s password to the source volume's initialized value (or use the `pg_dump` path). |
| New files landing on `main` change the existing deploy | `deploy-prod.yml` triggers only on `prod`; `docker-compose.in.yml` is not referenced by main's deploy — both are inert on `main`. |
