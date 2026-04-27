-- 004_trade_offers.sql
-- Trade offers and trade offer items.

ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS trade_token VARCHAR(20);

CREATE TABLE IF NOT EXISTS trade_offers (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction      VARCHAR(10) NOT NULL,     -- 'incoming' | 'outgoing'
  steam_offer_id VARCHAR(20),              -- Steam's trade offer ID
  partner_steam_id VARCHAR(17) NOT NULL,
  partner_name   VARCHAR(100),
  message        TEXT,
  status         VARCHAR(20) NOT NULL DEFAULT 'pending',
  is_quick_transfer BOOLEAN NOT NULL DEFAULT FALSE,
  value_give_cents  INTEGER DEFAULT 0,
  value_recv_cents  INTEGER DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_trade_dir CHECK (direction IN ('incoming','outgoing')),
  CONSTRAINT chk_trade_status CHECK (status IN ('pending','accepted','declined','expired','cancelled','countered','error','awaiting_confirmation','on_hold','invalid'))
);

CREATE TABLE IF NOT EXISTS trade_offer_items (
  id            SERIAL PRIMARY KEY,
  offer_id      UUID NOT NULL REFERENCES trade_offers(id) ON DELETE CASCADE,
  side          VARCHAR(10) NOT NULL,      -- 'give' | 'receive'
  asset_id      VARCHAR(20) NOT NULL,
  market_hash_name VARCHAR(255),
  icon_url      TEXT,
  float_value   DECIMAL(10,8),
  price_cents   INTEGER DEFAULT 0,
  CONSTRAINT chk_item_side CHECK (side IN ('give','receive'))
);

CREATE INDEX IF NOT EXISTS idx_trade_offers_user ON trade_offers(user_id, status);
CREATE INDEX IF NOT EXISTS idx_trade_offer_items ON trade_offer_items(offer_id);
