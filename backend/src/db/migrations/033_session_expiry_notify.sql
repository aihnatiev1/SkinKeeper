-- 033_session_expiry_notify.sql
-- Track which refresh-token expiry we last pushed a warning for, so the
-- daily session-expiry notifier is idempotent across re-runs.

ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS expiry_notified_for TIMESTAMPTZ;
