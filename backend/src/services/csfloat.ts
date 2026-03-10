import axios from "axios";
import { AdaptiveCrawler, savePrices } from "./prices.js";

interface CSFloatListing {
  id: string;
  price: number; // cents
  item: {
    market_hash_name: string;
    float_value: number;
  };
}

/**
 * Fetch the lowest listing price for a single item on CSFloat.
 * Returns price in USD (cents / 100) or null if unavailable.
 */
async function fetchCSFloatItemPrice(
  marketHashName: string
): Promise<number | null> {
  const apiKey = process.env.CSFLOAT_API_KEY;
  if (!apiKey) return null;

  const { data } = await axios.get<{ data: CSFloatListing[] }>(
    "https://csfloat.com/api/v1/listings",
    {
      params: {
        market_hash_name: marketHashName,
        sort_by: "lowest_price",
        limit: 1,
      },
      headers: { Authorization: apiKey },
      timeout: 10000,
    }
  );

  const listings = data.data;
  if (listings && listings.length > 0) {
    return listings[0].price / 100;
  }
  return null;
}

// CSFloat has strict rate limits — start slow, adapt
const csfloatCrawler = new AdaptiveCrawler(
  {
    name: "CSFloat",
    minIntervalMs: 3000,         // fastest: 1 req / 3s
    maxIntervalMs: 120_000,      // slowest: 1 req / 2min
    startIntervalMs: 5000,       // start: 1 req / 5s
    backoffFactor: 2.5,          // aggressive backoff
    cooldownFactor: 0.9,         // 10% faster after streak
    successesBeforeSpeedup: 8,   // 8 successes to speed up
    refreshAgeMs: 60 * 60_000,   // refresh after 1 hour
  },
  "csfloat",
  fetchCSFloatItemPrice
);

export function startCSFloatCrawler(): void {
  const apiKey = process.env.CSFLOAT_API_KEY;
  if (!apiKey) {
    console.warn("[CSFloat] CSFLOAT_API_KEY not set, crawler disabled");
    return;
  }
  csfloatCrawler.start(8000);
}

export function stopCSFloatCrawler(): void {
  csfloatCrawler.stop();
}

// Keep for backward compat (no longer used in cron)
export async function fetchCSFloatPrices(
  _marketHashNames: string[]
): Promise<Map<string, number>> {
  return new Map();
}
