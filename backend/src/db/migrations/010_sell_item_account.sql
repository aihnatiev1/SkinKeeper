-- 010_sell_item_account.sql
-- Per-item account routing for sell operations.
-- Allows a single sell operation to span items from multiple Steam accounts.

ALTER TABLE sell_operation_items
  ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES steam_accounts(id);
