-- 038_receipt_soft_delete_and_unique.sql
--
-- Combined hardening for purchase_receipts:
--
--   (HIGH-6) Soft-delete: preserve receipt rows when the owning user is
--   deleted, so refund webhooks (Apple ASSN, Google RTDN) that arrive after
--   account deletion can still attribute the refund to the correct (deleted)
--   user. GDPR Art. 17(3)(e) explicitly carves out retention for legal
--   claims — refund traceability + chargeback dispute support qualifies.
--
--   We DO NOT keep PII on the row (no email, name, etc. — purchase_receipts
--   never had any). Only the foreign-key linkage is preserved via the new
--   `deleted_user_id` column. The `user_id` FK flips to ON DELETE SET NULL
--   so the cascade cleanly nulls the live link, and the
--   delete-account flow stamps `deleted_user_id` BEFORE running the user
--   delete so the historical attribution survives.
--
--   (CRIT-1/2 hardening) Database-level UNIQUE on `original_transaction_id`
--   is defense-in-depth for the receipt-replay protection that already lives
--   inside `activatePremium` (SELECT ... FOR UPDATE). Catches any future
--   code path (admin tools, manual SQL, race that beats the FOR UPDATE)
--   that would otherwise silently create cross-user duplicates.
--
--   Partial UNIQUE INDEX (not ALTER TABLE … ADD UNIQUE) so legacy rows
--   with NULL original_transaction_id stay valid — early Apple/Google
--   receipts before we started recording the original tx didn't have it.
--
-- Pre-deploy check — run manually in psql before applying in prod:
--
--   SELECT original_transaction_id, COUNT(*)
--     FROM purchase_receipts
--    WHERE original_transaction_id IS NOT NULL
--    GROUP BY 1 HAVING COUNT(*) > 1;
--
-- If any rows are returned, decide which to keep (probably the oldest
-- non-revoked one) before applying — otherwise the index creation fails
-- and the migration aborts cleanly (which is the right behaviour: a duplicate
-- means we already have a CRIT-1/2 incident in the wild that needs human
-- review).

-- ─── Part 1: HIGH-6 soft-delete ──────────────────────────────────────────

ALTER TABLE purchase_receipts
  ADD COLUMN IF NOT EXISTS deleted_user_id INTEGER NULL;

-- Drop the existing CASCADE FK (created in legacy schema) and replace with
-- SET NULL. The constraint name on legacy boots is the default
-- `purchase_receipts_user_id_fkey` — explicit DROP IF EXISTS so this is
-- idempotent across re-runs and across both legacy schema and freshly
-- migrated databases.
ALTER TABLE purchase_receipts
  DROP CONSTRAINT IF EXISTS purchase_receipts_user_id_fkey;

ALTER TABLE purchase_receipts
  ADD CONSTRAINT purchase_receipts_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;

-- Forensic lookup index — when the ASSN/RTDN handler can't find a live
-- user_id for a refund, it falls back to deleted_user_id so we can log
-- "[ASSN] refund for deleted user X" instead of a useless "user=unknown".
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_deleted_user
  ON purchase_receipts(deleted_user_id)
  WHERE deleted_user_id IS NOT NULL;

-- ─── Part 2: UNIQUE on original_transaction_id (CRIT-1/2 DB hardening) ───
--
-- Partial unique: skips rows where original_transaction_id is NULL, since
-- those represent legacy data from before the column was always populated.
-- Modern Apple/Google/Stripe paths always set original_transaction_id, so
-- new dupes will be caught.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_purchase_receipts_orig_tx
  ON purchase_receipts(original_transaction_id)
  WHERE original_transaction_id IS NOT NULL;
