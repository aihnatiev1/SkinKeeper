-- 031_steam_accounts_unique.sql
-- One steam_id can only belong to one user — prevents ghost user creation
-- when the same Steam account is registered under multiple users.

CREATE UNIQUE INDEX IF NOT EXISTS idx_steam_accounts_steam_id_unique ON steam_accounts(steam_id);
