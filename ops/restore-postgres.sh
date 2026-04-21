#!/usr/bin/env bash
#
# SkinKeeper Postgres restore — interactive, destructive.
#
# Usage:
#   ./restore-postgres.sh /path/to/db_TIMESTAMP.sql.gz
#   ./restore-postgres.sh --from-remote b2:skinkeeper-backups/postgres/db_…
#
# Loads one dump file into the target database. REPLACES existing data.
# Prompts for confirmation unless SKINKEEPER_RESTORE_YES=1 is set
# (useful for scripted DR drills; do NOT set it on prod without thinking).
#
# Env vars (same as backup script):
#   DB_USER, DB_NAME, PGPASSWORD
#
# Normal procedure:
#   1. Stop the API     : pm2 stop skinkeeper-api
#   2. Drop+recreate DB : psql -U postgres -c 'DROP DATABASE skinkeeper;'
#                        psql -U postgres -c 'CREATE DATABASE skinkeeper OWNER skinkeeper;'
#   3. Run this script  : ./restore-postgres.sh <file>
#   4. Restart API      : pm2 start skinkeeper-api
#   5. Smoke test       : curl -f https://api.skinkeeper.store/api/health
set -euo pipefail

: "${DB_USER:?DB_USER must be set}"
: "${DB_NAME:?DB_NAME must be set}"
: "${PGPASSWORD:?PGPASSWORD must be set}"

SRC="${1:-}"
if [[ -z "$SRC" ]]; then
  echo "Usage: $0 <backup-file.sql.gz | --from-remote <rclone-path>>" >&2
  exit 2
fi

TMPFILE=""
cleanup() { [[ -n "$TMPFILE" ]] && rm -f "$TMPFILE"; }
trap cleanup EXIT

if [[ "$SRC" == "--from-remote" ]]; then
  REMOTE_PATH="${2:?remote path required after --from-remote}"
  TMPFILE="$(mktemp -t skinkeeper-restore-XXXXXX.sql.gz)"
  echo "[restore] pulling ${REMOTE_PATH} → ${TMPFILE}"
  rclone copyto --quiet "$REMOTE_PATH" "$TMPFILE"
  SRC="$TMPFILE"
fi

if [[ ! -f "$SRC" ]]; then
  echo "[restore] ERROR: file not found: $SRC" >&2
  exit 1
fi

echo "[restore] about to REPLACE contents of database ${DB_NAME} from ${SRC}"
if [[ "${SKINKEEPER_RESTORE_YES:-0}" != "1" ]]; then
  read -rp "Type 'yes' to continue: " CONFIRM
  [[ "$CONFIRM" == "yes" ]] || { echo "aborted"; exit 1; }
fi

# Decompress on the fly into psql. Any error surfaces via set -o pipefail.
gunzip -c "$SRC" | psql -U "$DB_USER" -h localhost -d "$DB_NAME" -v ON_ERROR_STOP=1

echo "[restore] done"
