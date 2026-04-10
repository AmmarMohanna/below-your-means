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

# If app is running, force WAL checkpoint + integrity check before copy.
if docker compose ps --status running app >/dev/null 2>&1; then
  docker compose exec -T app node -e "\
    const Database=require('better-sqlite3');\
    const db=new Database('/app/data/belowyourmeans.db');\
    const check=db.pragma('integrity_check', { simple: true });\
    if (check !== 'ok') { console.error('Integrity check failed:', check); process.exit(1); }\
    db.pragma('wal_checkpoint(TRUNCATE)');\
    db.close();\
  "
else
  docker compose run --rm --no-deps app node -e "\
    const Database=require('better-sqlite3');\
    const db=new Database('/app/data/belowyourmeans.db');\
    const check=db.pragma('integrity_check', { simple: true });\
    if (check !== 'ok') { console.error('Integrity check failed:', check); process.exit(1); }\
    db.pragma('wal_checkpoint(TRUNCATE)');\
    db.close();\
  " >/dev/null
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
