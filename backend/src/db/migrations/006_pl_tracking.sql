-- 006_pl_tracking.sql
-- Profit/Loss tracking: daily P/L snapshots and item cost basis.

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
