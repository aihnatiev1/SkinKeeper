/**
 * Fade Percentage Database — maps (knife type, paint_seed) → fade blue %.
 *
 * Source: CSGOTrader extension's bluepercent.json
 * Static data that rarely changes — fetched on startup, refreshed monthly.
 */

import axios from "axios";

const BLUEPERCENT_URL =
  "https://raw.githubusercontent.com/niclas-niclas/csgo-trader-extension/master/extension/datasources/bluepercent.json";

// Alternative URLs to try if the primary fails
const FALLBACK_URLS = [
  "https://raw.githubusercontent.com/niclas-niclas/csgo-trader-extension/refs/heads/master/extension/datasources/bluepercent.json",
  "https://raw.githubusercontent.com/niclas-niclas/csgo-trader-extension/main/extension/datasources/bluepercent.json",
  "https://raw.githubusercontent.com/gergelyszabo94/csgo-trader-extension/master/extension/datasources/bluepercent.json",
];

/**
 * Cache: knifeType → paintSeed → bluePercent
 * knifeType is lowercase normalized (e.g., "bayonet", "butterfly", "m9")
 */
let fadeCache = new Map<string, Map<number, number>>();
let fadeCacheUpdatedAt: Date | null = null;

// Map market_hash_name substrings to knife type keys in the JSON
const KNIFE_TYPE_MAP: Record<string, string> = {
  "Bayonet": "bayonet",
  "Butterfly Knife": "butterfly",
  "Bowie Knife": "bowie",
  "Classic Knife": "classic",
  "Falchion Knife": "falchion",
  "Flip Knife": "flip",
  "Gut Knife": "gut",
  "Huntsman Knife": "huntsman",
  "Karambit": "karambit",
  "Kukri Knife": "kukri",
  "M9 Bayonet": "m9",
  "Navaja Knife": "navaja",
  "Nomad Knife": "nomad",
  "Paracord Knife": "paracord",
  "Skeleton Knife": "skeleton",
  "Stiletto Knife": "stiletto",
  "Survival Knife": "survival",
  "Talon Knife": "talon",
  "Ursus Knife": "ursus",
};

/**
 * Fetch bluepercent.json and parse into memory cache.
 */
export async function initFadeData(): Promise<void> {
  const urls = [BLUEPERCENT_URL, ...FALLBACK_URLS];

  for (const url of urls) {
    try {
      const { data } = await axios.get(url, {
        timeout: 30_000,
        headers: { "User-Agent": "SkinKeeper/1.0" },
      });

      if (!data || typeof data !== "object") continue;

      const newCache = new Map<string, Map<number, number>>();

      for (const [knifeType, seeds] of Object.entries(data)) {
        if (!seeds || typeof seeds !== "object") continue;
        const seedMap = new Map<number, number>();

        for (const [seedStr, value] of Object.entries(seeds as Record<string, any>)) {
          const seed = parseInt(seedStr);
          // value can be a number or { playside: N, backside: N }
          let percent: number;
          if (typeof value === "number") {
            percent = value;
          } else if (typeof value === "object" && value?.playside != null) {
            percent = value.playside;
          } else {
            continue;
          }
          if (!isNaN(seed) && percent > 0) {
            seedMap.set(seed, percent);
          }
        }

        if (seedMap.size > 0) {
          newCache.set(knifeType.toLowerCase(), seedMap);
        }
      }

      fadeCache = newCache;
      fadeCacheUpdatedAt = new Date();
      console.log(`[FadeData] Loaded ${newCache.size} knife types from ${url}`);
      return; // Success — stop trying URLs
    } catch (err: any) {
      console.warn(`[FadeData] Failed to fetch ${url}: ${err.message}`);
    }
  }

  console.error("[FadeData] All URLs failed — fade data not available");
}

/**
 * Get fade blue percentage for a Fade knife.
 *
 * @param marketHashName — e.g., "★ Karambit | Fade (Factory New)"
 * @param paintSeed — the item's paint_seed
 * @returns blue percentage (0-100), or null if not available
 */
export function getFadePercentage(
  marketHashName: string,
  paintSeed: number
): number | null {
  if (!marketHashName.includes("Fade")) return null;

  // Find knife type from market_hash_name
  for (const [nameSubstr, cacheKey] of Object.entries(KNIFE_TYPE_MAP)) {
    if (marketHashName.includes(nameSubstr)) {
      const seedMap = fadeCache.get(cacheKey);
      if (!seedMap) return null;
      return seedMap.get(paintSeed) ?? null;
    }
  }

  return null;
}

export function isFadeDataLoaded(): boolean {
  return fadeCache.size > 0;
}
