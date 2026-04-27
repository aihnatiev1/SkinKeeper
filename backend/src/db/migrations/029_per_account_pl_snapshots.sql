-- 029_per_account_pl_snapshots.sql
-- Per-account daily P/L snapshots: replace user-only unique constraint
-- with a composite that includes steam_account_id.

ALTER TABLE daily_pl_snapshots DROP CONSTRAINT IF EXISTS daily_pl_snapshots_user_id_snapshot_date_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_daily_pl_user_account_date
  ON daily_pl_snapshots (user_id, COALESCE(steam_account_id, 0), snapshot_date);
