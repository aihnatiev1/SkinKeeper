-- Track which refresh-token expiry we last pushed a reminder for, so the
-- session-expiry notifier doesn't spam the user every day once a token
-- enters the warning window.
ALTER TABLE steam_accounts
  ADD COLUMN IF NOT EXISTS expiry_notified_for TIMESTAMPTZ;
