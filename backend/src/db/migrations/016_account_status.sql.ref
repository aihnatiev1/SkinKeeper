-- Add status column to steam_accounts (existing accounts stay active)
ALTER TABLE steam_accounts
  ADD COLUMN IF NOT EXISTS status VARCHAR(10) DEFAULT 'active' NOT NULL;

-- View for all user-facing queries — only shows active accounts
CREATE OR REPLACE VIEW active_steam_accounts AS
  SELECT * FROM steam_accounts WHERE status = 'active';
