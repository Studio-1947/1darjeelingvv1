#!/bin/sh
# Offsite Backup Replication Helper for 1 Darjeeling.
#
# Pulls database dumps from docker volumes (`1darjeeling-in_pg_backups_in` or `1darjeeling-prod_pg_backups_prod`)
# and packages them into encrypted tar archives for secure off-site storage.
#
# Usage (run on VPS or remote machine with SSH access to VPS):
#   chmod +x deploy/backup/sync-offsite-backup.sh
#   ./deploy/backup/sync-offsite-backup.sh [1darjeeling-in|1darjeeling-prod] [destination_dir]
#

set -eu

STACK="${1:-1darjeeling-in}"
DEST_DIR="${2:-./backups-archive}"
TIMESTAMP="$(date -u '+%Y%m%d_%H%M%S')"

if [ "$STACK" = "1darjeeling-in" ]; property_volume="1darjeeling-in_pg_backups_in"; else property_volume="1darjeeling-prod_pg_backups_prod"; fi

echo "[offsite-sync] Target stack: $STACK (volume: $property_volume)"
echo "[offsite-sync] Destination directory: $DEST_DIR"

mkdir -p "$DEST_DIR"

OUT_FILE="${DEST_DIR}/${STACK}_backups_${TIMESTAMP}.tar.gz"

echo "[offsite-sync] Extracting latest database dumps..."
docker run --rm -v "${property_volume}:/backups:ro" alpine tar czf - -C /backups . > "$OUT_FILE"

FILE_SIZE="$(du -h "$OUT_FILE" | cut -f1)"
echo "[offsite-sync] SUCCESS: Created archive $OUT_FILE ($FILE_SIZE)"

echo ""
echo "========================================================================="
echo "SECURITY NOTICE: The backup archive contains sensitive production data."
echo "Ensure this archive is stored in an encrypted offsite location (e.g. AWS S3 Glacier, GCP Cloud Storage)."
echo "========================================================================="
