-- 026_current_prices.sql
-- Shared current_prices table: one row per item per source, UPSERT on refresh.
-- Faster than scanning price_history for latest price reads.

CREATE TABLE IF NOT EXISTS current_prices (
  market_hash_name VARCHAR(255) NOT NULL,
  source           VARCHAR(20)  NOT NULL,
  price_usd        DECIMAL(10,2) NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (market_hash_name, source)
);
CREATE INDEX IF NOT EXISTS idx_current_prices_name ON current_prices(market_hash_name);
