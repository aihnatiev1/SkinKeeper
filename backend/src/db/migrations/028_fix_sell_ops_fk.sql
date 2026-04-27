-- 028_fix_sell_ops_fk.sql
-- Fix sell_operations FK again — allow account deletion gracefully.
-- (First fix was 018; this pass catches a re-emerged constraint after schema reload.)

ALTER TABLE sell_operations DROP CONSTRAINT IF EXISTS sell_operations_steam_account_id_fkey;
ALTER TABLE sell_operations ADD CONSTRAINT sell_operations_steam_account_id_fkey
  FOREIGN KEY (steam_account_id) REFERENCES steam_accounts(id) ON DELETE SET NULL;
