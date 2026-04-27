-- 011_manual_transactions.sql
-- Manual transactions: source tracking, icon_url, note on transactions.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'steam';
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS icon_url TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS note TEXT;
