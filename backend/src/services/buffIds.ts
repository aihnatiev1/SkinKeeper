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
 * NOTE: CSGOTrader removed buff_ids.json — this is a no-op until an alternative source is found.
 * Buff163 links will be omitted; skinport/csfloat/steam links still work.
 */
export async function refreshBuffIds(): Promise<void> {
  // Source no longer available — skip silently
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
