-- 027_price_history_indexes.sql
-- Covering partial index for price_history — speeds up all "latest price" lookups.
-- Also caches Steam item_nameid for histogram API.

CREATE INDEX IF NOT EXISTS idx_price_history_steam_latest
  ON price_history(market_hash_name, recorded_at DESC)
  WHERE source = 'steam' AND price_usd > 0;

CREATE TABLE IF NOT EXISTS steam_item_nameids (
  market_hash_name TEXT PRIMARY KEY,
  item_nameid      INTEGER NOT NULL,
  fetched_at       TIMESTAMPTZ DEFAULT NOW()
);
