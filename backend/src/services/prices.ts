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
let skinportCache: Map<string, number> = new Map();
let skinportLastFetch = 0;
let skinportBackoffUntil = 0; // pause fetches until this timestamp after 429

const SKINPORT_MAX_RETRIES = 3;
const SKINPORT_CACHE_MS = 5 * 60 * 1000;

export async function fetchSkinportPrices(): Promise<Map<string, number>> {
  const now = Date.now();

  // Respect backoff from previous 429
  if (now < skinportBackoffUntil) {
    console.log(`[Skinport] Rate limited, skipping until ${new Date(skinportBackoffUntil).toISOString()}`);
    if (skinportCache.size > 0) return skinportCache;
    return new Map();
  }

  // Cache for 5 minutes (Skinport caches server-side anyway)
  if (now - skinportLastFetch < SKINPORT_CACHE_MS && skinportCache.size > 0) {
    return skinportCache;
  }

  // Try via proxy rotation — if one IP gets 429, try next
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
        const waitSec = retryAfter > 0 ? retryAfter : (attempt + 1) * 60;
        skinportBackoffUntil = Date.now() + waitSec * 1000;
        console.warn(`[Skinport] ${status} (attempt ${attempt + 1}/${SKINPORT_MAX_RETRIES}), waiting ${waitSec}s`);

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

// ─── Global Steam Rate Limiter ───────────────────────────────────────────
// Per-slot rate limiters — each proxy slot has its own timing
const steamSlotLastRequest = new Map<number, number>();
const STEAM_MIN_GAP_MS = 3500; // 3.5s between requests per slot

export async function steamRateLimit(slotIndex = -1): Promise<void> {
  const key = slotIndex;
  const now = Date.now();
  const last = steamSlotLastRequest.get(key) ?? 0;
  const gap = now - last;
  if (gap < STEAM_MIN_GAP_MS) {
    await new Promise((r) => setTimeout(r, STEAM_MIN_GAP_MS - gap));
  }
  steamSlotLastRequest.set(key, Date.now());
}

// ─── Steam Market ────────────────────────────────────────────────────────

/**
 * Fetch Steam market price for a single item.
 * If slotIndex provided, uses that specific proxy slot.
 * Otherwise, uses direct connection.
 */
export async function fetchSteamMarketPrice(
  marketHashName: string,
  slotIndex = -1
): Promise<number | null> {
  await steamRateLimit(slotIndex);

  const config: any = {
    params: {
      appid: 730,
      currency: 1, // USD
      market_hash_name: marketHashName,
    },
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    },
    timeout: 10000,
  };

  // Apply proxy slot config
  if (slotIndex >= 0) {
    Object.assign(config, getSlotConfig(slotIndex));
  }

  const { data } = await axios.get(
    "https://steamcommunity.com/market/priceoverview/",
    config
  );
  if (data.success && data.lowest_price) {
    return parseFloat(data.lowest_price.replace(/[^0-9.]/g, ""));
  }
  return null;
}

// ─── Multi-Slot Steam Crawlers ───────────────────────────────────────────

const steamCrawlers: AdaptiveCrawler[] = [];

function createSteamCrawlerConfig(): Omit<AdaptiveLimiterConfig, "name"> {
  return {
    minIntervalMs: 10_000,      // fastest: 1 req / 10s (gap-filler, less aggressive)
    maxIntervalMs: 300_000,     // slowest: 1 req / 5min
    startIntervalMs: 15_000,    // start slow: 1 req / 15s
    backoffFactor: 2.0,         // backoff on 429
    cooldownFactor: 0.95,       // 5% faster per streak
    successesBeforeSpeedup: 15, // need 15 clean successes to speed up
    refreshAgeMs: 4 * 3600_000, // refresh after 4h (gap-filler: SteamAnalyst+Skinport are primary)
  };
}

export function startSteamCrawlers(): void {
  initProxyPool();
  const slotCount = getSlotCount();

  for (let i = 0; i < slotCount; i++) {
    const slot = getSlot(i);
    if (!slot) continue;

    const crawler = new AdaptiveCrawler(
      {
        ...createSteamCrawlerConfig(),
        name: `Steam`,
      },
      "steam",
      (name) => fetchSteamMarketPrice(name, i),
      { slotIndex: i, domain: "steamcommunity.com" }
    );

    steamCrawlers.push(crawler);
    // Stagger start: each slot starts 3s apart to avoid burst
    crawler.start(5000 + i * 3000);
  }

  console.log(`[Steam] Started ${steamCrawlers.length} parallel crawlers (one per proxy slot)`);
}

export function stopSteamCrawlers(): void {
  for (const c of steamCrawlers) c.stop();
  steamCrawlers.length = 0;
}

// Legacy exports for backward compatibility
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
