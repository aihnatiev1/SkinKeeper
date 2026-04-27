-- 014_cost_basis_per_account.sql
-- Fix P&L accuracy: cost basis must be per-account, not just per-user.
-- Without this, buying AK on Account A and selling AK on Account B
-- produces incorrect realized profit.

-- Drop the old unique constraint and create new one including steam_account_id
DROP INDEX IF EXISTS item_cost_basis_user_id_market_hash_name_key;
ALTER TABLE item_cost_basis
  DROP CONSTRAINT IF EXISTS item_cost_basis_user_id_market_hash_name_key;

-- Clear stale data — will be recalculated
TRUNCATE item_cost_basis;

-- New unique constraint: per-user, per-account, per-item
CREATE UNIQUE INDEX IF NOT EXISTS idx_cost_basis_user_account_item
  ON item_cost_basis (user_id, COALESCE(steam_account_id, 0), market_hash_name);
