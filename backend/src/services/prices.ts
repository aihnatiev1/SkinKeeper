import axios from "axios";
import { pool } from "../db/pool.js";
import { evaluateAlerts } from "./alertEngine.js";
import { recordFetchStart, recordSuccess, recordFailure, record429, updateCrawlerState } from "./priceStats.js";
import {
  initProxyPool,
  proxyRequest,
  getSlotCount,
  getSlot,
  getSlotConfig,
  isSlotAvailable,
  recordSlot429,
  recordSlotSuccess,
} from "./proxyPool.js";

interface SkinportItem {
  market_hash_name: string;
  suggested_price: number | null;
  min_price: number | null;
  median_price: number | null;
  mean_price: number | null;
}

// Skinport: free, no auth, 8 requests per 5 min
// Singleton mutex: only one fetch at a time, concurrent callers get same result
let skinportCache: Map<string, number> = new Map();
let skinportLastFetch = 0;
let skinportBackoffUntil = 0;
let skinportInFlight: Promise<Map<string, number>> | null = null;

const SKINPORT_MAX_RETRIES = 2;
const SKINPORT_CACHE_MS = 10 * 60 * 1000; // 10 min cache (matches cron interval)

export async function fetchSkinportPrices(): Promise<Map<string, number>> {
  const now = Date.now();

  // Respect backoff from previous 429
  if (now < skinportBackoffUntil) {
    if (skinportCache.size > 0) return skinportCache;
    return new Map();
  }

  // Return cache if fresh
  if (now - skinportLastFetch < SKINPORT_CACHE_MS && skinportCache.size > 0) {
    return skinportCache;
  }

  // Singleton: if already fetching, wait for that result instead of firing another request
  if (skinportInFlight) {
    return skinportInFlight;
  }

  skinportInFlight = _doFetchSkinport();
  try {
    return await skinportInFlight;
  } finally {
    skinportInFlight = null;
  }
}

async function _doFetchSkinport(): Promise<Map<string, number>> {
  for (let attempt = 0; attempt < SKINPORT_MAX_RETRIES; attempt++) {
    const endLatency = recordFetchStart("skinport");
    try {
      const { data } = await proxyRequest<SkinportItem[]>(
        {
          method: "GET",
          url: "https://api.skinport.com/v1/items",
          params: { app_id: 730, currency: "USD" },
          headers: {
            "Accept-Encoding": "br, gzip",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          },
          timeout: 30000,
        },
        "skinport"
      );
      endLatency();

      const prices = new Map<string, number>();
      for (const item of data) {
        const price = item.suggested_price ?? item.min_price ?? item.median_price;
        if (price !== null) {
          prices.set(item.market_hash_name, price);
        }
      }

      skinportCache = prices;
      skinportLastFetch = Date.now();
      skinportBackoffUntil = 0;
      recordSuccess("skinport", prices.size);
      return prices;
    } catch (err: any) {
      endLatency();
      const status = err?.response?.status;
      if (status === 429 || status === 403) {
        record429("skinport");
        const retryAfter = parseInt(err.response?.headers?.["retry-after"] || "0", 10);
        const waitSec = retryAfter > 0 ? retryAfter : (attempt + 1) * 120;
        skinportBackoffUntil = Date.now() + waitSec * 1000;
        console.warn(`[Skinport] ${status} (attempt ${attempt + 1}/${SKINPORT_MAX_RETRIES}), backoff ${waitSec}s`);

        if (attempt < SKINPORT_MAX_RETRIES - 1) {
          await new Promise((r) => setTimeout(r, waitSec * 1000));
        }
      } else {
        recordFailure("skinport", err.message || String(err));
        throw err;
      }
    }
  }

  recordFailure("skinport", `All ${SKINPORT_MAX_RETRIES} retries exhausted (429)`);
  console.error(`[Skinport] All ${SKINPORT_MAX_RETRIES} retries exhausted due to 429`);
  if (skinportCache.size > 0) return skinportCache;
  return new Map();
}

