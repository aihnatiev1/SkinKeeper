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
  const slotCount = getSlotCount();

  for (let i = 0; i < slotCount; i++) {
    const slot = getSlot(i);
    if (!slot) continue;

    const crawler = new AdaptiveCrawler(
      {
        name: "CSFloat",
        minIntervalMs: 45_000,       // 1 req / 45s per slot (was 30s — caused 429s)
        maxIntervalMs: 600_000,      // 10 min max
        startIntervalMs: 75_000,     // start 1 req / 75s (conservative ramp-up)
        backoffFactor: 2.5,          // backoff on 429
        cooldownFactor: 0.95,        // 5% faster per streak (was 7% — too aggressive)
        successesBeforeSpeedup: 25,  // need 25 successes before speedup (was 15)
        refreshAgeMs: 4 * 3600_000,  // refresh after 4h
      },
      "csfloat",
      (name) => fetchCSFloatItemPrice(name, i),
      { slotIndex: i, domain: CSFLOAT_DOMAIN }
    );

    csfloatCrawlers.push(crawler);
    // Stagger: each slot starts 20s apart
    crawler.start(60_000 + i * 20_000);
  }

  console.log(`[CSFloat] Started ${csfloatCrawlers.length} parallel crawlers (via proxy pool)`);
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
