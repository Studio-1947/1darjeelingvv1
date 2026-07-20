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
| `dev.doptor.in` | 3000 | `doptor-super-app-monorepo` | `/var/www/Doptor-super-app-monorepo` |
| `api.dev.doptor.in` | 5000 | `doptor-super-app-monorepo` | `/var/www/Doptor-super-app-monorepo` |
| `s47-task.duckdns.org` | 8080 | `task-tracker-s47` | `/var/www/task-tracker-s47` |
| `s47-social-flow.duckdns.org` | 8082 | `social-flow-deploy` | `/var/www/social-media-dashboard` |
| `dashboard-rk.duckdns.org` | 4000 | — (nothing listening, see §7) | — |

### This app's containers

| Container | Role | Ports |
| --------- | ---- | ----- |
| `1darjeeling_prod_nginx` | serves both frontend builds, proxies `/api` + `/api-docs` to backend | `127.0.0.1:8091->80` |
| `1darjeeling_prod_backend` | Express API | internal only |
| `1darjeeling_prod_postgres` | database (volume `pg_data_prod`) | internal only |

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
| `RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required when MOCK_PAYMENTS=false` | Real payments on, no keys | Either fill the Razorpay values, or set `MOCK_PAYMENTS=true` until you're ready to charge |
| `RAZORPAY_WEBHOOK_SECRET is required when MOCK_PAYMENTS=false` | No webhook secret | See README → "Razorpay setup" |
| `RAZORPAY_KEY_ID is a test key (rzp_test_*) but APP_ENV=production` | Test key in production | Use `rzp_live_*` keys |
| `DATABASE_URL environment variable is required` | Compose didn't compute it | Check `POSTGRES_USER`/`PASSWORD`/`DB` are all set in `.env` |
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

## See also

- `README.md` — first-time VPS setup, environment variables, Razorpay setup, migrations
- `INVESTIGATION.md` — security audit: what was fixed, what's still open
- `docker-compose.prod.yml` — the production stack, with notes on why it's isolated from dev