// ─── Adaptive Rate Limiter ───────────────────────────────────────────────

interface AdaptiveLimiterConfig {
  name: string;
  minIntervalMs: number;   // fastest we'll ever go
  maxIntervalMs: number;   // slowest before giving up
  startIntervalMs: number; // initial interval
  backoffFactor: number;   // multiply interval on 429
  cooldownFactor: number;  // multiply interval on success (< 1 to speed up)
  successesBeforeSpeedup: number; // consecutive successes needed to speed up
  refreshAgeMs: number;    // skip items priced more recently than this
}

class AdaptiveCrawler {
  private config: AdaptiveLimiterConfig;
  private currentInterval: number;
  private consecutiveSuccesses = 0;
  private consecutive429s = 0;
  private pausedUntil = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private source: string;
  private fetchFn: (name: string) => Promise<number | null>;
  /** Which proxy slot this crawler is bound to (-1 = auto-rotate) */
  private slotIndex: number;
  private domain: string;

  constructor(
    config: AdaptiveLimiterConfig,
    source: string,
    fetchFn: (name: string) => Promise<number | null>,
    options?: { slotIndex?: number; domain?: string }
  ) {
    this.config = config;
    this.source = source;
    this.fetchFn = fetchFn;
    this.currentInterval = config.startIntervalMs;
    this.slotIndex = options?.slotIndex ?? -1;
    this.domain = options?.domain ?? source;
  }

  async getNextItem(): Promise<string | null> {
    // Items without any price from ANY source in current_prices (true gaps)
    const { rows: noPriceRows } = await pool.query(
      `SELECT DISTINCT ii.market_hash_name
       FROM inventory_items ii
       WHERE NOT EXISTS (
           SELECT 1 FROM current_prices cp
           WHERE cp.market_hash_name = ii.market_hash_name
             AND cp.price_usd > 0
         )
       LIMIT 1`
    );
    if (noPriceRows.length > 0) return noPriceRows[0].market_hash_name;

    // Item with oldest price for THIS source (older than refreshAgeMs)
    const ageSec = Math.floor(this.config.refreshAgeMs / 1000);
    const { rows: oldestRows } = await pool.query(
      `SELECT cp.market_hash_name, cp.updated_at
       FROM current_prices cp
       INNER JOIN inventory_items ii ON ii.market_hash_name = cp.market_hash_name
       WHERE cp.source = $1
         AND cp.updated_at < NOW() - INTERVAL '1 second' * $2
       ORDER BY cp.updated_at ASC
       LIMIT 1`,
      [this.source, ageSec]
    );
    if (oldestRows.length > 0) return oldestRows[0].market_hash_name;

    return null;
  }

  private jitter(ms: number): number {
    // ±25% random jitter to avoid detectable patterns
    return ms + ms * 0.25 * (Math.random() * 2 - 1);
  }

