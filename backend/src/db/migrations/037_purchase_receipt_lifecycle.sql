-- 037_purchase_receipt_lifecycle.sql
-- Adds lifecycle columns to purchase_receipts for Google Play Real-Time
-- Developer Notifications (RTDN) and Apple App Store Server Notifications.
--
-- auto_renew  : Tracks the user's renewal intent. Flipped to FALSE when
--               Google Play sends SUBSCRIPTION_CANCELED (type 3) or Apple
--               sends DID_CHANGE_RENEWAL_STATUS (subtype AUTO_RENEW_DISABLED).
--               The user keeps Premium until expiry — this column is purely
--               informational so the client can show "ends on <date>" instead
--               of "renews on <date>".
--
-- revoked_at  : Set when the subscription is force-revoked (RTDN type 12
--               REVOKED, ASSN REFUND/REVOKE). Distinct from natural expiry
--               (premium_until in users) — `revoked_at IS NOT NULL` means
--               a refund/chargeback occurred and we should NOT re-grant
--               premium even if the same receipt is replayed.
--
-- Both nullable / default-true to keep existing rows valid without a
-- backfill step.

ALTER TABLE purchase_receipts
  ADD COLUMN IF NOT EXISTS auto_renew BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE purchase_receipts
  ADD COLUMN IF NOT EXISTS revoked_at TIMESTAMPTZ NULL;

-- Lookups by purchase token are the hot path in the RTDN handler — every
-- inbound notification probes this column. The existing
-- idx_purchase_receipts_tx covers transaction_id (UNIQUE), but
-- original_transaction_id is unindexed and the RTDN lookup ORs on both.
CREATE INDEX IF NOT EXISTS idx_purchase_receipts_orig_tx
  ON purchase_receipts(original_transaction_id)
  WHERE original_transaction_id IS NOT NULL;
