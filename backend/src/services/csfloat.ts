import axios from "axios";
import { AdaptiveCrawler, savePrices } from "./prices.js";
import {
  initProxyPool,
  getSlotCount,
  getSlot,
  getSlotConfig,
  isSlotAvailable,
  recordSlot429,
  recordSlotSuccess,
  getAvailableSlot,
  waitForRate,
} from "./proxyPool.js";

interface CSFloatListing {
  id: string;
  price: number; // cents
  item: {
    market_hash_name: string;
    float_value: number;
  };
}

const CSFLOAT_DOMAIN = "csfloat.com";

/**
 * Fetch the lowest listing price for a single item on CSFloat.
 * Routes through proxy pool with auto-rotation on 429.
 */
async function fetchCSFloatItemPrice(
  marketHashName: string,
  slotIndex = -1
): Promise<number | null> {
  const apiKey = process.env.CSFLOAT_API_KEY;
  if (!apiKey) return null;

  // If slot specified, use it; otherwise find available
  const useSlot = slotIndex >= 0
    ? getSlot(slotIndex)
    : getAvailableSlot(CSFLOAT_DOMAIN);
  if (!useSlot) return null;

  const requestConfig: any = {
    params: {
      market_hash_name: marketHashName,
      sort_by: "lowest_price",
      limit: 1,
    },
    headers: { Authorization: apiKey },
    timeout: 15000,
    ...getSlotConfig(useSlot.index),
  };

  try {
    await waitForRate(useSlot.index, CSFLOAT_DOMAIN);
    const { data } = await axios.get<{ data: CSFloatListing[] }>(
      "https://csfloat.com/api/v1/listings",
      requestConfig
    );
    recordSlotSuccess(useSlot.index, CSFLOAT_DOMAIN);

    const listings = data.data;
    if (listings && listings.length > 0) {
      return listings[0].price / 100;
    }
    return null;
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 429) {
      const retryAfter = parseInt(err.response?.headers?.["retry-after"] || "0", 10);
      recordSlot429(useSlot.index, CSFLOAT_DOMAIN, retryAfter);

      // Try next available slot immediately
      if (slotIndex >= 0) {
        // Bound to a slot — let the caller handle
        throw err;
      }
      const nextSlot = getAvailableSlot(CSFLOAT_DOMAIN);
      if (nextSlot && nextSlot.index !== useSlot.index) {
        try {
          const { data } = await axios.get<{ data: CSFloatListing[] }>(
            "https://csfloat.com/api/v1/listings",
            { ...requestConfig, ...getSlotConfig(nextSlot.index) }
          );
          recordSlotSuccess(nextSlot.index, CSFLOAT_DOMAIN);
          const listings = data.data;
          if (listings && listings.length > 0) return listings[0].price / 100;
          return null;
        } catch {
          /* fallback also failed */
        }
      }
    }
    throw err;
  }
}

// ─── Multi-Slot CSFloat Crawlers ─────────────────────────────────────────

const csfloatCrawlers: AdaptiveCrawler[] = [];

export function startCSFloatCrawler(): void {
  const apiKey = process.env.CSFLOAT_API_KEY;
  if (!apiKey) {
    console.warn("[CSFloat] CSFLOAT_API_KEY not set, crawler disabled");
    return;
  }

  initProxyPool();

  // Single slot (direct only) — CSFloat aggressively rate-limits.
  // 1 req / 2 min = ~30 req/hour. With ~160 inventory items → full cycle ~5h.
  // CSGOTrader daily seed covers the gap.
  const crawler = new AdaptiveCrawler(
    {
      name: "CSFloat",
      minIntervalMs: 60_000,       // floor: 1 req / 1 min (never faster)
      maxIntervalMs: 1800_000,     // ceiling: 1 req / 30 min after repeated 429s
      startIntervalMs: 300_000,    // start very slow: 1 req / 5 min
      backoffFactor: 4,            // harsh backoff on 429 (5min → 20min)
      cooldownFactor: 0.98,        // 2% faster per success (very gradual)
      successesBeforeSpeedup: 50,  // need 50 successes before any speedup
      refreshAgeMs: 8 * 3600_000,  // refresh after 8h
    },
    "csfloat",
    (name) => fetchCSFloatItemPrice(name, 0), // slot 0 = direct only
    { slotIndex: 0, domain: CSFLOAT_DOMAIN }
  );

  csfloatCrawlers.push(crawler);
  crawler.start(120_000);

  console.log(`[CSFloat] Started single crawler (direct, 1 req/2min)`);
}

export function stopCSFloatCrawler(): void {
  for (const c of csfloatCrawlers) c.stop();
  csfloatCrawlers.length = 0;
}

// Legacy export for backward compatibility
export function getCSFloatProxyAgent() {
  // Return the agent from slot 1 (primary proxy) for inspect.ts compatibility
  const slot = getSlot(1);
  return slot?.agent ?? null;
}

export async function fetchCSFloatPrices(
  _marketHashNames: string[]
): Promise<Map<string, number>> {
  return new Map();
}
