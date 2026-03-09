import { pool } from "./pool.js";

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  steam_id      VARCHAR(17) UNIQUE NOT NULL,
  display_name  VARCHAR(100),
  avatar_url    TEXT,
  is_premium    BOOLEAN DEFAULT FALSE,
  premium_until TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS steam_accounts (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER REFERENCES users(id) ON DELETE CASCADE,
  steam_id     VARCHAR(17) NOT NULL,
  display_name VARCHAR(100),
  avatar_url   TEXT,
  added_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, steam_id)
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id               SERIAL PRIMARY KEY,
  steam_account_id INTEGER REFERENCES steam_accounts(id) ON DELETE CASCADE,
  asset_id         VARCHAR(20) NOT NULL,
  market_hash_name VARCHAR(255) NOT NULL,
  icon_url         TEXT,
  wear             VARCHAR(50),
  float_value      DECIMAL(10,8),
  rarity           VARCHAR(50),
  rarity_color     VARCHAR(10),
  tradable         BOOLEAN DEFAULT TRUE,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(steam_account_id, asset_id)
);

CREATE TABLE IF NOT EXISTS price_history (
  id               SERIAL PRIMARY KEY,
  market_hash_name VARCHAR(255) NOT NULL,
  source           VARCHAR(20) NOT NULL,
  price_usd        DECIMAL(10,2),
  recorded_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_purchases (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER REFERENCES users(id) ON DELETE CASCADE,
  asset_id         VARCHAR(20),
  market_hash_name VARCHAR(255),
  buy_price_usd    DECIMAL(10,2),
  buy_source       VARCHAR(20),
  bought_at        TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS price_alerts (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER REFERENCES users(id) ON DELETE CASCADE,
  market_hash_name VARCHAR(255) NOT NULL,
  condition        VARCHAR(10) NOT NULL,
  threshold        DECIMAL(10,2) NOT NULL,
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_history_name_date ON price_history(market_hash_name, recorded_at);
CREATE INDEX IF NOT EXISTS idx_inventory_account ON inventory_items(steam_account_id);
CREATE INDEX IF NOT EXISTS idx_alerts_active ON price_alerts(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_price_history_latest ON price_history(market_hash_name, source, recorded_at DESC);

-- Steam session columns for market selling
ALTER TABLE users ADD COLUMN IF NOT EXISTS steam_session_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS steam_login_secure TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS steam_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_updated_at TIMESTAMPTZ;

-- Transaction history
CREATE TABLE IF NOT EXISTS transactions (
  id               SERIAL PRIMARY KEY,
  user_id          INTEGER REFERENCES users(id) ON DELETE CASCADE,
  tx_id            VARCHAR(100) NOT NULL,
  type             VARCHAR(4) NOT NULL, -- 'buy' or 'sell'
  market_hash_name VARCHAR(255) NOT NULL,
  price_cents      INTEGER NOT NULL,
  tx_date          TIMESTAMPTZ NOT NULL,
  partner_steam_id VARCHAR(17),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tx_id)
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, tx_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_type ON transactions(user_id, type);
CREATE INDEX IF NOT EXISTS idx_transactions_user_item ON transactions(user_id, market_hash_name);

-- Steam session auth method tracking
ALTER TABLE users ADD COLUMN IF NOT EXISTS steam_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_method VARCHAR(20);

-- 003: Sell operations with per-item tracking and daily volume
CREATE TABLE IF NOT EXISTS sell_operations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  total_items  INTEGER NOT NULL,
  succeeded    INTEGER NOT NULL DEFAULT 0,
  failed       INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT chk_sell_op_status CHECK (status IN ('pending','in_progress','completed','cancelled'))
);

CREATE TABLE IF NOT EXISTS sell_operation_items (
  id                    SERIAL PRIMARY KEY,
  operation_id          UUID NOT NULL REFERENCES sell_operations(id) ON DELETE CASCADE,
  asset_id              VARCHAR(20) NOT NULL,
  market_hash_name      VARCHAR(255),
  price_cents           INTEGER NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'queued',
  error_message         TEXT,
  requires_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sell_item_status CHECK (status IN ('queued','listing','listed','failed','cancelled'))
);

CREATE TABLE IF NOT EXISTS sell_volume (
  id      SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day     DATE NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_sell_ops_user ON sell_operations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sell_items_op ON sell_operation_items(operation_id, status);
CREATE INDEX IF NOT EXISTS idx_sell_volume_user_day ON sell_volume(user_id, day);

-- 004: Trade offers
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
  CONSTRAINT chk_trade_status CHECK (status IN ('pending','accepted','declined','expired','cancelled','countered','error'))
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

-- 005: Item details (float, stickers, charms via inspect)
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS inspect_link TEXT;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS paint_seed INTEGER;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS paint_index INTEGER;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS stickers JSONB DEFAULT '[]';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS charms JSONB DEFAULT '[]';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS inspected_at TIMESTAMPTZ;

-- 006: Profit/Loss tracking
CREATE TABLE IF NOT EXISTS daily_pl_snapshots (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  total_invested_cents INTEGER NOT NULL DEFAULT 0,
  total_current_value_cents INTEGER NOT NULL DEFAULT 0,
  realized_profit_cents INTEGER NOT NULL DEFAULT 0,
  unrealized_profit_cents INTEGER NOT NULL DEFAULT 0,
  cumulative_profit_cents INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_pl_user_date ON daily_pl_snapshots(user_id, snapshot_date DESC);

CREATE TABLE IF NOT EXISTS item_cost_basis (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  market_hash_name VARCHAR(255) NOT NULL,
  avg_buy_price_cents INTEGER NOT NULL DEFAULT 0,
  total_quantity_bought INTEGER NOT NULL DEFAULT 0,
  total_spent_cents INTEGER NOT NULL DEFAULT 0,
  total_quantity_sold INTEGER NOT NULL DEFAULT 0,
  total_earned_cents INTEGER NOT NULL DEFAULT 0,
  current_holding INTEGER NOT NULL DEFAULT 0,
  realized_profit_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, market_hash_name)
);

CREATE INDEX IF NOT EXISTS idx_item_cost_basis_user ON item_cost_basis(user_id);

-- 007: Purchase receipts for IAP audit trail
CREATE TABLE IF NOT EXISTS purchase_receipts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store VARCHAR(10) NOT NULL, -- 'apple' or 'google'
  product_id VARCHAR(100) NOT NULL,
  transaction_id VARCHAR(200) UNIQUE NOT NULL,
  original_transaction_id VARCHAR(200),
  purchase_date TIMESTAMPTZ,
  expires_date TIMESTAMPTZ,
  is_trial BOOLEAN DEFAULT FALSE,
  raw_receipt TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_receipts_user ON purchase_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_tx ON purchase_receipts(transaction_id);

-- 008: Push notifications & alerts
ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'any';
ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ;
ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS cooldown_minutes INTEGER DEFAULT 60;

CREATE TABLE IF NOT EXISTS user_devices (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fcm_token  TEXT NOT NULL,
  platform   VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, fcm_token)
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id);

CREATE TABLE IF NOT EXISTS alert_history (
  id         SERIAL PRIMARY KEY,
  alert_id   INTEGER NOT NULL REFERENCES price_alerts(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source     VARCHAR(20) NOT NULL,
  price_usd  DECIMAL(10,2) NOT NULL,
  message    TEXT NOT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_history_user ON alert_history(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_alert ON alert_history(alert_id, sent_at DESC);

-- 009: Wallet currency for correct sell pricing
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_currency INTEGER;

-- 010: Multi-account sessions — move session columns to steam_accounts
ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS steam_session_id TEXT;
ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS steam_login_secure TEXT;
ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS steam_access_token TEXT;
ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS steam_refresh_token TEXT;
ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS session_method VARCHAR(20);
ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS session_updated_at TIMESTAMPTZ;
ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS wallet_currency INTEGER;

ALTER TABLE users ADD COLUMN IF NOT EXISTS active_account_id INTEGER REFERENCES steam_accounts(id);

ALTER TABLE sell_operations ADD COLUMN IF NOT EXISTS steam_account_id INTEGER REFERENCES steam_accounts(id);
`;

export async function migrate() {
  console.log("Running migrations...");
  await pool.query(schema);

  // Data migration: copy session data from users → steam_accounts (one-time)
  await pool.query(`
    UPDATE steam_accounts sa
    SET steam_session_id = u.steam_session_id,
        steam_login_secure = u.steam_login_secure,
        steam_access_token = u.steam_access_token,
        steam_refresh_token = u.steam_refresh_token,
        session_method = u.session_method,
        session_updated_at = u.session_updated_at,
        wallet_currency = u.wallet_currency
    FROM users u
    WHERE sa.user_id = u.id AND sa.steam_id = u.steam_id
      AND sa.steam_login_secure IS NULL
      AND u.steam_login_secure IS NOT NULL
  `);

  // Set active_account_id to primary account where not yet set
  await pool.query(`
    UPDATE users u
    SET active_account_id = sa.id
    FROM steam_accounts sa
    WHERE sa.user_id = u.id AND sa.steam_id = u.steam_id
      AND u.active_account_id IS NULL
  `);

  // Backfill sell_operations.steam_account_id from primary account
  await pool.query(`
    UPDATE sell_operations so
    SET steam_account_id = sa.id
    FROM users u
    JOIN steam_accounts sa ON sa.user_id = u.id AND sa.steam_id = u.steam_id
    WHERE so.user_id = u.id AND so.steam_account_id IS NULL
  `);

  console.log("Migrations complete.");
}

// Run standalone
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().then(() => pool.end());
}
