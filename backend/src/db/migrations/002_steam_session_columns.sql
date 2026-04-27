-- 002_steam_session_columns.sql
-- Steam session columns on users for market selling.
-- Also adds Steam refresh token + session method tracking.
-- Also adds transaction history table.

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
