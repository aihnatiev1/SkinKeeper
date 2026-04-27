-- 005_item_inspect_details.sql
-- Float, stickers, charms via inspect link on inventory items.

ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS inspect_link TEXT;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS paint_seed INTEGER;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS paint_index INTEGER;
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS stickers JSONB DEFAULT '[]';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS charms JSONB DEFAULT '[]';
ALTER TABLE inventory_items ADD COLUMN IF NOT EXISTS inspected_at TIMESTAMPTZ;
