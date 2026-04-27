-- 009_wallet_currency.sql
-- Wallet currency column on users for correct sell pricing.

ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_currency INTEGER;
