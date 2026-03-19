/**
 * Doppler Phase Pricing — per-phase price cache fed from CSGOTrader data.
 *
 * Sources like buff163, csfloat, csmoney provide doppler sub-prices:
 *   { "starting_at": { "price": 50, "doppler": { "Phase 1": 45, "Sapphire": 500 } } }
 *
 * This module caches those and provides lookups by (marketHashName, source, paintIndex).
 */

// Paint index → CSGOTrader phase name
const PAINT_INDEX_TO_PHASE: Record<number, string> = {
  418: "Phase 1",
  419: "Phase 2",
  420: "Phase 3",
  421: "Phase 4",
  415: "Ruby",
  416: "Sapphire",
  417: "Black Pearl",
  568: "Phase 1",  // Gamma Doppler
  569: "Phase 2",
  570: "Phase 3",
  571: "Phase 4",
  618: "Emerald",
};

/**
 * Cache: source → marketHashName → phaseName → price
 * Example: dopplerCache.get("buff")?.get("★ Karambit | Doppler (FN)")?.get("Sapphire") → 1500
 */
const dopplerCache = new Map<string, Map<string, Map<string, number>>>();

/**
 * Feed doppler phase data from a CSGOTrader JSON file into the cache.
 * Called from csgoTrader.ts after downloading each file.
 *
 * @param source — source key (e.g., "buff", "csfloat")
 * @param rawData — full JSON object { itemName: entry, ... }
 * @param dopplerPath — dot-separated path to doppler sub-object (e.g., "starting_at.doppler")
 */
export function feedDopplerData(
  source: string,
  rawData: Record<string, any>,
  dopplerPath: string
): void {
  const sourceMap = new Map<string, Map<string, number>>();
  let count = 0;

  const pathParts = dopplerPath.split(".");

  for (const [name, entry] of Object.entries(rawData)) {
    // Only Doppler items have the sub-object
    let obj = entry;
    for (const p of pathParts) {
      obj = obj?.[p];
    }
    if (!obj || typeof obj !== "object") continue;

    const phases = new Map<string, number>();
    for (const [phase, price] of Object.entries(obj)) {
      if (typeof price === "number" && price > 0) {
        phases.set(phase, price);
      }
    }
    if (phases.size > 0) {
      sourceMap.set(name, phases);
      count++;
    }
  }

  if (count > 0) {
    dopplerCache.set(source, sourceMap);
    console.log(`[Doppler:${source}] Cached ${count} items with phase prices`);
  }
}

/**
 * Get the phase-specific price for a Doppler item.
 *
 * @param marketHashName — e.g., "★ Karambit | Doppler (Factory New)"
 * @param source — price source key
 * @param paintIndex — item's paint_index (e.g., 416 for Sapphire)
 * @returns phase-specific price in USD, or null if not available
 */
export function getDopplerPrice(
  marketHashName: string,
  source: string,
  paintIndex: number
): number | null {
  const phaseName = PAINT_INDEX_TO_PHASE[paintIndex];
  if (!phaseName) return null;

  const sourceMap = dopplerCache.get(source);
  if (!sourceMap) return null;

  const phases = sourceMap.get(marketHashName);
  if (!phases) return null;

  return phases.get(phaseName) ?? null;
}

/**
 * Check if a paint_index corresponds to a known Doppler phase.
 */
export function isDopplerPaintIndex(paintIndex: number): boolean {
  return paintIndex in PAINT_INDEX_TO_PHASE;
}

export { PAINT_INDEX_TO_PHASE };
