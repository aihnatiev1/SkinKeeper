/**
 * Feature-previews service — precomputed snapshot of user-facing stats
 * surfaced on the post-purchase tour ("Your top item: …", "47 items worth $342")
 * AND on the pre-purchase paywall teaser. Same shape, two call-sites.
 *
 * Design notes:
 *  - Available to ALL authenticated users (free + premium). The whole point is
 *    to render personalized teasers BEFORE the user pays — gating it would
 *    defeat the marketing flow.
 *  - Single SQL round-trip via CTEs: top item + inventory totals + alert/
 *    watchlist counts + auto-sell hint, all computed in one query so we
 *    don't pay 5 round-trips per call.
 *  - LATERAL JOIN for both current price (steam) and the closest price 7d ago.
 *    DISTINCT ON over price_history is banned (per CLAUDE memory) — measured
 *    at 2-4s on a 10M-row history table.
 *  - 5-min TTL in-memory cache keyed by userId. Preview data is teaser-grade,
 *    not a trading surface — staleness up to 5 minutes is fine and dwarfs the
 *    Steam scrape cycle anyway. Cache is registered with the global registry
 *    so /admin/cache-stats sees it.
 */
import { pool } from "../db/pool.js";
import { SteamSessionService } from "./steamSession.js";
import { TTLCache } from "../utils/TTLCache.js";
import { registerCache } from "../utils/cacheRegistry.js";

export interface TopItemPreview {
  marketHashName: string;
  iconUrl: string | null;
  currentPriceUsd: number;
  trend7d: string | null; // formatted like "+8.2%" / "-3.1%", null if no history
}

export interface InventoryStatsPreview {
  totalItems: number;
  totalValueUsd: number;
  uniqueItems: number;
}

