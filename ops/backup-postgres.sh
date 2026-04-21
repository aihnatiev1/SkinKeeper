#!/usr/bin/env bash
#
# SkinKeeper Postgres backup — local dump + offsite copy.
#
# Runs as the skinkeeper user via systemd timer (see ops/systemd/).
# Pipes pg_dump through gzip to /opt/skinkeeper/backups, then rclone-copies
# the new file to an offsite remote. Local retention 14 days; offsite
# retention is managed by the object store's lifecycle policy.
#
# Env vars (loaded from /opt/skinkeeper/backend/.env by the systemd unit):
#   DB_USER            postgres role (e.g. skinkeeper)
#   DB_NAME            database name (e.g. skinkeeper)
#   PGPASSWORD         postgres password for DB_USER
#   BACKUP_DIR         local dir (default /opt/skinkeeper/backups)
#   BACKUP_RCLONE_REMOTE  rclone remote:path to copy into
#                      (e.g. b2:skinkeeper-backups/postgres). Leave
#                      empty to skip the offsite copy — backups will
#                      still land locally. DO NOT leave empty in prod.
#
# Exit codes: 0 ok, non-zero failure. systemd captures stderr+stdout.
set -euo pipefail

: "${DB_USER:?DB_USER must be set}"
: "${DB_NAME:?DB_NAME must be set}"
: "${PGPASSWORD:?PGPASSWORD must be set}"
BACKUP_DIR="${BACKUP_DIR:-/opt/skinkeeper/backups}"
REMOTE="${BACKUP_RCLONE_REMOTE:-}"

mkdir -p "$BACKUP_DIR"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="db_${TIMESTAMP}.sql.gz"
OUT="${BACKUP_DIR}/${FILE}"

echo "[backup] dumping ${DB_NAME} → ${OUT}"
pg_dump -U "$DB_USER" -h localhost "$DB_NAME" | gzip --rsyncable > "$OUT"

# Basic sanity: dump should be larger than the gzip header (20 bytes).
SIZE="$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")"
if [[ "$SIZE" -lt 1024 ]]; then
  echo "[backup] ERROR: dump suspiciously small (${SIZE} bytes)" >&2
  exit 1
fi

echo "[backup] local dump ok (${SIZE} bytes)"

# ─── Offsite ────────────────────────────────────────────────────────
if [[ -n "$REMOTE" ]]; then
  if command -v rclone >/dev/null 2>&1; then
    echo "[backup] uploading to ${REMOTE}"
    rclone copy --quiet "$OUT" "$REMOTE/"
    echo "[backup] offsite ok"
  else
    echo "[backup] WARN: rclone not installed, skipping offsite" >&2
  fi
else
  echo "[backup] WARN: BACKUP_RCLONE_REMOTE not set, offsite skipped" >&2
fi

# ─── Local retention (14 days) ──────────────────────────────────────
find "$BACKUP_DIR" -maxdepth 1 -name 'db_*.sql.gz' -mtime +14 -print -delete \
  | sed 's/^/[backup] pruned /'

echo "[backup] done"
