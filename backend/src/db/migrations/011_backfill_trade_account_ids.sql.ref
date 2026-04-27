-- Backfill account_id_from for historical trade_offers where it is NULL.
-- Attributes them to the user's primary steam account (earliest registered).
UPDATE trade_offers t
SET account_id_from = (
  SELECT sa.id
  FROM steam_accounts sa
  WHERE sa.user_id = t.user_id
  ORDER BY sa.id ASC
  LIMIT 1
)
WHERE t.account_id_from IS NULL;
