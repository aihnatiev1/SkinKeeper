-- 041_clear_broken_inspect_fail_cache.sql
--
-- inventory_items.inspected_at doubles as a "we tried to decode this and
-- failed, don't retry for 2h" fail-cache (services/inspect.ts:138). We had
-- ~1995 items where the inspect_link was a Steam template that the parser
-- never resolved — `+csgo_econ_action_preview %propid:6%` — so every decode
-- attempt returned `unresolved_template` and immediately wrote
-- inspected_at=NOW(). The cache then suppressed retries.
--
-- The extension now resolves %propid:N% from m_rgAssetProperties and the
-- enrich endpoint accepts the resolved link, but those items still have a
-- recent inspected_at and won't be re-tried until 24h pass. Clear the
-- fail-cache so they re-enter the decode path on the next inventory sync.
--
-- Scope is conservative: only touch rows whose link still contains the
-- placeholder. Rows with valid (decoded) data are left alone.

UPDATE inventory_items
   SET inspected_at = NULL
 WHERE inspect_link LIKE '%propid%'
   AND float_value IS NULL;
