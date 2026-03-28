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

-- 011: Manual transactions — source tracking + icon_url
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'steam';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS icon_url TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS note TEXT;

-- 012: Steam Web API key for trade offer sync
ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS web_api_key TEXT;

-- Unique index on steam_offer_id to enable upsert during sync
CREATE UNIQUE INDEX IF NOT EXISTS idx_trade_offers_steam_id
  ON trade_offers(user_id, steam_offer_id) WHERE steam_offer_id IS NOT NULL;

-- 013: Per-account P/L — link transactions, cost basis and snapshots to steam_account
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS steam_account_id INTEGER REFERENCES steam_accounts(id) ON DELETE SET NULL;
ALTER TABLE item_cost_basis ADD COLUMN IF NOT EXISTS steam_account_id INTEGER REFERENCES steam_accounts(id) ON DELETE SET NULL;
ALTER TABLE daily_pl_snapshots ADD COLUMN IF NOT EXISTS steam_account_id INTEGER REFERENCES steam_accounts(id) ON DELETE SET NULL;

-- Internal transfer detection on trade offers
ALTER TABLE trade_offers ADD COLUMN IF NOT EXISTS account_id_from INTEGER REFERENCES steam_accounts(id) ON DELETE SET NULL;
ALTER TABLE trade_offers ADD COLUMN IF NOT EXISTS account_id_to INTEGER REFERENCES steam_accounts(id) ON DELETE SET NULL;
ALTER TABLE trade_offers ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT FALSE;

-- Indexes for per-account queries
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(steam_account_id);
CREATE INDEX IF NOT EXISTS idx_item_cost_basis_account ON item_cost_basis(steam_account_id);
CREATE INDEX IF NOT EXISTS idx_daily_pl_account ON daily_pl_snapshots(steam_account_id);

-- Update unique constraint on item_cost_basis to support per-account
-- We keep the old (user_id, market_hash_name) unique for global rollup
-- and allow per-account rows with steam_account_id set

-- 014: Widen steam_offer_id for trade history synthetic IDs (hist_XXXXX)
ALTER TABLE trade_offers ALTER COLUMN steam_offer_id TYPE VARCHAR(40);

-- 015: Widen status column for awaiting_confirmation (23 chars > 20)
ALTER TABLE trade_offers ALTER COLUMN status TYPE VARCHAR(30);

-- 016: Allow new trade statuses (awaiting_confirmation, on_hold, invalid)
ALTER TABLE trade_offers DROP CONSTRAINT IF EXISTS chk_trade_status;
ALTER TABLE trade_offers ADD CONSTRAINT chk_trade_status
  CHECK (status IN ('pending','accepted','declined','expired','cancelled','countered','error','awaiting_confirmation','on_hold','invalid'));