  private async tick(): Promise<void> {
    // If rate limited, wait
    if (Date.now() < this.pausedUntil) {
      const waitMs = this.pausedUntil - Date.now();
      this.timer = setTimeout(() => this.tick(), this.jitter(waitMs + 1000));
      return;
    }

    // If bound to a specific slot, check if it's available
    if (this.slotIndex >= 0 && !isSlotAvailable(this.slotIndex, this.domain)) {
      // Slot in cooldown — wait 30s and retry
      this.timer = setTimeout(() => this.tick(), 30_000);
      return;
    }

    const endLatency = recordFetchStart(this.source);
    try {
      const itemName = await this.getNextItem();
      if (!itemName) {
        endLatency();
        updateCrawlerState(this.source, this.currentInterval, this.pausedUntil, this.consecutiveSuccesses);
        this.timer = setTimeout(() => this.tick(), 60_000);
        return;
      }

      const price = await this.fetchFn(itemName);
      endLatency();

      if (price !== null) {
        await savePrices(new Map([[itemName, price]]), this.source);
      } else {
        // Mark as fetched so we don't loop on non-marketable items
        await savePrices(new Map([[itemName, 0]]), this.source);
      }

      recordSuccess(this.source, 1);
      if (this.slotIndex >= 0) recordSlotSuccess(this.slotIndex, this.domain);

      // Success — reset 429 counter and track speedup
      this.consecutive429s = 0;
      this.consecutiveSuccesses++;
      if (this.consecutiveSuccesses >= this.config.successesBeforeSpeedup) {
        this.currentInterval = Math.max(
          this.config.minIntervalMs,
          Math.floor(this.currentInterval * this.config.cooldownFactor)
        );
        this.consecutiveSuccesses = 0;
      }
    } catch (err: any) {
      endLatency();
      const status = err?.response?.status ?? err?.status;
      if (status === 429 || err?.retryAfter) {
        record429(this.source);
        this.consecutive429s++;
        this.consecutiveSuccesses = 0;

        const retryAfter = err.retryAfter
          ?? parseInt(err.response?.headers?.["retry-after"] || "0", 10);

        // Record in proxy pool
        if (this.slotIndex >= 0) {
          recordSlot429(this.slotIndex, this.domain, retryAfter);
        }

        // Exponential backoff on interval
        this.currentInterval = Math.min(
          this.config.maxIntervalMs,
          Math.floor(this.currentInterval * this.config.backoffFactor)
        );

        // Circuit breaker: after 5 consecutive 429s, pause 10 min (not 1h — we have proxies)
        if (this.consecutive429s >= 5) {
          const pauseMs = 10 * 60_000; // 10 minutes (reduced from 1h)
          this.pausedUntil = Date.now() + pauseMs;
          this.currentInterval = this.config.maxIntervalMs;
          const slotName = this.slotIndex >= 0 ? getSlot(this.slotIndex)?.name ?? "?" : "auto";
          console.warn(`[${this.config.name}:${slotName}] Circuit breaker: ${this.consecutive429s} 429s — pausing 10m`);
          this.timer = setTimeout(() => this.tick(), pauseMs + 1000);
          updateCrawlerState(this.source, this.currentInterval, this.pausedUntil, this.consecutiveSuccesses);
          return;
        }

        if (retryAfter > 0) {
          // Cap wait at 5 min per slot — other slots handle the load
          const waitMs = Math.min(retryAfter * 1000, 5 * 60_000);
          this.pausedUntil = Date.now() + waitMs;
          this.timer = setTimeout(() => this.tick(), waitMs + 1000);
          updateCrawlerState(this.source, this.currentInterval, this.pausedUntil, this.consecutiveSuccesses);
          return;
        }
      } else {
        recordFailure(this.source, err.message || String(err));
        console.error(`[${this.config.name}] Error:`, err.message || err);
      }
    }

    updateCrawlerState(this.source, this.currentInterval, this.pausedUntil, this.consecutiveSuccesses);
    this.timer = setTimeout(() => this.tick(), this.jitter(this.currentInterval));
  }

