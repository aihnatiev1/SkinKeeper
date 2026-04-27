-- 013_per_account_pl.sql
-- Per-account P/L: link transactions, cost basis and snapshots to steam_account.
-- Internal transfer detection columns on trade_offers.

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

-- Note: old (user_id, market_hash_name) unique on item_cost_basis retained for global rollup rows.
-- Per-account rows have steam_account_id set (allowed by the non-unique nature of the new column).