-- 017: Performance indexes for refactoring phase
CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON inventory_items(market_hash_name);
CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(steam_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_name ON price_history(market_hash_name);

-- 018: Fix FK constraints on steam_accounts to allow account deletion
ALTER TABLE sell_operations
  DROP CONSTRAINT IF EXISTS sell_operations_steam_account_id_fkey;
ALTER TABLE sell_operations
  ADD CONSTRAINT sell_operations_steam_account_id_fkey
  FOREIGN KEY (steam_account_id) REFERENCES steam_accounts(id) ON DELETE SET NULL;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_active_account_id_fkey;
ALTER TABLE users
  ADD CONSTRAINT users_active_account_id_fkey
  FOREIGN KEY (active_account_id) REFERENCES steam_accounts(id) ON DELETE SET NULL;

-- 019: Named portfolios
CREATE TABLE IF NOT EXISTS portfolios (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       VARCHAR(100) NOT NULL,
  color      VARCHAR(20) NOT NULL DEFAULT '#6366F1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_portfolios_user_id ON portfolios(user_id);

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS portfolio_id INTEGER REFERENCES portfolios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_portfolio_id ON transactions(portfolio_id);

-- 020: Per-item account routing for sell operations
-- Allows a single sell operation to span items from multiple Steam accounts.
ALTER TABLE sell_operation_items
  ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES steam_accounts(id) ON DELETE SET NULL;

-- 021: marker — backfill trade_offers account_id_from (done in data migration below)

-- 022: Track wallet currency source (auto-detected vs manual)
ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS currency_source VARCHAR(10) DEFAULT 'auto';

-- 024: Widen condition column for smart alert types (bargain, sellNow, arbitrage)
ALTER TABLE price_alerts ALTER COLUMN condition TYPE VARCHAR(20);

-- 023: Widen varchar columns that can overflow
-- asset_id: Steam 64-bit IDs can be 19-20 digits
ALTER TABLE inventory_items ALTER COLUMN asset_id TYPE VARCHAR(30);
ALTER TABLE sell_operation_items ALTER COLUMN asset_id TYPE VARCHAR(30);
ALTER TABLE trade_offer_items ALTER COLUMN asset_id TYPE VARCHAR(30);
-- trade_token: Steam trade tokens can be 30+ chars
ALTER TABLE steam_accounts ALTER COLUMN trade_token TYPE VARCHAR(50);
-- session_method: "clienttoken_exchanged" = 22 chars
ALTER TABLE steam_accounts ALTER COLUMN session_method TYPE VARCHAR(30);

-- 025: Watchlist — track items you don't own
ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS is_watchlist BOOLEAN DEFAULT FALSE;
ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS icon_url TEXT;

-- 028: Fix sell_operations FK — allow account deletion
ALTER TABLE sell_operations DROP CONSTRAINT IF EXISTS sell_operations_steam_account_id_fkey;
ALTER TABLE sell_operations ADD CONSTRAINT sell_operations_steam_account_id_fkey
  FOREIGN KEY (steam_account_id) REFERENCES steam_accounts(id) ON DELETE SET NULL;

-- 026: Shared current_prices table — one row per item per source, UPSERT on refresh
CREATE TABLE IF NOT EXISTS current_prices (
  market_hash_name VARCHAR(255) NOT NULL,
  source           VARCHAR(20)  NOT NULL,
  price_usd        DECIMAL(10,2) NOT NULL,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (market_hash_name, source)
);
CREATE INDEX IF NOT EXISTS idx_current_prices_name ON current_prices(market_hash_name);

-- 027: Covering partial index for price_history — speeds up all "latest price" lookups
CREATE INDEX IF NOT EXISTS idx_price_history_steam_latest
  ON price_history(market_hash_name, recorded_at DESC)
  WHERE source = 'steam' AND price_usd > 0;
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

  // Backfill transactions.steam_account_id from primary account
  await pool.query(`
    UPDATE transactions t
    SET steam_account_id = sa.id
    FROM users u
    JOIN steam_accounts sa ON sa.user_id = u.id AND sa.steam_id = u.steam_id
    WHERE t.user_id = u.id AND t.steam_account_id IS NULL
  `);

  // Mark existing trade offers as internal where partner_steam_id is one of user's accounts
  await pool.query(`
    UPDATE trade_offers to1
    SET is_internal = TRUE,
        account_id_to = partner_acc.id
    FROM steam_accounts partner_acc
    WHERE partner_acc.user_id = to1.user_id
      AND partner_acc.steam_id = to1.partner_steam_id
      AND to1.is_internal = FALSE
  `);

  // Backfill trade_offer_items.icon_url from inventory_items where missing
  await pool.query(`
    UPDATE trade_offer_items toi
    SET icon_url = ii.icon_url
    FROM (
      SELECT DISTINCT ON (market_hash_name) market_hash_name, icon_url
      FROM inventory_items
      WHERE icon_url IS NOT NULL
      ORDER BY market_hash_name, updated_at DESC
    ) ii
    WHERE toi.market_hash_name = ii.market_hash_name
      AND toi.icon_url IS NULL
  `);

  // Backfill remaining from transactions (covers items no longer in inventory)
  await pool.query(`
    UPDATE trade_offer_items toi
    SET icon_url = t.icon_url
    FROM (
      SELECT DISTINCT ON (market_hash_name) market_hash_name, icon_url
      FROM transactions
      WHERE icon_url IS NOT NULL
      ORDER BY market_hash_name
    ) t
    WHERE toi.market_hash_name = t.market_hash_name
      AND toi.icon_url IS NULL
  `);

  // 021: Backfill trade_offers.account_id_from for historical rows.
  // Step 1: Undo incorrect backfill — reset account_id_from for received trades
  // (received trades have account_id_to set; account_id_from=external partner, should stay NULL).
  // We detect incorrectly backfilled rows: account_id_from = primary account AND account_id_to IS NOT NULL.
  await pool.query(`
    UPDATE trade_offers t
    SET account_id_from = NULL
    WHERE t.account_id_to IS NOT NULL
      AND t.is_internal = FALSE
      AND t.account_id_from = (
        SELECT sa.id FROM steam_accounts sa
        WHERE sa.user_id = t.user_id
        ORDER BY sa.id ASC LIMIT 1
      )
  `);

  // Step 2: Backfill only truly unattributed trades (BOTH from and to are NULL).
  // These are historical sent trades; attribute to primary account.
  await pool.query(`
    UPDATE trade_offers t
    SET account_id_from = (
      SELECT sa.id FROM steam_accounts sa
      WHERE sa.user_id = t.user_id
      ORDER BY sa.id ASC LIMIT 1
    )
    WHERE t.account_id_from IS NULL
      AND t.account_id_to IS NULL
      AND t.is_internal = FALSE
  `);

  // 027: Add 'invalid' to trade status constraint (Steam states 1 & 8)
  await pool.query(`
    ALTER TABLE trade_offers DROP CONSTRAINT IF EXISTS chk_trade_status;
    ALTER TABLE trade_offers ADD CONSTRAINT chk_trade_status
      CHECK (status IN ('pending','accepted','declined','expired','cancelled','countered','error','awaiting_confirmation','on_hold','invalid'));
  `);

  console.log("Migrations complete.");
}

// Run standalone
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().then(() => pool.end());
}
