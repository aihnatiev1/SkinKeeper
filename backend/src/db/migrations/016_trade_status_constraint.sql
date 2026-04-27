-- 016_trade_status_constraint.sql
-- Allow new trade statuses: awaiting_confirmation, on_hold, invalid.
-- Drop old constraint and recreate with full set.

ALTER TABLE trade_offers DROP CONSTRAINT IF EXISTS chk_trade_status;
ALTER TABLE trade_offers ADD CONSTRAINT chk_trade_status
  CHECK (status IN ('pending','accepted','declined','expired','cancelled','countered','error','awaiting_confirmation','on_hold','invalid'));
