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

// CSFloat has strict rate limits — very conservative settings to avoid IP bans.
// Free tier: ~1000 req/day ≈ 1 req per 90s average
const csfloatCrawler = new AdaptiveCrawler(
  {
    name: "CSFloat",
    minIntervalMs: 30_000,       // fastest: 1 req / 30s
    maxIntervalMs: 3600_000,     // slowest: 1 req / 1 hour
    startIntervalMs: 90_000,     // start: 1 req / 90s (~960/day budget)
    backoffFactor: 3,            // triple interval on 429
    cooldownFactor: 0.95,        // only 5% faster after streak
    successesBeforeSpeedup: 20,  // need 20 clean successes to speed up
    refreshAgeMs: 4 * 3600_000,  // refresh after 4 hours
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
  // Delay first request by 60s to let other crawlers settle
  csfloatCrawler.start(60_000);
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
