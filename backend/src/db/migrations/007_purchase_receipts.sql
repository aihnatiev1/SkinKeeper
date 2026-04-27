-- 007_purchase_receipts.sql
-- Purchase receipts for IAP audit trail.

CREATE TABLE IF NOT EXISTS purchase_receipts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  store VARCHAR(10) NOT NULL, -- 'apple' or 'google'
  product_id VARCHAR(100) NOT NULL,
  transaction_id VARCHAR(200) UNIQUE NOT NULL,
  original_transaction_id VARCHAR(200),
  purchase_date TIMESTAMPTZ,
  expires_date TIMESTAMPTZ,
  is_trial BOOLEAN DEFAULT FALSE,
  raw_receipt TEXT,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_purchase_receipts_user ON purchase_receipts(user_id);
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_tx ON purchase_receipts(transaction_id);
