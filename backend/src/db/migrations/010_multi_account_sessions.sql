-- 010_multi_account_sessions.sql
-- Multi-account architecture: move session columns to steam_accounts,
-- add active_account_id on users, link sell_operations to account.

ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS steam_session_id TEXT;
ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS steam_login_secure TEXT;
ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS steam_access_token TEXT;
ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS steam_refresh_token TEXT;
ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS session_method VARCHAR(20);
ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS session_updated_at TIMESTAMPTZ;
ALTER TABLE steam_accounts ADD COLUMN IF NOT EXISTS wallet_currency INTEGER;

ALTER TABLE users ADD COLUMN IF NOT EXISTS active_account_id INTEGER REFERENCES steam_accounts(id);

ALTER TABLE sell_operations ADD COLUMN IF NOT EXISTS steam_account_id INTEGER REFERENCES steam_accounts(id);
