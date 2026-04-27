-- 025_watchlist.sql
-- Watchlist: track items you don't own via price_alerts.

ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS is_watchlist BOOLEAN DEFAULT FALSE;
ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS icon_url TEXT;