  start(delayMs = 5000): void {
    const slotName = this.slotIndex >= 0 ? getSlot(this.slotIndex)?.name ?? "?" : "auto";
    console.log(`[${this.config.name}:${slotName}] Starting crawler (interval: ${(this.currentInterval / 1000).toFixed(1)}s)`);
    this.timer = setTimeout(() => this.tick(), delayMs);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

// ─── Steam Market Batch Crawler ──────────────────────────────────────────
//
// Instead of 1000+ individual /priceoverview requests (→ 429),
// use /market/search/render/?norender=1 which returns 100 items per page.
//
// ~20K CS2 items ÷ 100 per page = 200 requests per full crawl.
// At 5s gap between pages = ~17 min per full crawl.
// Run every 2 hours = ~100 requests/hour. No 429.
//
// Each page rotates through proxy slots to distribute load across IPs.

const STEAM_SEARCH_GAP_MS = 5000; // 5s between pages (safe margin)
const STEAM_SEARCH_COUNT = 100;   // items per page (Steam max)
const STEAM_SEARCH_429_PAUSE_MS = 5 * 60_000; // 5 min pause on 429

let steamBatchTimer: ReturnType<typeof setTimeout> | null = null;
let steamBatchRunning = false;

interface SteamSearchResult {
  success: boolean;
  total_count: number;
  results?: Array<{
    hash_name: string;
    name: string;
    sell_price: number;       // cents
    sell_price_text: string;
    sell_listings: number;
    asset_description?: {
      appid: number;
      type: string;
    };
  }>;
}

/**
 * Fetch one page of Steam Market search results (100 items with prices).
 * Rotates through proxy slots automatically.
 */
async function fetchSteamSearchPage(
  start: number,
  slotIndex: number
): Promise<SteamSearchResult | null> {
  const config: any = {
    params: {
      query: "",
      start,
      count: STEAM_SEARCH_COUNT,
      search_descriptions: 0,
      sort_column: "name",
      sort_dir: "asc",
      appid: 730,
      norender: 1,
    },
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      "Accept": "application/json",
    },
    timeout: 15000,
  };

  // Apply proxy slot
  if (slotIndex >= 0) {
    Object.assign(config, getSlotConfig(slotIndex));
  }

  const { data } = await axios.get(
    "https://steamcommunity.com/market/search/render/",
    config
  );
  return data;
}

/**
 * Run a full batch crawl: page through ALL CS2 market items.
 * One request per 5 seconds, rotating proxy slots.
 */
export async function runSteamBatchCrawl(): Promise<void> {
  if (steamBatchRunning) {
    console.log("[Steam Batch] Already running, skipping");
    return;
  }
  steamBatchRunning = true;
  initProxyPool();

  const slotCount = getSlotCount();
  let start = 0;
  let totalSaved = 0;
  let pageNum = 0;
  let consecutive429s = 0;

  const endLatencyOuter = recordFetchStart("steam");

  try {
    while (true) {
      const slotIdx = slotCount > 0 ? pageNum % slotCount : -1;
      const slot = slotIdx >= 0 ? getSlot(slotIdx) : undefined;
      const slotName = slot?.name ?? "direct";

      try {
        const result = await fetchSteamSearchPage(start, slotIdx);

        if (!result?.success || !result.results || result.results.length === 0) {
          if (start === 0) {
            console.warn("[Steam Batch] First page returned no results — possible block");
          }
          break;
        }

        // Extract prices (sell_price is in cents)
        const prices = new Map<string, number>();
        for (const item of result.results) {
          if (item.sell_price > 0 && item.hash_name) {
            prices.set(item.hash_name, item.sell_price / 100);
          }
        }

        if (prices.size > 0) {
          await savePrices(prices, "steam");
          totalSaved += prices.size;
        }

        if (slotIdx >= 0) recordSlotSuccess(slotIdx, "steamcommunity.com");
        consecutive429s = 0;
        pageNum++;

        // Check if we've reached the end
        start += STEAM_SEARCH_COUNT;
        if (start >= result.total_count) {
          console.log(`[Steam Batch] Complete: ${totalSaved} prices from ${pageNum} pages (total: ${result.total_count} items)`);
          break;
        }

        // Rate limit: 5s between pages
        await new Promise((r) => setTimeout(r, STEAM_SEARCH_GAP_MS));
      } catch (err: any) {
        const status = err?.response?.status;

        if (status === 429) {
          consecutive429s++;
          if (slotIdx >= 0) {
            const retryAfter = parseInt(err.response?.headers?.["retry-after"] || "0", 10);
            recordSlot429(slotIdx, "steamcommunity.com", retryAfter);
          }
          record429("steam");

          if (consecutive429s >= 3) {
            console.warn(`[Steam Batch] 3 consecutive 429s at page ${pageNum} — pausing ${STEAM_SEARCH_429_PAUSE_MS / 1000}s`);
            await new Promise((r) => setTimeout(r, STEAM_SEARCH_429_PAUSE_MS));
            consecutive429s = 0;
          } else {
            // Wait longer between retries, try next proxy slot
            await new Promise((r) => setTimeout(r, 30_000));
            pageNum++; // rotate to next slot
          }
          continue; // Retry same page with different slot
        }

        // Non-429 error — log and continue to next page
        console.error(`[Steam Batch] Error on page ${pageNum}:`, err.message || err);
        recordFailure("steam", err.message || String(err));
        start += STEAM_SEARCH_COUNT;
        pageNum++;
        await new Promise((r) => setTimeout(r, STEAM_SEARCH_GAP_MS));
      }
    }
  } finally {
    endLatencyOuter();
    steamBatchRunning = false;
    recordSuccess("steam", totalSaved);
    console.log(`[Steam Batch] Finished. Saved ${totalSaved} prices.`);
  }
}

/**
 * Start the Steam batch crawler on a schedule (every 2 hours).
 * First run starts after 30s delay.
 */
export function startSteamCrawlers(): void {
  initProxyPool();

  const INTERVAL_MS = 2 * 3600_000; // 2 hours

  async function scheduledRun() {
    try {
      await runSteamBatchCrawl();
    } catch (err) {
      console.error("[Steam Batch] Unhandled error:", err);
    }
    steamBatchTimer = setTimeout(scheduledRun, INTERVAL_MS);
  }

  // Start first run after 30s (let other init complete)
  steamBatchTimer = setTimeout(scheduledRun, 30_000);
  console.log("[Steam Batch] Scheduled: runs every 2h, first run in 30s");
}

export function stopSteamCrawlers(): void {
  if (steamBatchTimer) {
    clearTimeout(steamBatchTimer);
    steamBatchTimer = null;
  }
  steamBatchRunning = false;
}

// Legacy exports
export function startSteamCrawler(): void { startSteamCrawlers(); }
export function stopSteamCrawler(): void { stopSteamCrawlers(); }

// ─── Shared Utilities ────────────────────────────────────────────────────

// Store prices in DB for history + current_prices
export async function savePrices(
  prices: Map<string, number>,
  source: string
): Promise<void> {
  if (prices.size === 0) return;

  // Batch insert into price_history in chunks of 500
  const entries = [...prices.entries()];
  const chunkSize = 500;

  for (let c = 0; c < entries.length; c += chunkSize) {
    const chunk = entries.slice(c, c + chunkSize);
    const values: string[] = [];
    const params: (string | number)[] = [];
    let i = 1;

    for (const [name, price] of chunk) {
      values.push(`($${i}, $${i + 1}, $${i + 2})`);
      params.push(name, source, price);
      i += 3;
    }

    await pool.query(
      `INSERT INTO price_history (market_hash_name, source, price_usd)
       VALUES ${values.join(",")}`,
      params
    );
  }

  // Also update current_prices for fast lookups
  await upsertCurrentPrices(prices, source);

  // Evaluate alerts after saving prices
  try {
    await evaluateAlerts(prices, source);
  } catch (err) {
    console.error("[Alerts] Evaluation failed:", err);
  }
}

// ─── Current Prices (shared table) ──────────────────────────────────────

/**
 * Batch UPSERT prices into current_prices table.
 * One row per item per source — always up to date.
 */
export async function upsertCurrentPrices(
  prices: Map<string, number>,
  source: string
): Promise<void> {
  if (prices.size === 0) return;

  const entries = [...prices.entries()].filter(([, p]) => p > 0);
  const chunkSize = 500;

  for (let c = 0; c < entries.length; c += chunkSize) {
    const chunk = entries.slice(c, c + chunkSize);
    const values: string[] = [];
    const params: (string | number)[] = [];
    let i = 1;

    for (const [name, price] of chunk) {
      values.push(`($${i}, $${i + 1}, $${i + 2})`);
      params.push(name, source, price);
      i += 3;
    }

    await pool.query(
      `INSERT INTO current_prices (market_hash_name, source, price_usd)
       VALUES ${values.join(",")}
       ON CONFLICT (market_hash_name, source)
       DO UPDATE SET price_usd = EXCLUDED.price_usd, updated_at = NOW()`,
      params
    );
  }
}

// Get latest prices for a list of items (reads from current_prices)
export async function getLatestPrices(
  marketHashNames: string[]
): Promise<Map<string, Record<string, number>>> {
  if (marketHashNames.length === 0) return new Map();

  const { rows } = await pool.query(
    `SELECT market_hash_name, source, price_usd
     FROM current_prices
     WHERE market_hash_name = ANY($1)
       AND price_usd > 0`,
    [marketHashNames]
  );

  const result = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const price = parseFloat(row.price_usd);
    const existing = result.get(row.market_hash_name) ?? {};
    existing[row.source] = price;
    result.set(row.market_hash_name, existing);
  }
  return result;
}

