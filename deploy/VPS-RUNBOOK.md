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
| `onedarjeeling.duckdns.org` | 8091 | `1darjeeling-prod` | `/var/www/1darjeelingvv1` |
| `1darjeeling.in` | 8092 | `1darjeeling-in` | `/var/www/1darjeeling-in` |
| `dev.doptor.in` | 3000 | `doptor-super-app-monorepo` | `/var/www/Doptor-super-app-monorepo` |
| `api.dev.doptor.in` | 5000 | `doptor-super-app-monorepo` | `/var/www/Doptor-super-app-monorepo` |
| `s47-task.duckdns.org` | 8080 | `task-tracker-s47` | `/var/www/task-tracker-s47` |
| `s47-social-flow.duckdns.org` | 8082 | `social-flow-deploy` | `/var/www/social-media-dashboard` |
| `dashboard-rk.duckdns.org` | 4000 | — (nothing listening, see §7) | — |

### This app's containers

| Container | Role | Ports |
| --------- | ---- | ----- |
| `1darjeeling_prod_nginx` | serves both frontend builds, proxies `/api` + `/api-docs` to backend, and proxies the public MinIO bucket path (see §8) | `127.0.0.1:8091->80` |
| `1darjeeling_prod_backend` | Express API | internal only |
| `1darjeeling_prod_postgres` | database (volume `pg_data_prod`) | internal only |
| `1darjeeling_prod_minio` | object storage: public listing images + private KYC documents (volume `minio_data_prod`) | internal only — no published host port, by design (see §8) |

### This app's second stack — 1darjeeling.in (`1darjeeling-in`)

Same shape as the table above, isolated from it (separate project, containers, volumes,
port). Deployed from the `prod` branch by `.github/workflows/deploy-prod.yml`.

| Container | Role | Ports |
| --------- | ---- | ----- |
| `1darjeeling_in_nginx` | serves both frontend builds, proxies `/api` + `/api-docs` to backend, proxies the public MinIO bucket path | `127.0.0.1:8092->80` |
| `1darjeeling_in_backend` | Express API | internal only |
| `1darjeeling_in_postgres` | database (volume `pg_data_in`) | internal only |
| `1darjeeling_in_minio` | object storage: public listing images + private KYC documents (volume `minio_data_in`) | internal only — no published host port, by design (see §8) |

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

Routine deploys are automatic: push to `main` → GitHub Actions runs the backend test suite → on
green, it SSHes in and rebuilds this app's containers only. See `.github/workflows/deploy.yml`.

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

Manual deploy (from `/var/www/1darjeelingvv1`):

```sh
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
curl -I http://127.0.0.1:8091/          # 200 straight from the container
```

The backend applies database migrations (`drizzle-kit migrate`) on start, then serves. Migrations
are versioned SQL in `backend/drizzle/`, tracked in a ledger, so each runs exactly once.

**Always pass `-f docker-compose.prod.yml`.** A bare `docker compose` in this directory picks up
the dev `docker-compose.yml` instead.

---

## 4. Troubleshooting

**Start here. One line usually names the cause:**

```sh
docker logs 1darjeeling_prod_backend --tail 50
```

### Backend restarting / crash-looping

`docker ps` shows `Restarting (1)`. The backend validates its config at startup and **refuses to
boot** rather than run insecurely — so most crash loops are a deliberate refusal telling you what's
wrong. All of these are fixed by editing `/var/www/1darjeelingvv1/.env` and re-running
`docker compose -f docker-compose.prod.yml up -d backend`.

| Log line | Meaning | Fix |
| -------- | ------- | --- |
| `APP_ENV is required and must be one of…` | `APP_ENV` unset | Set `APP_ENV=production`. Never left to default — guessing "development" would enable the mock-OTP bypass in production |
| `<VAR> is still set to the "change_me…" placeholder` | `.env.production.example` copied but not filled in | Replace with a real value: `openssl rand -hex 32` |
| `<VAR> must be set when APP_ENV=production` | Secret missing entirely | Set it |
| `<VAR> is still set to its development default` | A dev default leaked into prod | Set a real value |
| `CORS_ORIGINS must not be "*" when APP_ENV=production` | Wildcard CORS | `CORS_ORIGINS=https://onedarjeeling.duckdns.org` |
| `MOCK_PAYMENTS must be set explicitly when APP_ENV=production` | The line is missing from `.env` entirely | Set it to `false` (charge real money) or `true` (simulate before go-live). It is refused rather than defaulted because the old default was `true`, which silently left `/api/payments/mock/complete` live — letting any logged-in user grant themselves a paid membership or activate a provider for ₹0 |
| `RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required when MOCK_PAYMENTS=false` | Real payments on, no keys | Either fill the Razorpay values, or set `MOCK_PAYMENTS=true` until you're ready to charge |
| `RAZORPAY_WEBHOOK_SECRET is required when MOCK_PAYMENTS=false` | No webhook secret | See README → "Razorpay setup" |
| `RAZORPAY_KEY_ID is a test key (rzp_test_*) but APP_ENV=production` | Test key in production | Use `rzp_live_*` keys |
| `DATABASE_URL environment variable is required` | Compose didn't compute it | Check `POSTGRES_USER`/`PASSWORD`/`DB` are all set in `.env` |
| `MINIO_PUBLIC_URL is set to a localhost URL … but APP_ENV=production` | `MINIO_PUBLIC_URL` still points at `localhost`/`127.0.0.1` | Set it to the real public site origin, e.g. `https://onedarjeeling.duckdns.org` — see §8 |
| `MOCK_PAYMENTS=true with APP_ENV=production` | **Warning, not fatal** | Expected before go-live; payments are simulated |

