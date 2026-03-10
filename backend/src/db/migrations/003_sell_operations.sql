-- 003_sell_operations.sql
-- Tracked sell operations with per-item status, and daily volume tracking.

CREATE TABLE IF NOT EXISTS sell_operations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending',
  total_items  INTEGER NOT NULL,
  succeeded    INTEGER NOT NULL DEFAULT 0,
  failed       INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT chk_sell_op_status CHECK (status IN ('pending','in_progress','completed','cancelled'))
);

CREATE TABLE IF NOT EXISTS sell_operation_items (
  id                    SERIAL PRIMARY KEY,
  operation_id          UUID NOT NULL REFERENCES sell_operations(id) ON DELETE CASCADE,
  asset_id              VARCHAR(20) NOT NULL,
  market_hash_name      VARCHAR(255),
  price_cents           INTEGER NOT NULL,
  status                VARCHAR(20) NOT NULL DEFAULT 'queued',
  error_message         TEXT,
  requires_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_sell_item_status CHECK (status IN ('queued','listing','listed','failed','cancelled'))
);

CREATE TABLE IF NOT EXISTS sell_volume (
  id      SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day     DATE NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  UNIQUE(user_id, day)
);

CREATE INDEX IF NOT EXISTS idx_sell_ops_user ON sell_operations(user_id, status);
CREATE INDEX IF NOT EXISTS idx_sell_items_op ON sell_operation_items(operation_id, status);
CREATE INDEX IF NOT EXISTS idx_sell_volume_user_day ON sell_volume(user_id, day);
