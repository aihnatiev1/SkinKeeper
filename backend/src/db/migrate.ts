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
`;

export async function migrate() {
  console.log("Running migrations...");
  await pool.query(schema);
  console.log("Migrations complete.");
}

// Run standalone
if (import.meta.url === `file://${process.argv[1]}`) {
  migrate().then(() => pool.end());
}
