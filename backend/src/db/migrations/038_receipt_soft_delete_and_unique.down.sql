-- 038_receipt_soft_delete_and_unique.down.sql
-- Rollback for 038_receipt_soft_delete_and_unique.sql.

DROP INDEX IF EXISTS uniq_purchase_receipts_orig_tx;

DROP INDEX IF EXISTS idx_purchase_receipts_deleted_user;

ALTER TABLE purchase_receipts
  DROP CONSTRAINT IF EXISTS purchase_receipts_user_id_fkey;

ALTER TABLE purchase_receipts
  ADD CONSTRAINT purchase_receipts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE purchase_receipts DROP COLUMN IF EXISTS deleted_user_id;
