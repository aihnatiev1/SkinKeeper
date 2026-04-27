-- 034_auto_sell_tables.sql — HISTORY REFERENCE ONLY.
--
-- The schema below has been merged into backend/src/db/migrate.ts as the
-- "-- 034: Auto-sell rules & executions" block. This file is kept for
-- migration-history readability only; the running schema is whatever
-- migrate.ts applies on boot (see DevOps-1 backlog for proper migration
-- runner).
--
-- Renamed from 018_auto_sell_tables.sql to 034 to match the actual ordinal
-- (current last migration in migrate.ts is 033). NOT executed standalone.
--
-- Purpose: Auto-sell engine (P3 premium feature).
-- User creates rules like "if AK Redline > $15, list for min($15, market_max)".
-- A cron job (*/15 * * * *) evaluates rules vs current prices and either
-- (notify_only) sends a push, or (auto_list) schedules a listing after a
-- 60-second user cancel window.
--
-- Defense-in-depth against juicy pricing bugs:
--   - MAX_PRICE_MULTIPLIER guard already exists in sellOperations.ts (5x cap)
--   - MIN_PRICE_MULTIPLIER to be added symmetrically (0.5x floor)
--   - notify_only is the DEFAULT mode; auto_list must be opted-in
--   - 60-second cancel window on first real fire of every rule
--
-- Open questions (flagged for architect / domain-expert):
--   - Should `sell_price_usd` be per-currency (cents + currency_id) like
--     sell_operation_items? Current sell loop normalizes via getWalletCurrency.
--     For MVP: store USD cents + convert at fire-time using existing helpers.
--   - Cost basis interaction: auto-listed items go through sellOperations
--     which already calls recalculateCostBasis — nothing extra needed here.
--   - Should we expose `next_eligible_fire_at` (cooldown) on the rule?
--     Inspired by price_alerts.cooldown_minutes / last_triggered_at. Added.

-- ─── Rules ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auto_sell_rules (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Nullable: rule can be user-wide (fires for any account that owns the item)
  -- or scoped to one Steam account. MVP: required — architect decides if we
  -- widen later.
  account_id            INTEGER NOT NULL REFERENCES steam_accounts(id) ON DELETE CASCADE,
  -- The skin this rule watches. Pattern-independent (not asset_id) — fires
  -- for any owned copy matching the name.
  market_hash_name      VARCHAR(255) NOT NULL,
  -- When does this rule arm?
  --   'above' — fire when current price >= trigger_price_usd (typical "sell high")
  --   'below' — fire when current price <= trigger_price_usd (panic-sell floor)
  trigger_type          VARCHAR(10)  NOT NULL,
  trigger_price_usd     DECIMAL(10,2) NOT NULL CHECK (trigger_price_usd > 0),
  -- What price to list at. NULL means "use sell_strategy" exclusively.
  sell_price_usd        DECIMAL(10,2),
  -- How to compute list price at fire-time:
  --   'fixed'             — sell_price_usd literal
  --   'market_max'        — top-of-book from Steam histogram (undercut by min unit)
  --   'percent_of_market' — sell_price_usd is a percentage (e.g. 95.0 = 95%)
  sell_strategy         VARCHAR(20)  NOT NULL DEFAULT 'fixed',
  -- notify_only is the DEFAULT. Users must explicitly flip to auto_list.
  -- This is a product-safety decision — do not relax without architect sign-off.
  mode                  VARCHAR(20)  NOT NULL DEFAULT 'notify_only',
  enabled               BOOLEAN      NOT NULL DEFAULT TRUE,
  -- Minimum minutes between consecutive fires of the same rule.
  -- Prevents same rule firing 4x in an hour due to price oscillation.
  cooldown_minutes      INTEGER      NOT NULL DEFAULT 360, -- 6h default
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_fired_at         TIMESTAMPTZ,
  times_fired           INTEGER      NOT NULL DEFAULT 0,
  -- User-initiated pause (distinct from enabled=false so we can differentiate
  -- "turned off permanently" vs "temporarily paused / cancel-window used").
  cancelled_at          TIMESTAMPTZ,

  CONSTRAINT chk_auto_sell_trigger_type  CHECK (trigger_type IN ('above','below')),
  CONSTRAINT chk_auto_sell_strategy      CHECK (sell_strategy IN ('fixed','market_max','percent_of_market')),
  CONSTRAINT chk_auto_sell_mode          CHECK (mode IN ('notify_only','auto_list')),
  -- If strategy=fixed, sell_price_usd is required.
  CONSTRAINT chk_auto_sell_fixed_requires_price
    CHECK (sell_strategy <> 'fixed' OR sell_price_usd IS NOT NULL)
);

