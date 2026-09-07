# VPS Runbook

Operating notes for the shared VPS (`srv1775618`) that hosts this app alongside several other
projects. Written for the person on the box at 2am wondering why something is down.

**Scope:** this app is one tenant of a shared server. Anything here that touches system Nginx,
Certbot, or Docker's global state affects **every** project on the box, not just this one.

> Snapshot taken **2026-07-17**. The per-project table below drifts as projects come and go —
> re-run the inventory commands rather than trusting it blindly. The commands don't go stale.

---

## 1. What's on this box

Every app follows the same convention: containers bind to **`127.0.0.1:<port>`** only, and the
VPS's **system Nginx** (not a container) terminates TLS and reverse-proxies a domain to that port.
Certbot manages all certs on one shared timer.

```
internet → system Nginx (:80/:443, TLS) → 127.0.0.1:<port> → app's own nginx/web container
```

| Domain | → Port | Compose project | Source directory |
| ------ | ------ | --------------- | ---------------- |
| `aanganerp.in` | 8092 | `1darjeeling-in` | `/var/www/1darjeeling-in` |
| `dev.doptor.in` | 3000 | `doptor-super-app-monorepo` | `/var/www/Doptor-super-app-monorepo` |
| `api.dev.doptor.in` | 5000 | `doptor-super-app-monorepo` | `/var/www/Doptor-super-app-monorepo` |
| `s47-task.duckdns.org` | 8080 | `task-tracker-s47` | `/var/www/task-tracker-s47` |
| `s47-social-flow.duckdns.org` | 8082 | `social-flow-deploy` | `/var/www/social-media-dashboard` |
| `dashboard-rk.duckdns.org` | 4000 | — (nothing listening, see §7) | — |

### This app's containers

Deployed from the `prod` branch by `.github/workflows/deploy-prod.yml`.

| Container | Role | Ports |
| --------- | ---- | ----- |
| `1darjeeling_in_nginx` | serves both frontend builds, proxies `/api` + `/api-docs` to backend, proxies the public MinIO bucket path (see §8) | `127.0.0.1:8092->80` |
| `1darjeeling_in_backend` | Express API | internal only |
| `1darjeeling_in_postgres` | database (volume `pg_data_in`) | internal only |
| `1darjeeling_in_minio` | object storage: public listing images + private KYC documents (volume `minio_data_in`) | internal only — no published host port, by design (see §8) |

> **Retired 2026-09-07.** A second stack — project `1darjeeling-prod`, containers
> `1darjeeling_prod_*`, volumes `pg_data_prod` / `minio_data_prod`, port 8091, in
> `/var/www/1darjeelingvv1`, serving `onedarjeeling.duckdns.org` — used to run beside this one. It
> is decommissioned. Anything named `*_prod_*` or bound to 8091 on this box is a leftover to be
> cleaned up, not a service to be restarted. Its volumes may still hold the only copy of some data,
> so confirm before `docker volume rm`.

---

## 2. Inventory — what is actually running

```sh
# Every compose project on the box + the path to its compose file
docker compose ls --all

# Every container, including stopped/restarting ones (where crash-loops hide)
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'

# Domain → port mapping (the link between Nginx and containers)
for f in /etc/nginx/sites-enabled/*; do
  echo "── $(basename "$f")"
  grep -hE "server_name|proxy_pass" "$f" | sed 's/^[[:space:]]*/   /'
done

# Data volumes — the only things here you cannot rebuild
docker volume ls

# Certs and expiry
sudo certbot certificates | grep -E "Certificate Name|Domains|Expiry"

# Disk
docker system df
du -sh /var/www/*
```

Cross-reference the port from the Nginx block against `docker ps` to know which container serves a
domain. That mapping is also how you check a port is free before assigning one to a new project.

---

## 3. Deploying

Routine deploys are automatic: push to `prod` → GitHub Actions runs the backend test suite and the
frontend builds → on green, it SSHes in and rebuilds this app's containers only. See
`.github/workflows/deploy-prod.yml`.

There is **one** auto-deploy path:

| Branch | Workflow | Stack | Compose file | Domain |
| ------ | -------- | ----- | ------------ | ------ |
| `prod` | `deploy-prod.yml` | `1darjeeling-in` | `docker-compose.in.yml` | `aanganerp.in` |

