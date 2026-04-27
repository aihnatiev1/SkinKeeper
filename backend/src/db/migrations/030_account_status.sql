-- 030_account_status.sql
-- Account status column: controls visibility of linked accounts.
-- View for all user-facing queries — all linked accounts are always visible.

ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS status VARCHAR(10) DEFAULT 'active' NOT NULL;

CREATE OR REPLACE VIEW active_steam_accounts AS
  SELECT * FROM steam_accounts;
