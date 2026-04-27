-- 023_widen_varchar_columns.sql
-- Widen varchar columns that can overflow in practice.
-- asset_id: Steam 64-bit IDs can be 19-20 digits.
-- trade_token: Steam trade tokens can be 30+ chars.
-- session_method: "clienttoken_exchanged" = 22 chars.

ALTER TABLE inventory_items ALTER COLUMN asset_id TYPE VARCHAR(30);
ALTER TABLE sell_operation_items ALTER COLUMN asset_id TYPE VARCHAR(30);
ALTER TABLE trade_offer_items ALTER COLUMN asset_id TYPE VARCHAR(30);

-- Drop view that depends on steam_accounts columns before altering types.
DROP VIEW IF EXISTS active_steam_accounts;

ALTER TABLE steam_accounts ALTER COLUMN trade_token TYPE VARCHAR(50);
ALTER TABLE steam_accounts ALTER COLUMN session_method TYPE VARCHAR(30);
