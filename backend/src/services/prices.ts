import axios from "axios";
import { pool } from "../db/pool.js";
import { evaluateAlerts } from "./alertEngine.js";
import { steamRequest } from "../utils/SteamClient.js";
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
  getSoonestAvailableTime,
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
 * Run a batch crawl of Steam market items.
 *
 * Steam sorts by popularity — first pages = valuable items, last = cheap junk.
 * Two modes:
 *   - "top" (default): first 500 pages (~5K items, everything >$0.10) — runs every 2.5h
 *   - "full": all pages — runs once daily at 03:00 UTC for completeness
 *
 * Steam caps results at 10 per page. Parallel streams per proxy slot.
 */
const STEAM_BATCH_TOP_PAGES = 500; // ~5K items — the valuable portion of the market

export async function runSteamBatchCrawl(mode: "top" | "full" = "top"): Promise<void> {
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
    const allPages = Math.ceil(totalItems / STEAM_SEARCH_COUNT);
    const totalPages = mode === "full" ? allPages : Math.min(allPages, STEAM_BATCH_TOP_PAGES);

    const slotCount = Math.max(1, getSlotCount());

    // Split page range across slots
    const pagesPerSlot = Math.ceil(totalPages / slotCount);

    console.log(`[Steam Batch] ${mode} mode: ${totalPages}/${allPages} pages, ${slotCount} slots`);

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
    console.log(`[Steam Batch] Complete (${mode}): ${totalSaved} prices from ${totalPages} pages`);
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
 * Start the Steam batch crawler on a schedule.
 * - "top" (500 pages, ~5K valuable items): every 2.5 hours
 * - "full" (all ~3300 pages): once daily via cron at 03:00 UTC
 *
 * SECONDARY to Hot Loop — this covers the broader market for search/analytics.
 */
export function startSteamCrawlers(): void {
  initProxyPool();

  const TOP_INTERVAL_MS = 150 * 60_000; // 2.5h

  async function scheduledTopRun() {
    try {
      await runSteamBatchCrawl("top");
    } catch (err) {
      console.error("[Steam Batch] Unhandled error:", err);
    }
    steamBatchTimer = setTimeout(scheduledTopRun, TOP_INTERVAL_MS);
  }

  steamBatchTimer = setTimeout(scheduledTopRun, 2 * 60_000);
  console.log("[Steam Batch] Scheduled: top-500 every 2.5h, full daily at 03:00 UTC");
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

  // Only steam prices go into price_history (for 7-day charts, alerts, portfolio).
  // All other sources are available via external APIs for historical data.
  // Every source still updates current_prices for live lookups.
  if (source === "steam") {
    const allEntries = [...prices.entries()];
    const changedEntries: [string, number][] = [];

    // Only record prices that actually changed
    const names = allEntries.map(([n]) => n);
    const { rows: currentRows } = await pool.query(
      `SELECT market_hash_name, price_usd::float AS price
       FROM current_prices
       WHERE source = $1 AND market_hash_name = ANY($2::text[])`,
      [source, names]
    );
    const currentMap = new Map<string, number>();
    for (const r of currentRows) {
      currentMap.set(r.market_hash_name, r.price);
    }

    for (const [name, price] of allEntries) {
      const prev = currentMap.get(name);
      if (prev === undefined || prev !== price) {
        changedEntries.push([name, price]);
      }
    }

    if (changedEntries.length > 0) {
      const chunkSize = 500;
      for (let c = 0; c < changedEntries.length; c += chunkSize) {
        const chunk = changedEntries.slice(c, c + chunkSize);
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
    }
  }

  // Update current_prices for ALL sources (live lookups)
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
     JOIN active_steam_accounts sa ON ii.steam_account_id = sa.id
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

// Get local price history (steam only, max 7 days)
export async function getPriceHistory(
  marketHashName: string,
  days: number = 7
): Promise<Array<{ source: string; price_usd: number; recorded_at: string }>> {
  const localDays = Math.min(days, 7);
  const { rows } = await pool.query(
    `SELECT source, price_usd, recorded_at
     FROM price_history
     WHERE market_hash_name = $1
       AND recorded_at > NOW() - INTERVAL '1 day' * $2
       AND price_usd > 0
     ORDER BY recorded_at ASC
     LIMIT 2000`,
    [marketHashName, localDays]
  );
  return rows.map((r) => ({
    source: r.source,
    price_usd: parseFloat(r.price_usd),
    recorded_at: r.recorded_at,
  }));
}

/**
 * Fetch price history from Steam Community Market API.
 * Returns daily data points for up to 1 year+.
 * Requires an authenticated Steam session.
 */
export async function getSteamPriceHistory(
  marketHashName: string,
  days: number,
  session: { sessionId: string; steamLoginSecure: string }
): Promise<Array<{ source: string; price_usd: number; recorded_at: string }>> {
  const { data } = await steamRequest<{
    success: boolean;
    prices: [string, number, string][];
  }>({
    url: `https://steamcommunity.com/market/pricehistory/`,
    params: { appid: 730, market_hash_name: marketHashName },
    cookies: session,
    timeout: 15000,
  });

  if (!data?.success || !Array.isArray(data.prices)) return [];

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  return data.prices
    .map(([dateStr, price]) => {
      // Steam format: "Mar 15 2026 01: +0"
      const date = new Date(dateStr.replace(": +0", ":00 +0000"));
      return { source: "steam", price_usd: price, recorded_at: date.toISOString(), _date: date };
    })
    .filter((p) => p._date >= cutoff)
    .map(({ source, price_usd, recorded_at }) => ({ source, price_usd, recorded_at }));
}

/**
 * Prune old price_history — delete everything older than 7 days.
 *
 * Only steam prices are stored locally (for 7-day charts, alerts, portfolio).
 * Longer history is fetched on-demand from Steam API.
 */
export async function pruneOldPrices(): Promise<void> {
  const start = Date.now();
  const BATCH = 50_000;
  let totalDeleted = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { rowCount } = await pool.query(
      `DELETE FROM price_history
       WHERE id IN (
         SELECT id FROM price_history
         WHERE recorded_at < NOW() - INTERVAL '7 days'
         LIMIT $1
       )`,
      [BATCH]
    );
    const deleted = rowCount ?? 0;
    totalDeleted += deleted;
    if (deleted < BATCH) break;
  }

  if (totalDeleted > 0) console.log(`[Prune] Deleted ${totalDeleted} rows older than 7 days`);
  console.log(`[Prune] Completed in ${((Date.now() - start) / 1000).toFixed(1)}s`);
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

const HOT_LOOP_GAP_MS = 5_000;          // 5s between requests per slot
const HOT_LOOP_PAUSE_MS = 60_000;       // 1 min pause when hot set is empty
const HOT_LOOP_COOLING_MAX_MS = 60_000; // re-check every ≤60s while all slots are cooling
const HOT_STEAM_DOMAIN = "steamcommunity.com";
const HOT_MAX_REQUEUES = 3;             // drop an item after N 429 re-queues within one cycle
const HOT_COLD_TIER_CAP = 300;          // max cold items per cycle — hot (alert-linked) always in full
const HOT_FRESH_AFTER_MIN = 30;         // hot-tier items refetched if older than 30 min
const HOT_COLD_FRESH_AFTER_MIN = 60;    // cold-tier items refetched if older than 60 min
let hotLoopRunning = false;
let hotLoopStopped = false;

/** What the main loop is currently doing — for metrics. */
type HotLoopState = "idle" | "running" | "cooling";
let hotLoopCurrentState: HotLoopState = "idle";

interface HotLoopStats {
  running: boolean;
  state: HotLoopState;
  cycleCount: number;
  totalUpdated: number;
  lastCycleItems: number;
  lastCycleHotItems: number;
  lastCycleColdItems: number;
  lastCycleDurationMs: number;
  soonestSlotAvailableAt: string | null;
}

const hotStats: HotLoopStats = {
  running: false,
  state: "idle",
  cycleCount: 0,
  totalUpdated: 0,
  lastCycleItems: 0,
  lastCycleHotItems: 0,
  lastCycleColdItems: 0,
  lastCycleDurationMs: 0,
  soonestSlotAvailableAt: null,
};

export function getHotLoopStats(): HotLoopStats {
  const now = Date.now();
  const soonest = getSoonestAvailableTime(HOT_STEAM_DOMAIN);
  return {
    ...hotStats,
    state: hotLoopCurrentState,
    soonestSlotAvailableAt: soonest > now ? new Date(soonest).toISOString() : null,
  };
}

interface HotSet {
  items: string[];        // alert-linked items first, then cold, capped
  hotCount: number;       // how many of `items` are alert-linked
  coldCount: number;      // how many are non-alert
}

/**
 * Build the refresh set for one cycle.
 *
 * Tier-split for rate-limit resilience:
 *   HOT  = items with an active price_alert. Always included in full, rerefreshed
 *          after 30 min so alerts see recent prices.
 *   COLD = inventory items without alerts. Capped at HOT_COLD_TIER_CAP per cycle,
 *          and only when older than 60 min. Under 429 pressure these drop first.
 *
 * Items are ordered alert-first, oldest-first, so even a partial cycle keeps
 * alert-backed prices current.
 */
async function getHotSet(): Promise<HotSet> {
  const { rows } = await pool.query(
    `WITH alert_items AS (
        SELECT DISTINCT market_hash_name
        FROM price_alerts
        WHERE is_active = TRUE
          AND (source = 'steam' OR source = 'any')
     ),
     candidates AS (
        SELECT ii.market_hash_name,
               cp.updated_at,
               (ai.market_hash_name IS NOT NULL) AS has_alert
        FROM (SELECT DISTINCT market_hash_name FROM inventory_items) ii
        LEFT JOIN current_prices cp
          ON cp.market_hash_name = ii.market_hash_name AND cp.source = 'steam'
        LEFT JOIN alert_items ai
          ON ai.market_hash_name = ii.market_hash_name
        WHERE cp.updated_at IS NULL
           OR (ai.market_hash_name IS NOT NULL AND cp.updated_at < NOW() - INTERVAL '${HOT_FRESH_AFTER_MIN} minutes')
           OR (ai.market_hash_name IS NULL     AND cp.updated_at < NOW() - INTERVAL '${HOT_COLD_FRESH_AFTER_MIN} minutes')
     ),
     ranked AS (
        SELECT market_hash_name,
               updated_at,
               has_alert,
               ROW_NUMBER() OVER (
                 PARTITION BY has_alert
                 ORDER BY updated_at ASC NULLS FIRST
               ) AS rn
        FROM candidates
     )
     SELECT market_hash_name, has_alert
     FROM ranked
     WHERE has_alert = TRUE OR rn <= $1
     ORDER BY has_alert DESC, updated_at ASC NULLS FIRST`,
    [HOT_COLD_TIER_CAP]
  );

  const items: string[] = [];
  let hotCount = 0;
  let coldCount = 0;
  for (const r of rows) {
    items.push(r.market_hash_name);
    if (r.has_alert) hotCount++;
    else coldCount++;
  }
  return { items, hotCount, coldCount };
}

/**
 * Shared queue used by all HotSteam workers during one cycle.
 * Supports re-queueing items that hit 429, with a per-item cap to prevent loops.
 */
interface HotQueue {
  take(): string | null;
  requeue(name: string): void;
  remaining(): number;
}

function makeHotQueue(initial: string[]): HotQueue {
  let cursor = 0;
  const backlog: string[] = [];
  const requeueCount = new Map<string, number>();
  return {
    take(): string | null {
      if (cursor < initial.length) return initial[cursor++];
      return backlog.shift() ?? null;
    },
    requeue(name: string): void {
      const n = (requeueCount.get(name) ?? 0) + 1;
      if (n > HOT_MAX_REQUEUES) return; // drop: next cycle picks it up oldest-first
      requeueCount.set(name, n);
      backlog.push(name);
    },
    remaining(): number {
      return (initial.length - cursor) + backlog.length;
    },
  };
}

/**
 * Start the hot steam price loop. Runs forever until stopHotSteamLoop().
 * Parallel workers — one per proxy slot — pull from a shared queue.
 *
 * Rate-limit architecture:
 *   - ProxyPool owns all cooldown state (per-slot, per-domain).
 *   - Workers honor the pool: if their slot is in cooldown they exit the cycle.
 *   - Main loop acts as a global circuit breaker: if no slot is available for
 *     steamcommunity.com, it parks until the soonest cooldown expires instead
 *     of spawning workers that would immediately hit the same 429 wall.
 *   - On 429 the failed item is re-queued for a different slot; the pool
 *     decides the actual cooldown using the server's Retry-After header.
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
      // Circuit breaker: park the whole loop if every slot is cooling down.
      const soonest = getSoonestAvailableTime(HOT_STEAM_DOMAIN);
      if (soonest > Date.now()) {
        hotLoopCurrentState = "cooling";
        const waitMs = Math.min(
          HOT_LOOP_COOLING_MAX_MS,
          soonest - Date.now() + Math.floor(Math.random() * 3_000),
        );
        console.warn(
          `[HotSteam] All slots cooling — parking ${Math.ceil(waitMs / 1000)}s`
        );
        await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }

      const cycleStart = Date.now();

      try {
        const hotSet = await getHotSet();

        if (hotSet.items.length === 0) {
          hotLoopCurrentState = "idle";
          await new Promise((r) => setTimeout(r, HOT_LOOP_PAUSE_MS));
          continue;
        }

        hotLoopCurrentState = "running";
        const queue = makeHotQueue(hotSet.items);
        let cycleUpdated = 0;

        const workers = Array.from({ length: slotCount }, (_, slotIdx) =>
          hotWorker(slotIdx, queue).then((n) => { cycleUpdated += n; })
        );

        await Promise.allSettled(workers);

        hotStats.cycleCount++;
        hotStats.totalUpdated += cycleUpdated;
        hotStats.lastCycleItems = hotSet.items.length;
        hotStats.lastCycleHotItems = hotSet.hotCount;
        hotStats.lastCycleColdItems = hotSet.coldCount;
        hotStats.lastCycleDurationMs = Date.now() - cycleStart;

        const durationSec = (hotStats.lastCycleDurationMs / 1000).toFixed(0);
        const skipped = queue.remaining();
        console.log(
          `[HotSteam] Cycle #${hotStats.cycleCount}: ${cycleUpdated}/${hotSet.items.length} updated ` +
          `(hot=${hotSet.hotCount} cold=${hotSet.coldCount}) in ${durationSec}s` +
          (skipped > 0 ? ` — ${skipped} deferred (slots cooling)` : "")
        );
      } catch (err) {
        console.error("[HotSteam] Cycle error:", err);
        await new Promise((r) => setTimeout(r, HOT_LOOP_PAUSE_MS));
      }
    }

    hotLoopRunning = false;
    hotStats.running = false;
    hotLoopCurrentState = "idle";
    console.log("[HotSteam] Loop stopped");
  })();
}

/**
 * Single worker — one per proxy slot. Pulls items from the shared queue,
 * fetches prices, and yields back to the main loop if its slot goes into
 * cooldown. The pool is the single source of truth for backoff timing.
 */
async function hotWorker(
  slotIdx: number,
  queue: HotQueue,
): Promise<number> {
  const { getMarketPrice } = await import("./market.js");
  const slotName = getSlot(slotIdx)?.name ?? `slot${slotIdx}`;
  let updated = 0;

  while (!hotLoopStopped) {
    // If the pool put my slot on cooldown, exit the cycle — don't bang the wall.
    // Main loop's circuit breaker will park until we're welcome back.
    if (!isSlotAvailable(slotIdx, HOT_STEAM_DOMAIN)) {
      console.warn(`[HotSteam:${slotName}] slot cooling — yielding to main loop`);
      return updated;
    }

    const name = queue.take();
    if (name === null) return updated; // queue drained

    await waitForRate(slotIdx, HOT_STEAM_DOMAIN);

    try {
      const info = await getMarketPrice(name, 1, slotIdx);
      if (info.lowestPrice !== null && info.lowestPrice > 0) {
        await savePrices(new Map([[name, info.lowestPrice / 100]]), "steam");
        updated++;
      }
      recordSlotSuccess(slotIdx, HOT_STEAM_DOMAIN);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 429) {
        const retryAfter = parseInt(err?.response?.headers?.["retry-after"] || "0", 10);
        record429("steam");
        recordSlot429(slotIdx, HOT_STEAM_DOMAIN, retryAfter > 0 ? retryAfter : undefined);
        queue.requeue(name); // give another slot a chance
        // Loop head will see the cooldown on next iteration and exit cleanly.
      }
      // Non-429 errors (timeouts, parse failures) — drop this item for the cycle.
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