> **Retired 2026-09-07.** There used to be a second stack — `main` → `deploy.yml` →
> `docker-compose.prod.yml` → `onedarjeeling.duckdns.org`, in `/var/www/1darjeelingvv1`. It has been
> decommissioned on the VPS, and its workflow, compose file and host-nginx example are deleted from
> the repo. `main` no longer deploys anywhere. If you find a `docker-compose.prod.yml` or a
> `1darjeeling-prod-*` container on this box, it is a leftover, not a running service.

Manual deploy (from `/var/www/1darjeeling-in`):

```sh
docker compose -f docker-compose.in.yml up -d --build
docker compose -f docker-compose.in.yml ps
curl -I http://127.0.0.1:8092/          # 200 straight from the container
```

The backend applies database migrations (`drizzle-kit migrate`) on start, then serves. Migrations
are versioned SQL in `backend/drizzle/`, tracked in a ledger, so each runs exactly once.

**Always pass `-f docker-compose.in.yml`.** A bare `docker compose` in this directory picks up
the dev `docker-compose.yml` instead.

---

## 4. Troubleshooting

**Start here. One line usually names the cause:**

```sh
docker logs 1darjeeling_in_backend --tail 50
```

### Backend restarting / crash-looping

`docker ps` shows `Restarting (1)`. The backend validates its config at startup and **refuses to
boot** rather than run insecurely — so most crash loops are a deliberate refusal telling you what's
wrong. All of these are fixed by editing `/var/www/1darjeeling-in/.env` and re-running
`docker compose -f docker-compose.in.yml up -d backend`.

| Log line | Meaning | Fix |
| -------- | ------- | --- |
| `APP_ENV is required and must be one of…` | `APP_ENV` unset | Set `APP_ENV=production`. Never left to default — guessing "development" would enable the mock-OTP bypass in production |
| `<VAR> is still set to the "change_me…" placeholder` | `.env.production.example` copied but not filled in | Replace with a real value: `openssl rand -hex 32` |
| `<VAR> must be set when APP_ENV=production` | Secret missing entirely | Set it |
| `<VAR> is still set to its development default` | A dev default leaked into prod | Set a real value |
| `CORS_ORIGINS must not be "*" when APP_ENV=production` | Wildcard CORS | `CORS_ORIGINS=https://aanganerp.in` |
| `MOCK_PAYMENTS must be set explicitly when APP_ENV=production` | The line is missing from `.env` entirely | Set it to `false` (charge real money) or `true` (simulate before go-live). It is refused rather than defaulted because the old default was `true`, which silently left `/api/payments/mock/complete` live — letting any logged-in user grant themselves a paid membership or activate a provider for ₹0 |
| `RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required when MOCK_PAYMENTS=false` | Real payments on, no keys | Either fill the Razorpay values, or set `MOCK_PAYMENTS=true` until you're ready to charge |
| `RAZORPAY_WEBHOOK_SECRET is required when MOCK_PAYMENTS=false` | No webhook secret | See README → "Razorpay setup" |
| `RAZORPAY_KEY_ID is a test key (rzp_test_*) but APP_ENV=production` | Test key in production | Use `rzp_live_*` keys |
| `DATABASE_URL environment variable is required` | Compose didn't compute it | Check `POSTGRES_USER`/`PASSWORD`/`DB` are all set in `.env` |
| `MINIO_PUBLIC_URL is set to a localhost URL … but APP_ENV=production` | `MINIO_PUBLIC_URL` still points at `localhost`/`127.0.0.1` | Set it to the real public site origin, e.g. `https://aanganerp.in` — see §8 |
| `MOCK_PAYMENTS=true with APP_ENV=production` | **Warning, not fatal** | Expected before go-live; payments are simulated |

**Database connection refused after changing `POSTGRES_PASSWORD`:** the Postgres volume initialises
its password *once*, on first start. Changing it in `.env` later doesn't change the database — the
backend then can't connect. Either revert the password, or (only if the data is expendable):

```sh
docker compose -f docker-compose.in.yml down
docker volume rm 1darjeeling-prod_pg_data_in   # DESTROYS ALL DATA
docker compose -f docker-compose.in.yml up -d
```

### Deploy fails at SSH

```
ssh: handshake failed: ssh: unable to authenticate, attempted methods [none publickey]
```

