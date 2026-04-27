-- 022_currency_source.sql
-- Track wallet currency source: auto-detected vs manually set by user.

ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS currency_source VARCHAR(10) DEFAULT 'auto';
