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
  isSlotReady,
  recordSlot429,
  recordSlotSuccess,
  waitForRate,
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

    // Proactive rate limit: wait if this slot sent too recently
    if (this.slotIndex >= 0 && !isSlotReady(this.slotIndex, this.domain)) {
      this.timer = setTimeout(() => this.tick(), 5_000);
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

      // Enforce rate limit before actual request
      if (this.slotIndex >= 0) {
        await waitForRate(this.slotIndex, this.domain);
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

const STEAM_SEARCH_GAP_MS = 3000; // 3s between pages (was 5s, but 10x more pages now)
const STEAM_SEARCH_COUNT = 10;    // items per page (Steam capped at 10, was 100)
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
 *
 * Steam now caps results at 10 per page (was 100). With ~33K items that's
 * ~3,300 pages. To finish in <1h we run parallel streams — one per proxy slot.
 * Each slot crawls its own segment of the item list.
 *
 * 3 slots × 3s gap × ~1,100 pages/slot = ~55 min.
 */
export async function runSteamBatchCrawl(): Promise<void> {
  if (steamBatchRunning) {
    console.log("[Steam Batch] Already running, skipping");
    return;
  }
  steamBatchRunning = true;
  initProxyPool();

  const endLatencyOuter = recordFetchStart("steam");

  try {
    // First, get total_count from a probe request
    const probe = await fetchSteamSearchPage(0, -1);
    if (!probe?.success || !probe.total_count) {
      console.warn("[Steam Batch] Probe failed — possible block");
      return;
    }
    const totalItems = probe.total_count;
    const totalPages = Math.ceil(totalItems / STEAM_SEARCH_COUNT);

    const slotCount = Math.max(1, getSlotCount());

    // Split page range across slots
    const pagesPerSlot = Math.ceil(totalPages / slotCount);

    console.log(`[Steam Batch] ${totalItems} items, ${totalPages} pages, ${slotCount} parallel slots (${pagesPerSlot} pages/slot)`);

    // Save the probe page's results
    let totalSaved = 0;
    if (probe.results) {
      const prices = extractSearchPrices(probe.results);
      if (prices.size > 0) {
        await savePrices(prices, "steam");
        totalSaved += prices.size;
      }
    }

    // Launch parallel crawlers per slot
    const slotResults = await Promise.allSettled(
      Array.from({ length: slotCount }, (_, slotIdx) => {
        const startPage = slotIdx === 0 ? 1 : slotIdx * pagesPerSlot; // slot 0 starts at page 1 (probe was page 0)
        const endPage = Math.min((slotIdx + 1) * pagesPerSlot, totalPages);
        return crawlSteamSegment(slotIdx, startPage, endPage, totalItems);
      })
    );

    for (const result of slotResults) {
      if (result.status === "fulfilled") {
        totalSaved += result.value;
      } else {
        console.error("[Steam Batch] Slot failed:", result.reason);
      }
    }

    recordSuccess("steam", totalSaved);
    console.log(`[Steam Batch] Complete: ${totalSaved} prices from ${totalPages} pages (total: ${totalItems} items)`);
  } catch (err) {
    recordFailure("steam", (err as Error).message || String(err));
    console.error("[Steam Batch] Fatal error:", err);
  } finally {
    endLatencyOuter();
    steamBatchRunning = false;
  }
}

/** Extract prices from Steam search results array */
function extractSearchPrices(results: NonNullable<SteamSearchResult["results"]>): Map<string, number> {
  const prices = new Map<string, number>();
  for (const item of results) {
    if (item.sell_price > 0 && item.hash_name) {
      prices.set(item.hash_name, item.sell_price / 100);
    }
  }
  return prices;
}

/** Crawl a segment of Steam search pages using a specific proxy slot */
async function crawlSteamSegment(
  slotIdx: number,
  startPage: number,
  endPage: number,
  totalItems: number
): Promise<number> {
  const slotName = getSlot(slotIdx)?.name ?? "direct";
  let saved = 0;
  let consecutive429s = 0;

  for (let page = startPage; page < endPage; page++) {
    const start = page * STEAM_SEARCH_COUNT;
    if (start >= totalItems) break;

    // Enforce per-slot rate limit
    await waitForRate(slotIdx, "steamcommunity.com");

    try {
      const result = await fetchSteamSearchPage(start, slotIdx);

      if (!result?.success || !result.results || result.results.length === 0) {
        break;
      }

      const prices = extractSearchPrices(result.results);
      if (prices.size > 0) {
        await savePrices(prices, "steam");
        saved += prices.size;
      }

      recordSlotSuccess(slotIdx, "steamcommunity.com");
      consecutive429s = 0;

      // Rate limit between pages
      await new Promise((r) => setTimeout(r, STEAM_SEARCH_GAP_MS));
    } catch (err: any) {
      const status = err?.response?.status;

      if (status === 429) {
        consecutive429s++;
        const retryAfter = parseInt(err.response?.headers?.["retry-after"] || "0", 10);
        recordSlot429(slotIdx, "steamcommunity.com", retryAfter);
        record429("steam");

        if (consecutive429s >= 5) {
          console.warn(`[Steam Batch:${slotName}] 5 consecutive 429s at page ${page} — pausing ${STEAM_SEARCH_429_PAUSE_MS / 1000}s`);
          await new Promise((r) => setTimeout(r, STEAM_SEARCH_429_PAUSE_MS));
          consecutive429s = 0;
        } else {
          await new Promise((r) => setTimeout(r, 30_000));
        }
        page--; // Retry same page
        continue;
      }

      // Non-429 error — skip page
      console.error(`[Steam Batch:${slotName}] Error on page ${page}:`, err.message || err);
      await new Promise((r) => setTimeout(r, STEAM_SEARCH_GAP_MS));
    }
  }

  console.log(`[Steam Batch:${slotName}] Segment done: ${saved} prices (pages ${startPage}-${endPage - 1})`);
  return saved;
}

/**
 * Start the Steam batch crawler on a schedule (every 2.5 hours).
 * SECONDARY to Hot Loop — this covers the full market for analytics/charts.
 * Parallel streams per proxy slot — ~55 min per full crawl.
 * First run starts after 2 min delay (let hot loop warm up first).
 */
export function startSteamCrawlers(): void {
  initProxyPool();

  const INTERVAL_MS = 150 * 60_000; // 2.5h — low priority background scan

  async function scheduledRun() {
    try {
      await runSteamBatchCrawl();
    } catch (err) {
      console.error("[Steam Batch] Unhandled error:", err);
    }
    steamBatchTimer = setTimeout(scheduledRun, INTERVAL_MS);
  }

  // Start first run after 30s (let other init complete)
  steamBatchTimer = setTimeout(scheduledRun, 2 * 60_000); // 2 min delay — let hot loop start first
  console.log("[Steam Batch] Scheduled: runs every 2.5h (background), first run in 2m");
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

// Ignore prices older than this — stale data causes wrong sell pricing.
// Steam batch crawler runs hourly, so 12h gives plenty of margin.
const PRICE_MAX_AGE = "12 hours";

// Get latest prices for a list of items (reads from current_prices)
export async function getLatestPrices(
  marketHashNames: string[]
): Promise<Map<string, Record<string, number>>> {
  if (marketHashNames.length === 0) return new Map();

  const { rows } = await pool.query(
    `SELECT market_hash_name, source, price_usd
     FROM current_prices
     WHERE market_hash_name = ANY($1)
       AND price_usd > 0
       AND updated_at > NOW() - INTERVAL '${PRICE_MAX_AGE}'`,
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

/**
 * Get a fresh cached steam price if it was updated recently.
 * Returns { priceUsd, ageMs } or null if no fresh steam price exists.
 */
export async function getFreshSteamPrice(
  marketHashName: string,
  maxAgeMs: number
): Promise<{ priceUsd: number; ageMs: number } | null> {
  const { rows } = await pool.query(
    `SELECT price_usd, EXTRACT(EPOCH FROM (NOW() - updated_at)) * 1000 AS age_ms
     FROM current_prices
     WHERE market_hash_name = $1
       AND source = 'steam'
       AND price_usd > 0
       AND updated_at > NOW() - INTERVAL '1 millisecond' * $2`,
    [marketHashName, maxAgeMs]
  );
  if (rows.length === 0) return null;
  return {
    priceUsd: parseFloat(rows[0].price_usd),
    ageMs: parseFloat(rows[0].age_ms),
  };
}

// Get best (highest) price for a list of items — returns Map<name, bestPrice>
export async function getBestPrices(
  marketHashNames: string[]
): Promise<Map<string, number>> {
  if (marketHashNames.length === 0) return new Map();

  const { rows } = await pool.query(
    `SELECT market_hash_name, MAX(price_usd)::float AS best_price
     FROM current_prices
     WHERE market_hash_name = ANY($1)
       AND price_usd > 0
       AND updated_at > NOW() - INTERVAL '${PRICE_MAX_AGE}'
     GROUP BY market_hash_name`,
    [marketHashNames]
  );

  return new Map(rows.map((r: any) => [r.market_hash_name, r.best_price]));
}

// Delete stale prices that haven't been updated recently
export async function purgeStaleCurrentPrices(): Promise<number> {
  const { rowCount } = await pool.query(
    `DELETE FROM current_prices
     WHERE updated_at < NOW() - INTERVAL '${PRICE_MAX_AGE}'`
  );
  const count = rowCount ?? 0;
  if (count > 0) {
    console.log(`[Prices] Purged ${count} stale current_prices rows (older than ${PRICE_MAX_AGE})`);
  }
  return count;
}

/**
 * Fill prices for inventory items that have no price from ANY source.
 * Uses Skinport bulk cache (instant) + Steam individual API as fallback.
 * Called after inventory refresh to ensure new items get prices immediately.
 */
export async function fillMissingPrices(userId: number): Promise<number> {
  const { rows } = await pool.query(
    `SELECT DISTINCT ii.market_hash_name
     FROM inventory_items ii
     JOIN steam_accounts sa ON ii.steam_account_id = sa.id
     WHERE sa.user_id = $1
       AND NOT EXISTS (
         SELECT 1 FROM current_prices cp
         WHERE cp.market_hash_name = ii.market_hash_name
           AND cp.price_usd > 0
       )`,
    [userId]
  );

  if (rows.length === 0) return 0;

  const names = rows.map((r: any) => r.market_hash_name as string);
  console.log(`[PriceFill] ${names.length} items without any price for user ${userId}`);

  let filled = 0;

  // 1. Try Skinport bulk cache first (free, instant)
  try {
    const skinportPrices = await fetchSkinportPrices();
    const batch = new Map<string, number>();
    for (const name of names) {
      const price = skinportPrices.get(name);
      if (price && price > 0) {
        batch.set(name, price);
        filled++;
      }
    }
    if (batch.size > 0) {
      await savePrices(batch, "skinport");
    }
  } catch (err) {
    console.warn("[PriceFill] Skinport bulk failed:", (err as Error).message);
  }

  // 2. Remaining items — try Steam individual API (rate limited, max 5)
  const remaining = names.filter((n) => {
    // Re-check since skinport might have filled some
    return filled === 0 || !skinportCache.has(n);
  }).slice(0, 5);

  for (const name of remaining) {
    try {
      const { getMarketPrice } = await import("./market.js");
      const info = await getMarketPrice(name);
      if (info.lowestPrice !== null) {
        await savePrices(new Map([[name, info.lowestPrice / 100]]), "steam");
        filled++;
      }
      // Small delay to avoid Steam rate limit
      await new Promise((r) => setTimeout(r, 1500));
    } catch {
      break; // Stop on any error to avoid cascading 429s
    }
  }

  console.log(`[PriceFill] Filled ${filled}/${names.length} prices for user ${userId}`);
  return filled;
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

// ─── Hot Steam Price Loop ────────────────────────────────────────────────
//
// PRIMARY price source for inventory items. Continuous loop that never stops.
//
// Architecture:
//   HOT SET  = all unique items in users' inventories (500–5K items)
//   Strategy = fetch oldest-first via /market/priceoverview/ (always reliable)
//   Parallel = one worker per proxy slot, each picks next item from shared queue
//   Speed    = 3s gap per slot → 500 items ≈ 3 min, 5K items ≈ 28 min
//
// The batch crawler (/market/search/render/) is demoted to COLD background —
// used for analytics, charts, non-inventory items.

const HOT_LOOP_GAP_MS = 3_000;       // 3s between requests per slot
const HOT_LOOP_PAUSE_MS = 30_000;    // 30s pause when hot set is empty
const HOT_LOOP_429_PAUSE_MS = 60_000; // 1 min pause per slot on 429
let hotLoopRunning = false;
let hotLoopStopped = false;

interface HotLoopStats {
  running: boolean;
  cycleCount: number;
  totalUpdated: number;
  lastCycleItems: number;
  lastCycleDurationMs: number;
}

const hotStats: HotLoopStats = {
  running: false,
  cycleCount: 0,
  totalUpdated: 0,
  lastCycleItems: 0,
  lastCycleDurationMs: 0,
};

export function getHotLoopStats(): HotLoopStats {
  return { ...hotStats };
}

/**
 * Get the next batch of inventory items sorted by oldest steam price.
 * Returns items that need a refresh — oldest first, NULLs first.
 */
async function getHotSet(): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT ii.market_hash_name,
            cp.updated_at
     FROM (SELECT DISTINCT market_hash_name FROM inventory_items) ii
     LEFT JOIN current_prices cp
       ON cp.market_hash_name = ii.market_hash_name
       AND cp.source = 'steam'
     ORDER BY cp.updated_at ASC NULLS FIRST`
  );
  return rows.map((r: any) => r.market_hash_name);
}

/**
 * Start the hot steam price loop. Runs forever until stopHotSteamLoop().
 * Parallel workers — one per proxy slot — pull from a shared queue.
 */
export function startHotSteamLoop(): void {
  if (hotLoopRunning) return;
  hotLoopRunning = true;
  hotLoopStopped = false;
  hotStats.running = true;

  initProxyPool();
  const slotCount = Math.max(1, getSlotCount());

  console.log(`[HotSteam] Starting continuous loop with ${slotCount} parallel workers`);

  // Main loop — runs in background
  (async () => {
    while (!hotLoopStopped) {
      const cycleStart = Date.now();

      try {
        const hotSet = await getHotSet();

        if (hotSet.length === 0) {
          await new Promise((r) => setTimeout(r, HOT_LOOP_PAUSE_MS));
          continue;
        }

        // Shared queue — workers pull from it concurrently
        let cursor = 0;
        const nextItem = (): string | null => {
          if (cursor >= hotSet.length) return null;
          return hotSet[cursor++];
        };

        let cycleUpdated = 0;

        // Launch parallel workers
        const workers = Array.from({ length: slotCount }, (_, slotIdx) =>
          hotWorker(slotIdx, nextItem).then((n) => { cycleUpdated += n; })
        );

        await Promise.allSettled(workers);

        // Update stats
        hotStats.cycleCount++;
        hotStats.totalUpdated += cycleUpdated;
        hotStats.lastCycleItems = hotSet.length;
        hotStats.lastCycleDurationMs = Date.now() - cycleStart;

        const durationSec = (hotStats.lastCycleDurationMs / 1000).toFixed(0);
        console.log(
          `[HotSteam] Cycle #${hotStats.cycleCount}: ${cycleUpdated}/${hotSet.length} updated in ${durationSec}s`
        );
      } catch (err) {
        console.error("[HotSteam] Cycle error:", err);
        await new Promise((r) => setTimeout(r, HOT_LOOP_PAUSE_MS));
      }
    }

    hotLoopRunning = false;
    hotStats.running = false;
    console.log("[HotSteam] Loop stopped");
  })();
}

