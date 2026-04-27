-- 032_stripe_integration.sql
-- Stripe integration for desktop subscriptions.
-- Widen purchase_receipts.store for future store types.

ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;

ALTER TABLE purchase_receipts ALTER COLUMN store TYPE VARCHAR(20);
