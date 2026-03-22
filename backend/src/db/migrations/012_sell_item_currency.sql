-- 012_sell_item_currency.sql
-- Store the currency of price_cents so the sell worker knows whether conversion is needed.
-- NULL = wallet currency (default behavior), 1 = USD, 18 = UAH, etc.

ALTER TABLE sell_operation_items
  ADD COLUMN IF NOT EXISTS price_currency_id INTEGER;