An unset GitHub secret becomes an **empty string**, so a missing `VPS_USER` reaches sshd as a blank
username and looks exactly like a broken key. The workflow's "Check required secrets are set" step
now catches this first and names the variable. If it still fails, the VPS log is definitive:

```sh
sudo journalctl -u ssh -n 30 --no-pager | grep -iE "accepted|invalid user"
```

- `Invalid user ` (blank) → a repo secret is missing (`VPS_USER` = `deploy`)
- `Invalid user <name>` → `VPS_USER` doesn't match a real account
- `Accepted publickey for deploy` → SSH is fine; the failure is later in the script
- *No entry at all* → wrong host/port, or a firewall

### Site returns 502

The container behind the port is down, or Nginx points at the wrong port. Check `docker ps` for
that project, then confirm the port in `/etc/nginx/sites-enabled/<domain>` matches what the
container publishes.

### Checking the app end to end

```sh
curl -I http://127.0.0.1:8092/                        # container directly (bypasses TLS + system Nginx)
curl -s https://aanganerp.in/api         # through the whole chain → {"app":"1 Darjeeling","status":"ok"}
```

If the first works and the second doesn't, the problem is system Nginx or DNS — not this app.

---

## 5. Safety rules on a shared box

These affect **other projects**, not just this one:

| Don't | Why | Do instead |
| ----- | --- | ---------- |
| `docker system prune -a` | Removes images/networks other projects rely on | `docker builder prune -f` (build cache only) |
| `docker compose down -v` | **`-v` deletes volumes = that project's database** | `down` without `-v` |
| `docker compose …` without `-f docker-compose.in.yml` | Picks up the dev compose file | Always pass `-f` |
| Editing an existing file in `/etc/nginx/sites-available/` | One bad reload takes down every site | Only *add* a new site file; `sudo nginx -t` before reloading |
| Reusing one SSH deploy key across repos | Anyone able to edit a workflow in *any* sharing repo gets the key to all | One key per repo, `-C` named after the repo |

`sudo nginx -t` must print "syntax is ok" **before** `sudo systemctl reload nginx`. Certbot's
renewal timer is shared; this app's cert needs no separate setup.

---

## 6. Adding a new project to this box

1. Pick an unused loopback port (`sudo ss -tlnp | grep <port>` prints nothing).
2. Bind it `127.0.0.1:<port>:80` — **never** `0.0.0.0`, which exposes it raw to the internet,
   bypassing TLS.
3. Give the compose file an explicit `name:` so it can't collide with another project's services.
4. Add a *new* file to `/etc/nginx/sites-available/`, symlink it, `nginx -t`, reload.
5. `sudo certbot --nginx -d <domain>`.

---

## 7. Known issues on this box (2026-07-17)

Observed while inventorying; none are caused by this app, and all are outside this repo.

| Issue | Detail | Suggested action |
| ----- | ------ | ---------------- |
| **`task-tracker-s47-web-1` is internet-exposed** | Publishes `0.0.0.0:8080->80/tcp`; every other app uses `127.0.0.1`. Reachable at `http://<vps-ip>:8080`, bypassing Nginx and TLS | Rebind to `127.0.0.1:8080:80` |
| **`dashboard-rk.duckdns.org` → nothing** | Nginx proxies to `localhost:4000`, but no container publishes 4000 (`doptor-api` exposes it internally only) | Likely serving 502s — fix the port or remove the site |
| **Orphan cert** | `studio-tracker.duckdns.org` has a valid cert but no enabled Nginx site | `sudo certbot delete --cert-name studio-tracker.duckdns.org` if the project is gone |
| **13.11GB build cache** | Larger than all images combined (3.7GB); 10.65GB reclaimable | `docker builder prune -f` |
| **Stale SSH deploy keys** | `deploy`'s `authorized_keys` holds three keys all commented `github-actions-deploy` (one duplicated), so none can be safely revoked — you can't tell what each is for | Identify each from its project's deploy log fingerprint, drop the duplicate and any orphan |
| ~~**No database backups**~~ ✅ RESOLVED | ~~`pg_data_in` has no backup~~ Both stacks now run a `db-backup` sidecar taking a daily `pg_dump` — see §7.1. Other projects on this box are still unbacked | Copy the dumps off the box (§7.1) — on-host backups do not survive losing the host |
| **Untracked directories** | `/var/www/app` (1020M) and `/var/www/Raj-kamal-mono-repo` (78M) have no running compose project | Confirm whether they're live, archive if not |

