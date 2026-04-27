-- 015_widen_trade_status.sql
-- Widen status column on trade_offers for awaiting_confirmation (23 chars > 20).

ALTER TABLE trade_offers ALTER COLUMN status TYPE VARCHAR(30);
