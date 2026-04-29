-- 039_soft_delete_accounts_and_refunds.sql
--
-- Two related domain fixes:
--
--   (1) Soft-delete Steam accounts. The previous flow
--       (auth.ts: DELETE FROM steam_accounts ... WHERE id = $1) hard-deleted
--       the row. The FK transactions.steam_account_id ... ON DELETE SET NULL
--       then orphaned every transaction the user had on that account, leaving
--       them with steam_account_id = NULL — undistinguishable from manual
--       (no-Steam-account) transactions. Aggregation in recalculateCostBasis
--       collapsed them and ran into the (now-fixed) NULL=NULL JOIN bug, plus
--       per-account P/L was lost forever the moment a user clicked "Unlink".
--
--       Soft-delete preserves the row, FK references stay intact, the user can
--       see their archived account's history, and a re-link/auto-undelete on
--       the same Steam ID is trivially expressible. The active_steam_accounts
--       view — already used in 15+ call sites — becomes the single point of
--       filtering for "live" accounts.
--
--   (2) Backfill the existing orphans. We can't recover which historical
--       account they came from (the rows were physically deleted), but we
--       can give them a stable home: a per-user synthetic "Archived account"
--       row, soft-deleted at creation, that owns all the orphaned NULLs.
--       After this migration, transactions.steam_account_id IS NULL means
--       "manual / no-Steam-context" only — never "the account row vanished".
--
--   (3) Refund tracking on transactions. CS2 Steam refunds reverse the buy
--       order entirely; we model that as an idempotent timestamp column
--       (refunded_at) on the original buy row rather than a new
--       type='refund' row. Cost-basis aggregation will filter out refunded
--       buys so the user's cost basis matches what Steam actually charged
--       them, not the original (refunded) order amount.
--
-- Rollback note: a .down.sql is intentionally not provided. Soft-delete is
-- additive (new column + new view def), and the orphan backfill is
-- irreversible at the data level — once we've reattributed transactions to
-- an Archived bucket, we no longer know which were genuinely manual vs
-- post-hard-delete. Rolling forward is always preferable here.

-- ─── Part 1: soft-delete on steam_accounts ──────────────────────────────

ALTER TABLE steam_accounts
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ NULL;

-- Partial index — every active-account lookup filters deleted_at IS NULL,
-- so a partial index keeps it small and avoids touching archived rows.
CREATE INDEX IF NOT EXISTS idx_steam_accounts_active_user
  ON steam_accounts(user_id)
  WHERE deleted_at IS NULL;

-- Replace the existing view (which was an unfiltered SELECT *) with one
-- that hides soft-deleted rows. Every consumer of active_steam_accounts
-- becomes deleted-aware automatically — no per-call-site changes needed.
CREATE OR REPLACE VIEW active_steam_accounts AS
  SELECT * FROM steam_accounts WHERE deleted_at IS NULL;

-- ─── Part 2: refunded_at on transactions ────────────────────────────────

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ NULL;

-- Hot-path partial index: recalculateCostBasis aggregates over
-- (user_id, market_hash_name) WHERE refunded_at IS NULL on every call.
CREATE INDEX IF NOT EXISTS idx_transactions_active
  ON transactions(user_id, market_hash_name)
  WHERE refunded_at IS NULL;

-- ─── Part 3: backfill orphaned NULL-account transactions ────────────────
--
-- For every user that has NULL-account transactions today (i.e. legacy
-- post-hard-delete orphans, *plus* manual transactions that legitimately
-- have no Steam context), we have to discriminate between the two. We
-- can't, so we err on the side of preserving history: every existing
-- NULL transaction becomes part of the user's "Archived account"
-- bucket. Manual transactions added after this migration will continue
-- to have steam_account_id = NULL, distinguishing them from the
-- legacy archived rows.
--
-- The bucket row is created with deleted_at = NOW() so it's invisible to
-- active_steam_accounts. status='active' (no CHECK constraint, but the
-- column-default convention) — soft-delete is communicated via deleted_at,
-- not status.

DO $migration$
DECLARE
  u RECORD;
  archived_id INTEGER;
BEGIN
  FOR u IN
    SELECT DISTINCT user_id
      FROM transactions
     WHERE steam_account_id IS NULL
       AND user_id IS NOT NULL
  LOOP
    -- 'archived-<user_id>' fits VARCHAR(17) for user_id up to 99,999,999.
    INSERT INTO steam_accounts (user_id, steam_id, display_name, added_at, deleted_at, status)
    VALUES (u.user_id, 'archived-' || u.user_id, 'Archived account', NOW(), NOW(), 'active')
    ON CONFLICT (user_id, steam_id) DO UPDATE
      SET deleted_at = COALESCE(steam_accounts.deleted_at, NOW())
    RETURNING id INTO archived_id;

    UPDATE transactions
       SET steam_account_id = archived_id
     WHERE user_id = u.user_id
       AND steam_account_id IS NULL;

    -- Drop stale NULL-account cost-basis cache rows so the next
    -- recalculateCostBasis call (triggered by any user action) rebuilds
    -- them attached to the archived bucket. Otherwise the unique key
    -- (user_id, COALESCE(account, 0), name) leaves the old NULL rows
    -- untouched while new rows insert with the real archived id.
    DELETE FROM item_cost_basis
     WHERE user_id = u.user_id
       AND steam_account_id IS NULL;
  END LOOP;
END
$migration$;
