/**
 * Buff163 item ID mapping — market_hash_name → buff163 goods ID.
 * Used to generate direct links: https://buff.163.com/goods/{id}
 *
 * Source: prices.csgotrader.app (same host as price data).
 */

import axios from "axios";

let buffIdMap = new Map<string, number>();
let buffIdsUpdatedAt: Date | null = null;

/**
 * Fetch buff_ids.json and cache in memory.
 * Called from daily seed. ~38K entries, ~400KB gzipped.
 */
export async function refreshBuffIds(): Promise<void> {
  try {
    const { data } = await axios.get(
      "https://prices.csgotrader.app/latest/buff_ids.json",
      {
        timeout: 30_000,
        headers: {
          "User-Agent": "SkinKeeper/1.0",
          "Accept-Encoding": "gzip",
        },
      }
    );

    if (!data || typeof data !== "object") {
      console.error("[BuffIds] Unexpected response format");
      return;
    }

    const newMap = new Map<string, number>();
    for (const [name, id] of Object.entries(data)) {
      if (typeof id === "number" && id > 0) {
        newMap.set(name, id);
      }
    }

    buffIdMap = newMap;
    buffIdsUpdatedAt = new Date();
    console.log(`[BuffIds] Cached ${newMap.size} item IDs`);
  } catch (err: any) {
    console.error(`[BuffIds] Fetch failed: ${err.message || err}`);
  }
}

/**
 * Get the Buff163 goods ID for an item.
 */
export function getBuffId(marketHashName: string): number | null {
  return buffIdMap.get(marketHashName) ?? null;
}

/**
 * Generate marketplace links for an item.
 */
export function getMarketplaceLinks(marketHashName: string): Record<string, string> {
  const encoded = encodeURIComponent(marketHashName);
  const links: Record<string, string> = {};

  const buffId = buffIdMap.get(marketHashName);
  if (buffId) {
    links.buff = `https://buff.163.com/goods/${buffId}`;
  }

  links.skinport = `https://skinport.com/market/csgo?search=${encoded}`;
  links.csfloat = `https://csfloat.com/search?market_hash_name=${encoded}`;
  links.steam = `https://steamcommunity.com/market/listings/730/${encoded}`;

  return links;
}
