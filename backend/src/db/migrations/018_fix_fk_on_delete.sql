-- 018_fix_fk_on_delete.sql
-- Fix FK constraints on steam_accounts to allow account deletion without
-- cascading deletes on sell_operations and users.active_account_id.

ALTER TABLE sell_operations
  DROP CONSTRAINT IF EXISTS sell_operations_steam_account_id_fkey;
ALTER TABLE sell_operations
  ADD CONSTRAINT sell_operations_steam_account_id_fkey
  FOREIGN KEY (steam_account_id) REFERENCES steam_accounts(id) ON DELETE SET NULL;

ALTER TABLE users
  DROP CONSTRAINT IF EXISTS users_active_account_id_fkey;
ALTER TABLE users
  ADD CONSTRAINT users_active_account_id_fkey
  FOREIGN KEY (active_account_id) REFERENCES steam_accounts(id) ON DELETE SET NULL;