/** Single worker — pulls items from shared queue, fetches prices via its slot */
async function hotWorker(
  slotIdx: number,
  nextItem: () => string | null
): Promise<number> {
  const { getMarketPrice } = await import("./market.js");
  const slotName = getSlot(slotIdx)?.name ?? `slot${slotIdx}`;
  let updated = 0;
  let consecutive429s = 0;

  while (!hotLoopStopped) {
    const name = nextItem();
    if (name === null) break; // queue exhausted

    await waitForRate(slotIdx, "steamcommunity.com");

    try {
      const info = await getMarketPrice(name);
      if (info.lowestPrice !== null && info.lowestPrice > 0) {
        await savePrices(new Map([[name, info.lowestPrice / 100]]), "steam");
        updated++;
      }
      recordSlotSuccess(slotIdx, "steamcommunity.com");
      consecutive429s = 0;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        consecutive429s++;
        record429("steam");
        recordSlot429(slotIdx, "steamcommunity.com");
        if (consecutive429s >= 3) {
          console.warn(`[HotSteam:${slotName}] 3× 429 — pausing ${HOT_LOOP_429_PAUSE_MS / 1000}s`);
          await new Promise((r) => setTimeout(r, HOT_LOOP_429_PAUSE_MS));
          consecutive429s = 0;
        } else {
          await new Promise((r) => setTimeout(r, 30_000));
        }
        continue; // retry — nextItem already advanced
      }
      // Non-429 — skip item
    }

    await new Promise((r) => setTimeout(r, HOT_LOOP_GAP_MS));
  }

  return updated;
}

export function stopHotSteamLoop(): void {
  hotLoopStopped = true;
}

// Export the AdaptiveCrawler class for use by CSFloat
export { AdaptiveCrawler };
export type { AdaptiveLimiterConfig };