**Database connection refused after changing `POSTGRES_PASSWORD`:** the Postgres volume initialises
its password *once*, on first start. Changing it in `.env` later doesn't change the database — the
backend then can't connect. Either revert the password, or (only if the data is expendable):

```sh
docker compose -f docker-compose.prod.yml down
docker volume rm 1darjeeling-prod_pg_data_prod   # DESTROYS ALL DATA
docker compose -f docker-compose.prod.yml up -d
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
curl -I http://127.0.0.1:8091/                        # container directly (bypasses TLS + system Nginx)
curl -s https://onedarjeeling.duckdns.org/api         # through the whole chain → {"app":"1 Darjeeling","status":"ok"}
```

If the first works and the second doesn't, the problem is system Nginx or DNS — not this app.

---

## 5. Safety rules on a shared box

These affect **other projects**, not just this one:

| Don't | Why | Do instead |
| ----- | --- | ---------- |
| `docker system prune -a` | Removes images/networks other projects rely on | `docker builder prune -f` (build cache only) |
| `docker compose down -v` | **`-v` deletes volumes = that project's database** | `down` without `-v` |
| `docker compose …` without `-f docker-compose.prod.yml` | Picks up the dev compose file | Always pass `-f` |
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
| **No database backups** | `pg_data_prod` (and every other project's volume) has no backup | Add a `pg_dump` cron before there's real data to lose |
| **Untracked directories** | `/var/www/app` (1020M) and `/var/www/Raj-kamal-mono-repo` (78M) have no running compose project | Confirm whether they're live, archive if not |

---

## 8. Object storage (MinIO)

The prod stack runs a `minio` service alongside postgres/backend/nginx, with its data on a
persistent named volume, **`minio_data_prod`** (same durability story as `pg_data_prod` — it
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
treat any backup of `minio_data_prod` as containing sensitive personal data (see backup guidance
below).

MinIO deliberately has **no published host port** (unlike dev, which exposes 9000/9001) — the
backend reaches it over the internal compose network only, and the public bucket is reached
through nginx, not MinIO directly. This is the same "internal only" pattern postgres already
uses in this file.

### Reaching the MinIO console without publishing a port

For occasional debugging (browsing objects, checking bucket policies), don't add a `ports:` entry
to `docker-compose.prod.yml` — that's a permanent hole. Use one of these instead, and close it
when you're done:

**Quickest — shell straight into the container**, which already sits on `localhost:9000`/`:9001`
from its own point of view:

```sh
# On the VPS:
docker exec -it 1darjeeling_prod_minio sh
# From inside the container, curl the API or use `mc` (MinIO's CLI) against localhost:9000.
```

**For the web console in a browser**, tunnel to the container's IP on Docker's bridge network —
reachable from the VPS host even though nothing is published, because the host always has a route
to its own bridge subnets. No host port is ever bound, and the tunnel closes when you disconnect:

```sh
# On the VPS: find the container's address on the compose network.
docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' 1darjeeling_prod_minio
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
docker compose -f docker-compose.prod.yml stop minio
docker run --rm -v 1darjeeling-prod_minio_data_prod:/data -v "$PWD":/backup alpine \
  tar czf /backup/minio_data_prod_$(date +%Y%m%d).tar.gz -C /data .
docker compose -f docker-compose.prod.yml start minio
```

```sh
# Restore (into a fresh/empty volume) — DESTROYS whatever is currently in the volume:
docker compose -f docker-compose.prod.yml stop minio
docker run --rm -v 1darjeeling-prod_minio_data_prod:/data -v "$PWD":/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/minio_data_prod_YYYYMMDD.tar.gz -C /data"
docker compose -f docker-compose.prod.yml start minio
```

**Handle these archives as sensitive personal data.** The tarball contains both bucket's raw
files — including every Aadhaar/PAN/licence scan ever uploaded. Encrypt it at rest (e.g.
`gpg -c` before it leaves the VPS) and off the box, restrict who can read it, and don't attach it
to a ticket or chat unencrypted. This is the same class of data a Postgres backup of the `kyc_documents`
table would contain, if that table stored file bytes instead of object keys — it doesn't, precisely
so backups of the database and backups of the object store are each incomplete on their own; you
need to protect both.

---

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

---

## See also

- `README.md` — first-time VPS setup, environment variables, Razorpay setup, migrations
- `INVESTIGATION.md` — security audit: what was fixed, what's still open
- `docker-compose.prod.yml` — the production stack, with notes on why it's isolated from dev
