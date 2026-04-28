-- 037_purchase_receipt_lifecycle.down.sql
-- Rollback for 037_purchase_receipt_lifecycle.sql.

DROP INDEX IF EXISTS idx_purchase_receipts_orig_tx;

ALTER TABLE purchase_receipts DROP COLUMN IF EXISTS revoked_at;
ALTER TABLE purchase_receipts DROP COLUMN IF EXISTS auto_renew;
