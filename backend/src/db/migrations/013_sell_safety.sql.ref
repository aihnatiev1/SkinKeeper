-- 013_sell_safety.sql
-- Critical sell-flow safety: prevent double-sell, handle phantom listings.

-- Issue 1: Partial unique index prevents same asset in multiple active operations.
-- An asset can only exist in ONE non-failed/non-cancelled sell operation at a time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_sell_items_active_asset
  ON sell_operation_items (asset_id)
  WHERE status NOT IN ('failed', 'cancelled');

-- Issue 2: Add "uncertain" status for network-dropout scenarios.
-- When Steam accepted the listing but response didn't reach us.
ALTER TABLE sell_operation_items
  DROP CONSTRAINT IF EXISTS chk_sell_item_status;
ALTER TABLE sell_operation_items
  ADD CONSTRAINT chk_sell_item_status
  CHECK (status IN ('queued','listing','listed','failed','cancelled','uncertain'));
