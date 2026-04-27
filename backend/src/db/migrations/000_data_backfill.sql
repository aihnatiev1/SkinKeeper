-- 000_data_backfill.sql
-- HISTORY REFERENCE — this file is never executed by the migration runner.
-- It is marked as applied by the backfill script (scripts/backfill-migrations.ts)
-- to record the data migrations that were run once on prod as part of
-- the original migrate() function in migrate.ts.
--
-- These UPDATE statements are idempotent (all have WHERE guards) but are NOT
-- re-run because:
--   1. They backfill columns that may not exist on a fresh DB until 001–036 run.
--   2. They reference the old users.steam_session_* columns that were only
--      present in older schema versions.
--
-- For reference only:

-- Copy session data from users → steam_accounts (one-time)
-- UPDATE steam_accounts sa
-- SET steam_session_id = u.steam_session_id, ...
-- FROM users u WHERE ... AND sa.steam_login_secure IS NULL ...

-- Set active_account_id to primary account where not yet set
-- UPDATE users u SET active_account_id = sa.id FROM steam_accounts sa ...

-- Backfill sell_operations.steam_account_id from primary account
-- Backfill transactions.steam_account_id from primary account
-- Mark existing trade offers as internal
-- Backfill trade_offer_items.icon_url
-- Backfill trade_offers.account_id_from
-- Update chk_trade_status constraint (duplicate of 016_trade_status_constraint.sql)

SELECT 1; -- no-op placeholder so this file parses as valid SQL
