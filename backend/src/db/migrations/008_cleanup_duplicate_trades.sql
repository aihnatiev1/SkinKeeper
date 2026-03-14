-- Migration 008: Clean up duplicate trade records caused by history scraper
-- creating histhtml_ synthetic IDs alongside real steam_offer_id records for
-- the same accepted trade.
--
-- Step 1: Move items from histhtml_ records to the matching real-ID record
--         (if the real-ID record has no named items yet).
-- Step 2: Delete the now-redundant histhtml_ records.

DO $$
DECLARE
  hist_rec RECORD;
  real_id  uuid;
BEGIN
  -- Find all histhtml_ trade records that have a matching real-ID record
  -- (same user, same partner, accepted, within 15 minutes of each other)
  FOR hist_rec IN
    SELECT h.id      AS hist_id,
           h.user_id,
           h.partner_steam_id,
           h.created_at
    FROM trade_offers h
    WHERE h.steam_offer_id LIKE 'histhtml_%'
      AND h.status = 'accepted'
  LOOP
    -- Find matching real-ID record
    SELECT r.id INTO real_id
    FROM trade_offers r
    WHERE r.user_id = hist_rec.user_id
      AND r.partner_steam_id = hist_rec.partner_steam_id
      AND r.status = 'accepted'
      AND r.steam_offer_id NOT LIKE 'histhtml_%'
      AND r.created_at BETWEEN hist_rec.created_at - INTERVAL '15 minutes'
                           AND hist_rec.created_at + INTERVAL '15 minutes'
    ORDER BY ABS(EXTRACT(EPOCH FROM (r.created_at - hist_rec.created_at)))
    LIMIT 1;

    IF real_id IS NOT NULL THEN
      -- Backfill items onto real record if it has no named items yet
      IF NOT EXISTS (
        SELECT 1 FROM trade_offer_items
        WHERE offer_id = real_id AND market_hash_name IS NOT NULL
        LIMIT 1
      ) THEN
        -- Move items from histhtml_ record to real record
        UPDATE trade_offer_items
        SET offer_id = real_id
        WHERE offer_id = hist_rec.hist_id;
      END IF;

      -- Delete the now-redundant histhtml_ record (items already moved or real had named items)
      DELETE FROM trade_offer_items WHERE offer_id = hist_rec.hist_id;
      DELETE FROM trade_offers WHERE id = hist_rec.hist_id;
    END IF;
  END LOOP;
END $$;