// Get best (highest) price for a list of items — returns Map<name, bestPrice>
export async function getBestPrices(
  marketHashNames: string[]
): Promise<Map<string, number>> {
  if (marketHashNames.length === 0) return new Map();

  const { rows } = await pool.query(
    `SELECT market_hash_name, MAX(price_usd)::float AS best_price
     FROM current_prices
     WHERE market_hash_name = ANY($1) AND price_usd > 0
     GROUP BY market_hash_name`,
    [marketHashNames]
  );

  return new Map(rows.map((r: any) => [r.market_hash_name, r.best_price]));
}

// Get unique market_hash_names from all users' inventories
export async function getUniqueInventoryNames(): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT market_hash_name FROM inventory_items`
  );
  return rows.map((r) => r.market_hash_name);
}

// Get price history for a specific item
export async function getPriceHistory(
  marketHashName: string,
  days: number = 30
): Promise<Array<{ source: string; price_usd: number; recorded_at: string }>> {
  const { rows } = await pool.query(
    `SELECT source, price_usd, recorded_at
     FROM price_history
     WHERE market_hash_name = $1
       AND recorded_at > NOW() - INTERVAL '1 day' * $2
       AND price_usd > 0
     ORDER BY recorded_at ASC
     LIMIT 2000`,
    [marketHashName, days]
  );
  return rows.map((r) => ({
    source: r.source,
    price_usd: parseFloat(r.price_usd),
    recorded_at: r.recorded_at,
  }));
}

/**
 * Prune old price_history to keep DB size manageable.
 *
 * Strategy:
 * 1. Delete rows older than 90 days entirely
 * 2. For rows 7-90 days old: keep only 1 per item/source/day (the latest)
 * 3. Keep last 7 days untouched (full detail for charts)
 *
 * This reduces ~14M skinport rows to manageable levels.
 */
export async function pruneOldPrices(): Promise<void> {
  const start = Date.now();

  // Step 1: Delete everything older than 90 days
  const { rowCount: deletedOld } = await pool.query(
    `DELETE FROM price_history WHERE recorded_at < NOW() - INTERVAL '90 days'`
  );
  console.log(`[Prune] Deleted ${deletedOld ?? 0} rows older than 90 days`);

  // Step 2: For 7-90 days, keep only latest per item/source/day
  // Delete duplicates — keep the one with MAX(id) per (name, source, date)
  const { rowCount: deletedDups } = await pool.query(
    `DELETE FROM price_history ph
     WHERE recorded_at >= NOW() - INTERVAL '90 days'
       AND recorded_at < NOW() - INTERVAL '7 days'
       AND id NOT IN (
         SELECT DISTINCT ON (market_hash_name, source, recorded_at::date)
                id
         FROM price_history
         WHERE recorded_at >= NOW() - INTERVAL '90 days'
           AND recorded_at < NOW() - INTERVAL '7 days'
         ORDER BY market_hash_name, source, recorded_at::date, recorded_at DESC
       )`
  );
  console.log(`[Prune] Deleted ${deletedDups ?? 0} duplicate rows (7-90 days, keeping 1/day/item/source)`);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[Prune] Completed in ${elapsed}s`);
}

// Export the AdaptiveCrawler class for use by CSFloat
export { AdaptiveCrawler };
export type { AdaptiveLimiterConfig };
