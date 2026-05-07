-- 040_partner_steam_id_nullable.sql
--
-- trade_offers.partner_steam_id was VARCHAR(17) NOT NULL (Steam IDs are
-- exactly 17 digits). Two upsert paths fell back to writing the partner's
-- display name into this column when the Steam ID couldn't be parsed:
--
--   - Live GetTradeOffers upsert: `offer.partnerSteamId || offer.partnerName`
--   - HTML history scrape:        `trade.partnerSteamId || trade.partnerName`
--
-- Display names are VARCHAR(100), so any partner with a name >17 chars
-- triggered `value too long for type character varying(17)` and the
-- entire trade row was silently dropped (caught and logged at WARN).
--
-- Fix: make partner_steam_id NULLABLE. The column now means what its name
-- says — a real Steam ID, or NULL if we don't have one. partner_name
-- already holds the display name. Existing rows are unaffected.

ALTER TABLE trade_offers
  ALTER COLUMN partner_steam_id DROP NOT NULL;