export interface FeaturePreviews {
  topItem: TopItemPreview | null;
  inventoryStats: InventoryStatsPreview;
  trackedItemsCount: number;
  alertsActive: number;
  potentialAutoSellCandidates: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX_ENTRIES = 1000;

const previewCache = new TTLCache<number, FeaturePreviews>(
  CACHE_TTL_MS,
  CACHE_MAX_ENTRIES
);
registerCache(
  "featurePreviews",
  previewCache as unknown as TTLCache<unknown, unknown>
);

/**
 * Format a 7d trend with sign and one decimal, like "+8.2%" / "-3.1%".
 * Returns null if the historical price is unusable (≤0 or missing).
 */
function formatTrend(current: number, sevenDaysAgo: number | null): string | null {
  if (sevenDaysAgo === null || sevenDaysAgo <= 0) return null;
  const pct = ((current - sevenDaysAgo) / sevenDaysAgo) * 100;
  const rounded = pct.toFixed(1);
  return pct >= 0 ? `+${rounded}%` : `${rounded}%`;
}

/**
 * Build feature previews for a user from a fresh DB read.
 * Caller is responsible for cache lookup; this always hits the DB.
 *
 * Throws if the user has no linked Steam accounts (no active account).
 */
export async function computeFeaturePreviews(userId: number): Promise<FeaturePreviews> {
  // Resolve active account up-front — if there isn't one, the route should
  // 401 SESSION_EXPIRED rather than silently returning empty data.
  const accountId = await SteamSessionService.getActiveAccountId(userId);

  // Single query: 4 CTEs feed one final SELECT.
  //   inv         — base inventory rows for this account
  //   top         — most valuable item via LATERAL JOIN current_prices
  //   stats       — totals: items, unique names, summed value
  //   counts      — watchlist + active alerts (from price_alerts table)
  //   autosell    — count of items priced ≥1.5x cost basis
  // Everything assembles into a single jsonb result so we deserialize once.
  const sql = `
    WITH inv AS (
      SELECT i.market_hash_name, i.icon_url
      FROM inventory_items i
      WHERE i.steam_account_id = $2
    ),
    inv_priced AS (
      SELECT i.market_hash_name,
             i.icon_url,
             cp.price_usd::float AS price_usd
      FROM inv i
      JOIN LATERAL (
        SELECT price_usd
        FROM current_prices cp
        WHERE cp.market_hash_name = i.market_hash_name
          AND cp.source = 'steam'
          AND cp.price_usd > 0
        LIMIT 1
      ) cp ON true
    ),
    top_item AS (
      SELECT ip.market_hash_name,
             ip.icon_url,
             ip.price_usd
      FROM inv_priced ip
      ORDER BY ip.price_usd DESC NULLS LAST
      LIMIT 1
    ),
    top_item_trend AS (
      SELECT t.market_hash_name,
             t.icon_url,
             t.price_usd,
             (
               SELECT ph.price_usd::float
               FROM price_history ph
               WHERE ph.market_hash_name = t.market_hash_name
                 AND ph.source = 'steam'
                 AND ph.price_usd > 0
                 AND ph.recorded_at < NOW() - INTERVAL '7 days'
               ORDER BY ph.recorded_at DESC
               LIMIT 1
             ) AS price_7d_ago
      FROM top_item t
    ),
    stats AS (
      SELECT
        (SELECT COUNT(*)::int FROM inv) AS total_items,
        (SELECT COUNT(DISTINCT market_hash_name)::int FROM inv) AS unique_items,
        COALESCE((SELECT SUM(ip.price_usd)::float FROM inv_priced ip), 0) AS total_value
    ),
    counts AS (
      SELECT
        COUNT(*) FILTER (WHERE is_watchlist = TRUE)::int AS tracked,
        COUNT(*) FILTER (WHERE is_active = TRUE
                          AND (is_watchlist IS NULL OR is_watchlist = FALSE))::int AS alerts_active
      FROM price_alerts
      WHERE user_id = $1
    ),
    autosell AS (
      SELECT COUNT(*)::int AS candidates
      FROM item_cost_basis icb
      JOIN current_prices cp
        ON cp.market_hash_name = icb.market_hash_name
       AND cp.source = 'steam'
       AND cp.price_usd > 0
      WHERE icb.user_id = $1
        AND icb.avg_buy_price_cents > 0
        AND icb.current_holding > 0
        AND (cp.price_usd * 100) >= (icb.avg_buy_price_cents * 1.5)
    )
    SELECT
      (SELECT row_to_json(t) FROM top_item_trend t) AS top,
      (SELECT row_to_json(s) FROM stats s) AS stats,
      (SELECT row_to_json(c) FROM counts c) AS counts,
      (SELECT candidates FROM autosell) AS autosell_candidates
  `;

  const { rows } = await pool.query(sql, [userId, accountId]);
  const row = rows[0] ?? {};

  const top = row.top as
    | { market_hash_name: string; icon_url: string | null; price_usd: number; price_7d_ago: number | null }
    | null;
  const stats = row.stats as
    | { total_items: number; unique_items: number; total_value: number }
    | null;
  const counts = row.counts as
    | { tracked: number; alerts_active: number }
    | null;
  const autosellCandidates = (row.autosell_candidates as number | null) ?? 0;

  const topItem: TopItemPreview | null = top
    ? {
        marketHashName: top.market_hash_name,
        iconUrl: top.icon_url ?? null,
        currentPriceUsd: Number(top.price_usd ?? 0),
        trend7d: formatTrend(Number(top.price_usd ?? 0), top.price_7d_ago ?? null),
      }
    : null;

  return {
    topItem,
    inventoryStats: {
      totalItems: stats?.total_items ?? 0,
      totalValueUsd: Number(stats?.total_value ?? 0),
      uniqueItems: stats?.unique_items ?? 0,
    },
    trackedItemsCount: counts?.tracked ?? 0,
    alertsActive: counts?.alerts_active ?? 0,
    potentialAutoSellCandidates: autosellCandidates,
  };
}

/**
 * Cached version. Returns same response within the 5-min TTL window;
 * after expiry the next call re-queries the DB.
 */
export async function getFeaturePreviews(userId: number): Promise<FeaturePreviews> {
  const cached = previewCache.get(userId);
  if (cached !== undefined) return cached;

  const fresh = await computeFeaturePreviews(userId);
  previewCache.set(userId, fresh);
  return fresh;
}

/**
 * Drop a single user's cached previews. Call from inventory sync, alert
 * mutations, watchlist edits — anywhere the underlying numbers shift.
 */
export function invalidateFeaturePreviews(userId: number): void {
  previewCache.delete(userId);
}

/** Test-only escape hatch. Don't ship code that calls this from production paths. */
export function _resetFeaturePreviewCache(): void {
  previewCache.clear();
}
