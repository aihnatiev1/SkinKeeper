-- 034_auto_sell_rules.sql
-- Auto-sell rules and executions (P3 premium feature).
--
-- User creates rules like "if AK Redline > $15, list for min($15, market_max)".
-- A cron job (*/15 * * * *) evaluates rules vs current_prices and either
-- (notify_only) sends a push, or (auto_list) schedules a listing after a
-- 60-second user cancel window.
--
-- Safety rails (DO NOT relax without architect sign-off):
--   - notify_only is the DEFAULT mode; auto_list must be opted-in
--   - 60-second cancel window on every auto_list fire
--   - MIN multiplier 0.5x guard in autoSellEngine downgrades to notified
--   - MAX multiplier 5x guard already in sellOperations.ts
--   - Premium-only feature; max 10 rules per user

CREATE TABLE IF NOT EXISTS auto_sell_rules (
  id                    SERIAL PRIMARY KEY,
  user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  account_id            INTEGER NOT NULL REFERENCES steam_accounts(id) ON DELETE CASCADE,
  market_hash_name      VARCHAR(255) NOT NULL,
  trigger_type          VARCHAR(10)  NOT NULL,
  trigger_price_usd     DECIMAL(10,2) NOT NULL CHECK (trigger_price_usd > 0),
  sell_price_usd        DECIMAL(10,2),
  sell_strategy         VARCHAR(20)  NOT NULL DEFAULT 'fixed',
  mode                  VARCHAR(20)  NOT NULL DEFAULT 'notify_only',
  enabled               BOOLEAN      NOT NULL DEFAULT TRUE,
  cooldown_minutes      INTEGER      NOT NULL DEFAULT 360,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  last_fired_at         TIMESTAMPTZ,
  times_fired           INTEGER      NOT NULL DEFAULT 0,
  cancelled_at          TIMESTAMPTZ,
  CONSTRAINT chk_auto_sell_trigger_type  CHECK (trigger_type IN ('above','below')),
  CONSTRAINT chk_auto_sell_strategy      CHECK (sell_strategy IN ('fixed','market_max','percent_of_market')),
  CONSTRAINT chk_auto_sell_mode          CHECK (mode IN ('notify_only','auto_list')),
  CONSTRAINT chk_auto_sell_fixed_requires_price
    CHECK (sell_strategy <> 'fixed' OR sell_price_usd IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_auto_sell_rules_enabled
  ON auto_sell_rules (user_id, market_hash_name)
  WHERE enabled = TRUE AND cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_auto_sell_rules_name
  ON auto_sell_rules (market_hash_name)
  WHERE enabled = TRUE AND cancelled_at IS NULL;

CREATE TABLE IF NOT EXISTS auto_sell_executions (
  id                         SERIAL PRIMARY KEY,
  rule_id                    INTEGER NOT NULL REFERENCES auto_sell_rules(id) ON DELETE CASCADE,
  fired_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  market_hash_name           VARCHAR(255) NOT NULL,
  trigger_price_usd          DECIMAL(10,2) NOT NULL,
  actual_price_usd           DECIMAL(10,2) NOT NULL,
  intended_list_price_usd    DECIMAL(10,2),
  action                     VARCHAR(20) NOT NULL,
  sell_operation_id          UUID REFERENCES sell_operations(id) ON DELETE SET NULL,
  listing_id                 VARCHAR(40),
  error_message              TEXT,
  cancel_window_expires_at   TIMESTAMPTZ NOT NULL,
  CONSTRAINT chk_auto_sell_exec_action
    CHECK (action IN ('notified','listed','cancelled','failed','pending_window'))
);

CREATE INDEX IF NOT EXISTS idx_auto_sell_exec_rule
  ON auto_sell_executions (rule_id, fired_at DESC);

CREATE INDEX IF NOT EXISTS idx_auto_sell_exec_pending_window
  ON auto_sell_executions (cancel_window_expires_at)
  WHERE action = 'pending_window';

CREATE INDEX IF NOT EXISTS idx_auto_sell_exec_sell_op
  ON auto_sell_executions (sell_operation_id)
  WHERE sell_operation_id IS NOT NULL;
