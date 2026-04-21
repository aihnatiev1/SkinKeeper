# Postgres Backups — Operations Runbook

Daily pg_dump to `/opt/skinkeeper/backups` plus offsite copy to an
rclone remote. Local retention 14 days; offsite retention managed by
the object store's lifecycle policy (recommend 30–90 days).

---

## One-time setup on the VPS

### 1. Install rclone

```bash
sudo -v && curl https://rclone.org/install.sh | sudo bash
```

### 2. Configure an rclone remote (run as `skinkeeper` user)

Choose any S3-compatible provider. Backblaze B2 example:

```bash
sudo -u skinkeeper rclone config
# n) New remote
# name > b2
# Storage > backblaze
# paste Application Key ID + Application Key
# leave defaults
```

Verify:

```bash
sudo -u skinkeeper rclone lsd b2:
```

Create a dedicated bucket (off the root account's bucket list) with
object lock / versioning enabled — protects against ransomware deleting
the backups too.

### 3. Set env vars in `/opt/skinkeeper/backend/.env`

```env
BACKUP_RCLONE_REMOTE=b2:skinkeeper-backups/postgres
# DB_USER, DB_NAME, PGPASSWORD already present for the API
```

### 4. Install the backup script + systemd units

```bash
sudo mkdir -p /opt/skinkeeper/ops
sudo cp ops/backup-postgres.sh ops/restore-postgres.sh /opt/skinkeeper/ops/
sudo chmod +x /opt/skinkeeper/ops/*.sh
sudo chown -R skinkeeper:skinkeeper /opt/skinkeeper/ops

sudo cp ops/systemd/skinkeeper-backup.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now skinkeeper-backup.timer
```

### 5. Verify

```bash
# Trigger a manual run
sudo systemctl start skinkeeper-backup.service

# Watch logs
sudo journalctl -u skinkeeper-backup.service -f

# Timer status
sudo systemctl list-timers skinkeeper-backup.timer
```

---

## Daily operation

- Timer fires at 03:00 UTC daily.
- Each run: pg_dump → gzip → local `/opt/skinkeeper/backups/db_TIMESTAMP.sql.gz`
  → rclone copy to offsite remote → prune local files older than 14 days.
- Failures land in `journalctl -u skinkeeper-backup.service` and — since
  the systemd unit exits non-zero — in the next `systemctl status`.

Hook up an alert (e.g. via a cron-monitoring service) to the unit's
exit status if you want to be paged on failure.

---

## Restoring

### From local backup

```bash
cd /opt/skinkeeper
pm2 stop skinkeeper-api
sudo -u postgres psql -c "DROP DATABASE skinkeeper;"
sudo -u postgres psql -c "CREATE DATABASE skinkeeper OWNER skinkeeper;"
sudo -u skinkeeper bash -c '
  source /opt/skinkeeper/backend/.env
  export DB_USER DB_NAME PGPASSWORD
  /opt/skinkeeper/ops/restore-postgres.sh /opt/skinkeeper/backups/db_YYYYMMDDTHHMMSSZ.sql.gz
'
pm2 start skinkeeper-api
curl -fsS https://api.skinkeeper.store/api/health
```

### From offsite

```bash
./restore-postgres.sh --from-remote b2:skinkeeper-backups/postgres/db_YYYYMMDDTHHMMSSZ.sql.gz
```

Needs rclone + env vars loaded the same way.

---

## DR drill — do this quarterly

1. Spin up a throwaway Postgres (e.g. `docker run postgres:17`).
2. Set env vars to point at that throwaway DB.
3. Run `restore-postgres.sh --from-remote <most-recent>` with
   `SKINKEEPER_RESTORE_YES=1`.
4. Spot-check: row counts match, latest purchase_receipts present,
   price_history has entries within the last 24h of the backup.
5. Tear down.

The drill validates both the backup integrity AND the restore script —
untested backups are not backups.

---

## Security notes

- Do **not** commit `/opt/skinkeeper/backend/.env` or the rclone config.
- The object store bucket should be private + server-side encrypted.
  Enable object lock if the provider supports it.
- Rotate the rclone credentials annually. If a VPS compromise is
  suspected, rotate immediately and audit `rclone lsf` for unexpected
  objects.
- Dumps contain every user row, every Steam session token, every
  purchase receipt. Treat them as production data.