### 7.1 Database backups

Each stack runs a `db-backup` sidecar (`1darjeeling_in_db_backup`, `1darjeeling_in_db_backup`)
that takes a `pg_dump -Fc` immediately on start and then every 24 hours, keeping 14 days. The
script is `deploy/backup/pg-backup.sh`; both are tunable from the stack's `.env` via
`BACKUP_INTERVAL_SECONDS` and `BACKUP_RETENTION_DAYS`.

Dumps land in the `pg_backups_prod` / `pg_backups_in` volumes — separate from the data volumes on
purpose, so a restore that wipes the data volume cannot take the backups with it.

**Check it is actually running** (do this after any deploy that changes the stack):

```bash
docker logs 1darjeeling_in_db_backup --tail 5
# => [pg-backup] ... wrote /backups/one_darjeeling_20260804_041500.dump (2.4M)

# List what's there:
docker run --rm -v 1darjeeling-in_pg_backups_in:/backups alpine ls -lh /backups
```

**Copy them off the box.** Use `deploy/backup/sync-offsite-backup.sh` to extract and compress backup volumes off the host:

```bash
# On the VPS (or remotely over SSH):
chmod +x deploy/backup/sync-offsite-backup.sh
./deploy/backup/sync-offsite-backup.sh 1darjeeling-in /var/backups/1darjeeling

# Or via remote SSH directly:
ssh root@187.127.185.82 \
  'docker run --rm -v 1darjeeling-in_pg_backups_in:/backups alpine tar cz -C /backups .' \
  > 1darjeeling-in-backups-$(date +%Y%m%d).tar.gz
```

### 7.2 Database & Object Storage Maintenance Utilities

The backend contains utility scripts in `backend/scripts/` for database domain URL migration and MinIO storage orphan cleanup:

```bash
# 1. Rewrite asset domain URLs in PostgreSQL (e.g. from staging to production domain)
npx tsx scripts/rewrite-prod-urls.ts --from https://aanganerp.in --to https://aanganerp.in [--dry-run]

# 2. Scan and prune unreferenced orphan files in MinIO public & private KYC storage
npx tsx scripts/cleanup-orphan-storage.ts [--execute]
```

The dumps contain every booking, phone number, and provider record in the system — the same class
of personal data as §8's warning about MinIO backups. Store the copies at least as carefully as the
database itself.

**Restore into a running stack** (destructive — it replaces the current contents):

```bash
# 1. Stop the backend so nothing writes mid-restore. Leave postgres up.
docker stop 1darjeeling_in_backend

# 2. Restore. --clean --if-exists drops the existing objects first; without it the restore
#    fails on every table that already exists.
docker run --rm -i --network container:1darjeeling_in_postgres \
  -v 1darjeeling-in_pg_backups_in:/backups \
  -e PGPASSWORD='<POSTGRES_PASSWORD from .env>' \
  postgres:15-alpine \
  pg_restore -h localhost -U <POSTGRES_USER> -d <POSTGRES_DB> --clean --if-exists \
  /backups/<one_darjeeling_YYYYMMDD_HHMMSS.dump>

# 3. Bring the backend back.
docker start 1darjeeling_in_backend
```

A `.partial` file is an interrupted backup and is never a valid restore source — the script renames
to `.dump` only after `pg_dump` succeeds, so trust the extension.

**Uploaded files are NOT in these dumps.** Listing photos and KYC documents live in MinIO, not
Postgres. A database restore without a matching MinIO restore (§8) gives you rows pointing at
objects that no longer exist. Back up and restore the two together.

---

## 8. Object storage (MinIO)

The prod stack runs a `minio` service alongside postgres/backend/nginx, with its data on a
persistent named volume, **`minio_data_in`** (same durability story as `pg_data_in` — it
survives `docker compose down`, but not `down -v`). It holds two buckets with very different
sensitivity:

