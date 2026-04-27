-- 036_alert_snooze.sql
-- Server-side snooze for price alerts. Replaces P5 device-local
-- SharedPreferences fallback (which lost state on reinstall / device change).
--
-- Convention: while snoozed, is_active=FALSE so existing engine queries skip
-- the row; engine additionally guards on snooze_until so a manual re-enable
-- doesn't accidentally fire during the snooze window. Engine auto-clears
-- snooze_until and flips is_active=TRUE on the next eval cycle after expiry.
-- Index is partial — only snoozed rows live in it (small subset of total alerts).

ALTER TABLE price_alerts
  ADD COLUMN IF NOT EXISTS snooze_until TIMESTAMPTZ NULL;
CREATE INDEX IF NOT EXISTS idx_price_alerts_snooze
  ON price_alerts (snooze_until) WHERE snooze_until IS NOT NULL;
