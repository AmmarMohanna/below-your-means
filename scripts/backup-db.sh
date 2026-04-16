#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${1:-$PWD}"
DB_PATH="${DB_PATH:-data/belowyourmeans.db}"
BACKUP_DIR="${BACKUP_DIR:-backups}"
KEEP_BACKUPS="${KEEP_BACKUPS:-30}"

cd "$APP_DIR"
mkdir -p "$BACKUP_DIR"

if [[ ! -f "$DB_PATH" ]]; then
  echo "No database found at $DB_PATH, skipping backup."
  exit 0
fi

# If app is running, try WAL checkpoint + integrity check before copy.
# If this pre-check fails (for example due low server resources), continue
# with a file-level backup so deployments are not blocked.
if docker compose ps --status running app >/dev/null 2>&1; then
  set +e
  docker compose exec -T app node -e "\
    const Database=require('better-sqlite3');\
    const db=new Database('/app/data/belowyourmeans.db');\
    const check=db.pragma('integrity_check', { simple: true });\
    if (check !== 'ok') { console.error('Integrity check failed:', check); process.exit(1); }\
    db.pragma('wal_checkpoint(TRUNCATE)');\
    db.close();\
  "
  CHECK_EXIT=$?
  set -e

  if [[ "$CHECK_EXIT" -ne 0 ]]; then
    echo "Warning: checkpoint/integrity pre-check failed (exit ${CHECK_EXIT}). Continuing with file backup."
  fi
else
  echo "App container is not running; skipping pre-backup checkpoint."
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/belowyourmeans-${STAMP}.tar.gz"
DB_DIR="$(dirname "$DB_PATH")"
DB_FILE="$(basename "$DB_PATH")"

if [[ -f "${DB_DIR}/${DB_FILE}-wal" || -f "${DB_DIR}/${DB_FILE}-shm" ]]; then
  tar -czf "$BACKUP_FILE" -C "$DB_DIR" "$DB_FILE" "${DB_FILE}-wal" "${DB_FILE}-shm" 2>/dev/null || \
    tar -czf "$BACKUP_FILE" -C "$DB_DIR" "$DB_FILE"
else
  tar -czf "$BACKUP_FILE" -C "$DB_DIR" "$DB_FILE"
fi

# Keep latest N backups
ls -1t "${BACKUP_DIR}"/belowyourmeans-*.tar.gz 2>/dev/null | tail -n +$((KEEP_BACKUPS + 1)) | xargs -r rm -f

echo "Backup created: ${BACKUP_FILE}"
