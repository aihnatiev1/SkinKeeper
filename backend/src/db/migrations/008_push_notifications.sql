-- 008_push_notifications.sql
-- Push notifications, user devices, alert history, and alert enhancements.

ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS source VARCHAR(20) DEFAULT 'any';
ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ;
ALTER TABLE price_alerts ADD COLUMN IF NOT EXISTS cooldown_minutes INTEGER DEFAULT 60;

CREATE TABLE IF NOT EXISTS user_devices (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  fcm_token  TEXT NOT NULL,
  platform   VARCHAR(10) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, fcm_token)
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user ON user_devices(user_id);

CREATE TABLE IF NOT EXISTS alert_history (
  id         SERIAL PRIMARY KEY,
  alert_id   INTEGER NOT NULL REFERENCES price_alerts(id) ON DELETE CASCADE,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source     VARCHAR(20) NOT NULL,
  price_usd  DECIMAL(10,2) NOT NULL,
  message    TEXT NOT NULL,
  sent_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_history_user ON alert_history(user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_history_alert ON alert_history(alert_id, sent_at DESC);
