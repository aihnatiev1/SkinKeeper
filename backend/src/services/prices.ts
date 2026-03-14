import axios from "axios";
import { pool } from "../db/pool.js";
import { evaluateAlerts } from "./alertEngine.js";
import { recordFetchStart, recordSuccess, recordFailure, record429, updateCrawlerState } from "./priceStats.js";

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

  for (let attempt = 0; attempt < SKINPORT_MAX_RETRIES; attempt++) {
    const endLatency = recordFetchStart("skinport");
    try {
      const { data } = await axios.get<SkinportItem[]>(
        "https://api.skinport.com/v1/items",
        {
          params: { app_id: 730, currency: "USD" },
          headers: { "Accept-Encoding": "br, gzip" },
          timeout: 30000,
        }
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
      if (status === 429) {
        record429("skinport");
        const retryAfter = parseInt(err.response?.headers?.["retry-after"] || "0", 10);
        const waitSec = retryAfter > 0 ? retryAfter : (attempt + 1) * 60; // default: 60s, 120s, 180s
        skinportBackoffUntil = Date.now() + waitSec * 1000;
        console.warn(`[Skinport] 429 rate limited (attempt ${attempt + 1}/${SKINPORT_MAX_RETRIES}), retry-after=${retryAfter}s, waiting ${waitSec}s`);

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
  private pausedUntil = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private source: string;
  private fetchFn: (name: string) => Promise<number | null>;

  constructor(
    config: AdaptiveLimiterConfig,
    source: string,
    fetchFn: (name: string) => Promise<number | null>
  ) {
    this.config = config;
    this.source = source;
    this.fetchFn = fetchFn;
    this.currentInterval = config.startIntervalMs;
  }

  async getNextItem(): Promise<string | null> {
    // Items without any price for this source (all marketable items, including trade-banned)
    const { rows: noPriceRows } = await pool.query(
      `SELECT DISTINCT ii.market_hash_name
       FROM inventory_items ii
       WHERE NOT EXISTS (
           SELECT 1 FROM price_history ph
           WHERE ph.market_hash_name = ii.market_hash_name
             AND ph.source = $1
         )
       LIMIT 1`,
      [this.source]
    );
    if (noPriceRows.length > 0) return noPriceRows[0].market_hash_name;

    // Item with oldest price (older than refreshAgeMs)
    const ageSec = Math.floor(this.config.refreshAgeMs / 1000);
    const { rows: oldestRows } = await pool.query(
      `SELECT ph.market_hash_name, MAX(ph.recorded_at) AS last_at
       FROM price_history ph
       INNER JOIN inventory_items ii ON ii.market_hash_name = ph.market_hash_name
       WHERE ph.source = $1
       GROUP BY ph.market_hash_name
       HAVING MAX(ph.recorded_at) < NOW() - INTERVAL '1 second' * $2
       ORDER BY last_at ASC
       LIMIT 1`,
      [this.source, ageSec]
    );
    if (oldestRows.length > 0) return oldestRows[0].market_hash_name;

    return null;
  }

  private async tick(): Promise<void> {
    // If rate limited, wait
    if (Date.now() < this.pausedUntil) {
      const waitMs = this.pausedUntil - Date.now();
      console.log(`[${this.config.name}] Rate limited, resuming in ${Math.ceil(waitMs / 1000)}s`);
      this.timer = setTimeout(() => this.tick(), waitMs + 1000);
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
        console.log(`[${this.config.name}] ${itemName}: $${price} (${(this.currentInterval / 1000).toFixed(1)}s interval)`);
      } else {
        // Mark as fetched so we don't loop on non-marketable items
        await savePrices(new Map([[itemName, 0]]), this.source);
        console.log(`[${this.config.name}] ${itemName}: no price`);
      }

      recordSuccess(this.source, 1);

      // Success — track and maybe speed up
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
        const retryAfter = err.retryAfter
          ?? parseInt(err.response?.headers?.["retry-after"] || "0", 10);

        // Exponential backoff on interval
        this.currentInterval = Math.min(
          this.config.maxIntervalMs,
          Math.floor(this.currentInterval * this.config.backoffFactor)
        );
        this.consecutiveSuccesses = 0;

        if (retryAfter > 0) {
          this.pausedUntil = Date.now() + retryAfter * 1000;
          console.log(`[${this.config.name}] 429 — pausing ${retryAfter}s, interval now ${(this.currentInterval / 1000).toFixed(1)}s`);
          this.timer = setTimeout(() => this.tick(), retryAfter * 1000 + 1000);
          updateCrawlerState(this.source, this.currentInterval, this.pausedUntil, this.consecutiveSuccesses);
          return;
        }

        console.log(`[${this.config.name}] 429 — interval now ${(this.currentInterval / 1000).toFixed(1)}s`);
      } else {
        recordFailure(this.source, err.message || String(err));
        console.error(`[${this.config.name}] Error:`, err.message || err);
      }
    }

    updateCrawlerState(this.source, this.currentInterval, this.pausedUntil, this.consecutiveSuccesses);
    this.timer = setTimeout(() => this.tick(), this.currentInterval);
  }

  start(delayMs = 5000): void {
    console.log(`[${this.config.name}] Starting crawler (interval: ${(this.currentInterval / 1000).toFixed(1)}s)`);
    this.timer = setTimeout(() => this.tick(), delayMs);
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}

// ─── Steam Market ────────────────────────────────────────────────────────

export async function fetchSteamMarketPrice(
  marketHashName: string
): Promise<number | null> {
  const { data } = await axios.get(
    "https://steamcommunity.com/market/priceoverview/",
    {
      params: {
        appid: 730,
        currency: 1, // USD
        market_hash_name: marketHashName,
      },
      timeout: 10000,
    }
  );
  if (data.success && data.lowest_price) {
    return parseFloat(data.lowest_price.replace(/[^0-9.]/g, ""));
  }
  return null;
}

const steamCrawler = new AdaptiveCrawler(
  {
    name: "Steam",
    minIntervalMs: 3000,        // fastest: 1 req / 3s
    maxIntervalMs: 60_000,      // slowest: 1 req / 60s
    startIntervalMs: 3500,      // start: 1 req / 3.5s
    backoffFactor: 2,           // double interval on 429
    cooldownFactor: 0.85,       // 15% faster after streak
    successesBeforeSpeedup: 5,  // 5 successes to speed up
    refreshAgeMs: 30 * 60_000,  // refresh after 30 min
  },
  "steam",
  fetchSteamMarketPrice
);

export function startSteamCrawler(): void { steamCrawler.start(5000); }
export function stopSteamCrawler(): void { steamCrawler.stop(); }

// ─── Shared Utilities ────────────────────────────────────────────────────

// Store prices in DB for history
export async function savePrices(
  prices: Map<string, number>,
  source: string
): Promise<void> {
  if (prices.size === 0) return;

  // Batch insert in chunks of 500 (PG has param limit)
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

  // Evaluate alerts after saving prices
  try {
    await evaluateAlerts(prices, source);
  } catch (err) {
    console.error("[Alerts] Evaluation failed:", err);
  }
}

// Get latest prices for a list of items
export async function getLatestPrices(
  marketHashNames: string[]
): Promise<Map<string, Record<string, number>>> {
  if (marketHashNames.length === 0) return new Map();

  // Use LATERAL join to do one fast index-only lookup per item×source
  // instead of scanning millions of rows with DISTINCT ON
  // Filter price_usd > 0 inside LATERAL so we get last known real price,
  // not a 0-placeholder that was saved when Steam temporarily returned no price
  const { rows } = await pool.query(
    `WITH names AS (SELECT unnest($1::text[]) AS market_hash_name),
          sources AS (SELECT unnest(ARRAY['skinport','steam','csfloat','dmarket']) AS source)
     SELECT n.market_hash_name, s.source, lp.price_usd
     FROM names n
     CROSS JOIN sources s
     JOIN LATERAL (
       SELECT price_usd FROM price_history ph
       WHERE ph.market_hash_name = n.market_hash_name
         AND ph.source = s.source
         AND ph.price_usd > 0
       ORDER BY ph.recorded_at DESC
       LIMIT 1
     ) lp ON true`,
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

// Export the AdaptiveCrawler class for use by CSFloat
export { AdaptiveCrawler };
export type { AdaptiveLimiterConfig };
