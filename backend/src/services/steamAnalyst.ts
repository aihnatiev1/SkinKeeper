/**
 * SteamAnalyst — bulk price source for all CS2 items.
 *
 * GET https://api.steamanalyst.com/v2/{key}
 * Returns 100K+ items in a single call.
 * Free tier: 100 req/day → cron every 15 min (96/day).
 */

import axios from "axios";
import { upsertCurrentPrices, savePrices } from "./prices.js";
import { recordFetchStart, recordSuccess, recordFailure } from "./priceStats.js";

interface SteamAnalystItem {
  market_name: string;
  current_price?: number;
  avg_price_7_days?: string;
  avg_price_7_days_raw?: number;
  avg_price_30_days_raw?: number;
  safe_price_raw?: number;
  sold_last_24h?: number;
  ongoing_price_manipulation?: boolean;
}

/** Timestamp of last history write per item to avoid flooding price_history */
let lastHistoryWrite = 0;
const HISTORY_INTERVAL_MS = 60 * 60_000; // 1 hour — write to price_history max once per hour

/**
 * Fetch all CS2 prices from SteamAnalyst and upsert into current_prices.
 * Also writes to price_history (sampled: max once per hour).
 */
export async function fetchSteamAnalystPrices(): Promise<number> {
  const apiKey = process.env.STEAM_ANALYST_KEY;
  if (!apiKey) {
    console.warn("[SteamAnalyst] STEAM_ANALYST_KEY not set, skipping");
    return 0;
  }

  const endLatency = recordFetchStart("steam_analyst");

  try {
    const { data } = await axios.get<SteamAnalystItem[]>(
      `https://api.steamanalyst.com/v2/${apiKey}`,
      {
        timeout: 60_000, // large response, allow 60s
        headers: {
          "User-Agent": "SkinKeeper/1.0",
          "Accept-Encoding": "gzip",
        },
      }
    );
    endLatency();

    if (!Array.isArray(data)) {
      recordFailure("steam_analyst", "Unexpected response format");
      console.error("[SteamAnalyst] Response is not an array");
      return 0;
    }

    const prices = new Map<string, number>();

    for (const item of data) {
      if (!item.market_name) continue;
      if (item.ongoing_price_manipulation) continue; // skip manipulated items

      // Prefer 7-day average (most stable), fall back to current_price
      const price = item.avg_price_7_days_raw ?? item.current_price ?? 0;
      if (price > 0) {
        prices.set(item.market_name, price);
      }
    }

    // Always update current_prices (fast table for API reads)
    await upsertCurrentPrices(prices, "steam_analyst");

    // Write to price_history max once per hour (for charts)
    const now = Date.now();
    if (now - lastHistoryWrite >= HISTORY_INTERVAL_MS) {
      lastHistoryWrite = now;
      await savePrices(prices, "steam_analyst");
    }

    recordSuccess("steam_analyst", prices.size);
    console.log(`[SteamAnalyst] Saved ${prices.size}/${data.length} prices`);
    return prices.size;
  } catch (err: any) {
    endLatency();
    const status = err?.response?.status;
    const msg = status
      ? `HTTP ${status}: ${err.response?.statusText}`
      : err.message || String(err);
    recordFailure("steam_analyst", msg);
    console.error(`[SteamAnalyst] Fetch failed: ${msg}`);
    return 0;
  }
}
