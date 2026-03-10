ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS trade_ban_until TIMESTAMPTZ;
