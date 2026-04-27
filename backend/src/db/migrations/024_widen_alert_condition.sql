-- 024_widen_alert_condition.sql
-- Widen condition column for smart alert types: bargain, sellNow, arbitrage.

ALTER TABLE price_alerts ALTER COLUMN condition TYPE VARCHAR(20);
