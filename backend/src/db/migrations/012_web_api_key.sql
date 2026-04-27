-- 012_web_api_key.sql
-- Steam Web API key per account for trade offer sync.
-- Unique index on steam_offer_id to enable upsert during sync.

ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS web_api_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trade_offers_steam_id
  ON trade_offers(user_id, steam_offer_id) WHERE steam_offer_id IS NOT NULL;
