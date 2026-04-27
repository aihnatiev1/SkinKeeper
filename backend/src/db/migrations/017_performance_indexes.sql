-- 017_performance_indexes.sql
-- Performance indexes for the refactoring phase.

CREATE INDEX IF NOT EXISTS idx_inventory_items_name ON inventory_items(market_hash_name);
CREATE INDEX IF NOT EXISTS idx_transactions_account_date ON transactions(steam_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_history_name ON price_history(market_hash_name);