| Bucket | Env var | Visibility | Served by |
| ------ | ------- | ---------- | --------- |
| `one-darjeeling` (default) | `MINIO_BUCKET` | **Public** — listing images | nginx, via `location /one-darjeeling/` in `deploy/nginx/app.conf`, proxying to MinIO |
| `one-darjeeling-kyc` (default) | `MINIO_KYC_BUCKET` | **Private** — Aadhaar/PAN/licence scans | Only the backend's authenticated `GET /api/providers/kyc/:id/file` route |

**⚠️ The KYC bucket holds government identity documents.** It has no public-read policy, and
nginx has no route to it — `app.conf` carries both a comment explaining why and an explicit
`return 404` on that path prefix as defense-in-depth. Never publish MinIO's port to work around
this, never add an nginx location for the KYC bucket "for consistency" with the public one, and
treat any backup of `minio_data_in` as containing sensitive personal data (see backup guidance
below).

MinIO deliberately has **no published host port** (unlike dev, which exposes 9000/9001) — the
backend reaches it over the internal compose network only, and the public bucket is reached
through nginx, not MinIO directly. This is the same "internal only" pattern postgres already
uses in this file.

### Reaching the MinIO console without publishing a port

For occasional debugging (browsing objects, checking bucket policies), don't add a `ports:` entry
to `docker-compose.in.yml` — that's a permanent hole. Use one of these instead, and close it
when you're done:

**Quickest — shell straight into the container**, which already sits on `localhost:9000`/`:9001`
from its own point of view:

```sh
# On the VPS:
docker exec -it 1darjeeling_in_minio sh
# From inside the container, curl the API or use `mc` (MinIO's CLI) against localhost:9000.
```

**For the web console in a browser**, tunnel to the container's IP on Docker's bridge network —
reachable from the VPS host even though nothing is published, because the host always has a route
to its own bridge subnets. No host port is ever bound, and the tunnel closes when you disconnect:

```sh
# On the VPS: find the container's address on the compose network.
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 1darjeeling_in_minio
# => e.g. 172.20.0.4

# From your local machine — replace <vps-host> and the IP from above:
ssh -L 9001:172.20.0.4:9001 deploy@<vps-host>
# Then browse http://localhost:9001 on your machine. Ctrl-C the ssh command when done.
```

Whichever method you use, never bind a MinIO port to `0.0.0.0` — that puts the object store,
including the KYC bucket, directly on the internet.

### Backup and restore

Same shape as a Postgres volume backup — stop the container so no writes land mid-copy, tar the
volume via a throwaway container, then restart:

```sh
# Backup — run from anywhere with docker access to the VPS:
docker compose -f docker-compose.in.yml stop minio
docker run --rm -v 1darjeeling-prod_minio_data_in:/data -v "$PWD":/backup alpine \
  tar czf /backup/minio_data_in_$(date +%Y%m%d).tar.gz -C /data .
docker compose -f docker-compose.in.yml start minio
```

```sh
# Restore (into a fresh/empty volume) — DESTROYS whatever is currently in the volume:
docker compose -f docker-compose.in.yml stop minio
docker run --rm -v 1darjeeling-prod_minio_data_in:/data -v "$PWD":/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/minio_data_in_YYYYMMDD.tar.gz -C /data"
docker compose -f docker-compose.in.yml start minio
```

**Handle these archives as sensitive personal data.** The tarball contains both bucket's raw
files — including every Aadhaar/PAN/licence scan ever uploaded. Encrypt it at rest (e.g.
`gpg -c` before it leaves the VPS) and off the box, restrict who can read it, and don't attach it
to a ticket or chat unencrypted. This is the same class of data a Postgres backup of the `kyc_documents`
table would contain, if that table stored file bytes instead of object keys — it doesn't, precisely
so backups of the database and backups of the object store are each incomplete on their own; you
need to protect both.

---

## 9. Retired: the second stack

> This section documented a one-time migration that brought the `1darjeeling.in` (now
> `aanganerp.in`) stack up alongside `onedarjeeling.duckdns.org`, copying Postgres and MinIO data
> across from it. Both the migration and the source stack are gone as of 2026-09-07, so the
> procedure is no longer runnable and has been removed rather than left to mislead. `git log`
> has it if you need the history.

---

## See also

- `README.md` — first-time VPS setup, environment variables, Razorpay setup, migrations
- `INVESTIGATION.md` — security audit: what was fixed, what's still open
- `docker-compose.in.yml` — the production stack, with notes on why it's isolated from dev
