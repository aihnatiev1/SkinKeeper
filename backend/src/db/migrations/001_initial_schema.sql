-- 001_initial_schema.sql
-- Initial tables: users, steam_accounts, inventory_items, price_history,
-- user_purchases, price_alerts, and base indexes.

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