-- Index for the cron hot-path: "give me all enabled rules".
-- Partial index keeps it small (disabled/cancelled rules don't bloat it).
CREATE INDEX IF NOT EXISTS idx_auto_sell_rules_enabled
  ON auto_sell_rules (user_id, market_hash_name)
  WHERE enabled = TRUE AND cancelled_at IS NULL;

-- Cross-rule fan-out: when price updates, the engine needs to find all rules
-- watching a specific market_hash_name quickly.
CREATE INDEX IF NOT EXISTS idx_auto_sell_rules_name
  ON auto_sell_rules (market_hash_name)
  WHERE enabled = TRUE AND cancelled_at IS NULL;

-- ─── Executions (fire log) ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS auto_sell_executions (
  id                         SERIAL PRIMARY KEY,
  rule_id                    INTEGER NOT NULL REFERENCES auto_sell_rules(id) ON DELETE CASCADE,
  fired_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Snapshot the relevant state at fire-time so history is interpretable
  -- even after the rule is edited.
  market_hash_name           VARCHAR(255) NOT NULL,
  trigger_price_usd          DECIMAL(10,2) NOT NULL,
  actual_price_usd           DECIMAL(10,2) NOT NULL,
  intended_list_price_usd    DECIMAL(10,2),
  -- What actually happened:
  --   'notified'       — notify_only mode, push sent
  --   'pending_window' — auto_list fire scheduled, inside 60s cancel window
  --   'listed'         — auto_list succeeded on Steam (cancel window expired, listing created)
  --   'cancelled'      — user tapped "Undo" within the 60s window
  --   'failed'         — listing attempt failed (session expired, Steam error, etc.)
  action                     VARCHAR(20) NOT NULL,
  -- Optional link to the sell_operations row that actually executed the listing.
  sell_operation_id          UUID REFERENCES sell_operations(id) ON DELETE SET NULL,
  listing_id                 VARCHAR(40),
  error_message              TEXT,
  -- When the 60-second cancel window closes. For mode=notify_only this is
  -- equal to fired_at (no window). For auto_list it's fired_at + 60s.
  cancel_window_expires_at   TIMESTAMPTZ NOT NULL,

  CONSTRAINT chk_auto_sell_exec_action
    CHECK (action IN ('notified','listed','cancelled','failed','pending_window'))
);

-- Hot path: "show me executions for rule X, newest first"
CREATE INDEX IF NOT EXISTS idx_auto_sell_exec_rule
  ON auto_sell_executions (rule_id, fired_at DESC);

-- Used by the 60-second cancel-window worker to find "fire scheduled, not yet
-- executed or cancelled" rows.
CREATE INDEX IF NOT EXISTS idx_auto_sell_exec_pending_window
  ON auto_sell_executions (cancel_window_expires_at)
  WHERE action = 'pending_window';

-- FK back to sell_operations — avoids seq scan on cascade when a sell
-- operation row is removed.
CREATE INDEX IF NOT EXISTS idx_auto_sell_exec_sell_op
  ON auto_sell_executions (sell_operation_id)
  WHERE sell_operation_id IS NOT NULL;
