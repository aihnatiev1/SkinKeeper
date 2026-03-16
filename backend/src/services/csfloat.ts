import axios from "axios";
import { HttpsProxyAgent } from "https-proxy-agent";
import { AdaptiveCrawler, savePrices } from "./prices.js";

interface CSFloatListing {
  id: string;
  price: number; // cents
  item: {
    market_hash_name: string;
    float_value: number;
  };
}

// Reusable proxy agents (created once, reused across requests)
let primaryAgent: HttpsProxyAgent<string> | null = null;
let fallbackAgent: HttpsProxyAgent<string> | null = null;

export function getCSFloatProxyAgent(): HttpsProxyAgent<string> | null {
  const proxyUrl = process.env.CSFLOAT_PROXY_URL;
  if (!proxyUrl) return null;
  if (!primaryAgent) primaryAgent = new HttpsProxyAgent(proxyUrl);
  return primaryAgent;
}

function getCSFloatFallbackAgent(): HttpsProxyAgent<string> | null {
  const proxyUrl = process.env.CSFLOAT_PROXY_FALLBACK;
  if (!proxyUrl) return null;
  if (!fallbackAgent) fallbackAgent = new HttpsProxyAgent(proxyUrl);
  return fallbackAgent;
}

/**
 * Fetch the lowest listing price for a single item on CSFloat.
 * Routes through proxy to avoid IP bans.
 */
async function fetchCSFloatItemPrice(
  marketHashName: string
): Promise<number | null> {
  const apiKey = process.env.CSFLOAT_API_KEY;
  if (!apiKey) return null;

  const agent = getCSFloatProxyAgent();
  const requestConfig: any = {
    params: {
      market_hash_name: marketHashName,
      sort_by: "lowest_price",
      limit: 1,
    },
    headers: { Authorization: apiKey },
    timeout: 15000,
  };
  if (agent) {
    requestConfig.httpsAgent = agent;
    requestConfig.proxy = false; // disable axios built-in proxy
  }

  try {
    const { data } = await axios.get<{ data: CSFloatListing[] }>(
      "https://csfloat.com/api/v1/listings",
      requestConfig
    );
    const listings = data.data;
    if (listings && listings.length > 0) {
      return listings[0].price / 100;
    }
    return null;
  } catch (err: any) {
    const status = err?.response?.status;
    // If primary proxy gets 429, try fallback
    if (status === 429) {
      const fb = getCSFloatFallbackAgent();
      if (fb) {
        try {
          const { data } = await axios.get<{ data: CSFloatListing[] }>(
            "https://csfloat.com/api/v1/listings",
            { ...requestConfig, httpsAgent: fb }
          );
          const listings = data.data;
          if (listings && listings.length > 0) return listings[0].price / 100;
          return null;
        } catch { /* fallback also failed */ }
      }
    }
    throw err;
  }
}

// Conservative crawler settings to stay under CSFloat rate limits
const csfloatCrawler = new AdaptiveCrawler(
  {
    name: "CSFloat",
    minIntervalMs: 30_000,
    maxIntervalMs: 3600_000,
    startIntervalMs: 90_000,
    backoffFactor: 3,
    cooldownFactor: 0.95,
    successesBeforeSpeedup: 20,
    refreshAgeMs: 4 * 3600_000,
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
  const proxy = process.env.CSFLOAT_PROXY_URL ? " (via proxy)" : " (direct)";
  console.log(`[CSFloat] Starting crawler${proxy}`);
  csfloatCrawler.start(60_000);
}

export function stopCSFloatCrawler(): void {
  csfloatCrawler.stop();
}

export async function fetchCSFloatPrices(
  _marketHashNames: string[]
): Promise<Map<string, number>> {
  return new Map();
}
