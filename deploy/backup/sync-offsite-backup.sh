#!/bin/sh
# Remote off-site PostgreSQL backup replication script for 1 Darjeeling.
#
# Syncs local .dump files from BACKUP_DIR to REMOTE_BACKUP_S3_BUCKET.
# Supported via AWS CLI or S3-compatible APIs (MinIO, Wasabi, AWS S3, Cloudflare R2).
#
# Environment variables:
#   BACKUP_DIR                - Local directory containing dumps (default: /backups)
#   REMOTE_BACKUP_S3_BUCKET   - Target S3 bucket path (e.g. s3://my-offsite-backups/1darjeeling)
#   AWS_ACCESS_KEY_ID         - Remote S3 credentials
#   AWS_SECRET_ACCESS_KEY     - Remote S3 secret
#   AWS_DEFAULT_REGION        - Remote S3 region (default: us-east-1)

set -eu

BACKUP_DIR="${BACKUP_DIR:-/backups}"
REMOTE_BUCKET="${REMOTE_BACKUP_S3_BUCKET:-}"

log() {
  echo "[sync-offsite] $(date -u '+%Y-%m-%dT%H:%M:%SZ') $*"
}

if [ -z "$REMOTE_BUCKET" ]; then
  log "REMOTE_BACKUP_S3_BUCKET is unset; skipping remote replication."
  exit 0
fi

log "Starting sync of $BACKUP_DIR to $REMOTE_BUCKET..."

if command -v aws >/dev/null 2>&1; then
  aws s3 sync "$BACKUP_DIR" "$REMOTE_BUCKET" --exclude "*.partial"
  log "Sync complete via AWS CLI."
elif command -v rclone >/dev/null 2>&1; then
  rclone sync "$BACKUP_DIR" "$REMOTE_BUCKET" --exclude "*.partial"
  log "Sync complete via rclone."
else
  log "ERROR: Neither 'aws' nor 'rclone' CLI tool is installed in the container image."
  exit 1
fi
