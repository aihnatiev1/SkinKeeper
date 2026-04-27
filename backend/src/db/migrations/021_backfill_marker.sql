-- 021_backfill_marker.sql
-- Marker migration: backfill of trade_offers account_id_from was done as a
-- data migration (UPDATE) outside the schema DDL. The data migration lives
-- in 000_data_backfill.sql and was run once on prod.
-- This migration is a no-op schema marker so the version stays in sequence.
SELECT 1; -- no-op
