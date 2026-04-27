-- 014_widen_steam_offer_id.sql
-- Widen steam_offer_id for trade history synthetic IDs (hist_XXXXX).
-- Old VARCHAR(20) was too narrow for the histhtml_ prefix format.

ALTER TABLE trade_offers ALTER COLUMN steam_offer_id TYPE VARCHAR(40);
