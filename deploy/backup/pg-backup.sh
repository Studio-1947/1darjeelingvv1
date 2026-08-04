#!/bin/sh
# Periodic Postgres backup for the 1 Darjeeling stacks.
#
# Runs as a sidecar container beside Postgres (see docker-compose.prod.yml / docker-compose.in.yml)
# rather than as a host cron job, so a backup schedule ships with the stack and cannot be forgotten
# on a rebuild. deploy/VPS-RUNBOOK.md §7 carried "No database backups" as a known issue from the
# day the box was set up; this is what closes it.
#
# WHAT THIS PROTECTS AGAINST: a bad migration, a mistaken DELETE, a corrupted table, a container
# recreated against the wrong volume. Restoring is a `pg_restore` away.
#
# WHAT IT DOES NOT PROTECT AGAINST: losing the VPS. The dumps live in a Docker volume on the same
# host as the database they came from, so a dead disk takes both. Copying them off the box is a
# separate step and it is described in the runbook — treat this script as necessary, not
# sufficient.
#
# The dumps contain every booking, phone number and provider record in the system. Whatever
# off-host copy is set up must be at least as protected as the database itself.

set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
INTERVAL_SECONDS="${BACKUP_INTERVAL_SECONDS:-86400}"   # daily
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"

log() {
  echo "[pg-backup] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"
}

take_backup() {
  stamp="$(date -u '+%Y%m%d_%H%M%S')"
  target="${BACKUP_DIR}/${PGDATABASE}_${stamp}.dump"
  tmp="${target}.partial"

  # -Fc is Postgres's custom format: compressed, and restorable table-by-table with pg_restore
  # rather than all-or-nothing like a plain SQL file.
  #
  # Written to a .partial name and renamed only on success, so a backup interrupted half-way
  # (container stopped, disk full) can never be mistaken for a complete one during a restore —
  # which is the moment when that mistake costs the most.
  if pg_dump -Fc --no-owner --no-acl -f "$tmp" 2>/tmp/pg_dump.err; then
    mv "$tmp" "$target"
    size="$(du -h "$target" | cut -f1)"
    log "wrote $target ($size)"
  else
    rm -f "$tmp"
    log "FAILED: $(cat /tmp/pg_dump.err)"
    return 1
  fi
}

prune_old() {
  # -mtime +N is "older than N days". Only ever matches this database's completed dumps, so
  # nothing else that shares the volume can be caught by it.
  deleted="$(find "$BACKUP_DIR" -maxdepth 1 -name "${PGDATABASE}_*.dump" -type f -mtime "+${RETENTION_DAYS}" -print -delete | wc -l)"
  if [ "$deleted" -gt 0 ]; then
    log "pruned $deleted backup(s) older than ${RETENTION_DAYS} days"
  fi
}

log "starting — database=${PGDATABASE} host=${PGHOST} interval=${INTERVAL_SECONDS}s retention=${RETENTION_DAYS}d"

# A backup is taken immediately on start rather than after the first full interval. Without this,
# a stack redeployed daily would restart the timer every time and never actually produce one.
while true; do
  take_backup || log "continuing despite failure; will retry next interval"
  prune_old
  sleep "$INTERVAL_SECONDS"
done
