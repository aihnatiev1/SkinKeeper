/**
 * CSGOTrader — free bulk price seed from prices.csgotrader.app
 *
 * Available files (all free, no auth, no rate limit, updated daily):
 *   /latest/steam.json      — Steam median prices (24h/7d/30d/90d)
 *   /latest/buff163.json    — Buff163 ask/bid prices + doppler phases
 *   /latest/skinport.json   — Skinport starting_at prices
 *   /latest/csfloat.json    — CSFloat prices + doppler phases
 *   /latest/bitskins.json   — BitSkins prices
 *   /latest/csmoney.json    — CS.Money prices + doppler phases
 *   /latest/youpin.json     — YouPin prices (bare numbers)
 *   /latest/lisskins.json   — Lisskins prices + doppler phases
 *   /latest/exchange_rates.json — 50+ currency rates (USD-relative)
 *
 * Runs once daily at midnight as a seed, then real-time crawlers refine prices.
 */

import axios from "axios";
import { upsertCurrentPrices, savePrices } from "./prices.js";
import { recordFetchStart, recordSuccess, recordFailure } from "./priceStats.js";
import { feedDopplerData } from "./dopplerPrices.js";

const BASE_URL = "https://prices.csgotrader.app/latest";
const REQUEST_OPTS = {
  timeout: 60_000,
  headers: {
    "User-Agent": "SkinKeeper/1.0",
    "Accept-Encoding": "gzip",
  },
};

// ─── Exchange Rates Cache ────────────────────────────────────────────────

let exchangeRates: Record<string, number> = {};
let exchangeRatesUpdatedAt: Date | null = null;

export function getExchangeRates(): Record<string, number> {
  return exchangeRates;
}

export function getExchangeRatesUpdatedAt(): Date | null {
  return exchangeRatesUpdatedAt;
}

export async function fetchExchangeRates(): Promise<void> {
  try {
    const { data } = await axios.get(`${BASE_URL}/exchange_rates.json`, REQUEST_OPTS);
    if (data && typeof data === "object") {
      exchangeRates = data;
      exchangeRatesUpdatedAt = new Date();
      console.log(`[CSGOTrader] Exchange rates: ${Object.keys(data).length} currencies`);
    }
  } catch (err: any) {
    console.error(`[CSGOTrader] Exchange rates fetch failed: ${err.message || err}`);
  }
}

// ─── Source Definitions ──────────────────────────────────────────────────

interface SourceDef {
  /** URL path after BASE_URL */
  file: string;
  /** Source key stored in current_prices.source */
  source: string;
  /** Extract USD price from a single entry */
  extract: (entry: any) => number;
  /** Whether this source has doppler sub-prices to feed into dopplerPrices cache */
  hasDoppler?: boolean;
  /** Path to doppler object in entry (e.g., "starting_at.doppler" for buff163) */
  dopplerPath?: string;
}

const SOURCES: SourceDef[] = [
  {
    file: "steam.json",
    source: "csgotrader",
    extract: (e) => e?.last_7d || e?.last_24h || e?.last_30d || 0,
  },
  {
    file: "buff163.json",
    source: "buff",
    extract: (e) => e?.starting_at?.price || 0,
    hasDoppler: true,
    dopplerPath: "starting_at.doppler",
  },
  {
    file: "buff163.json",
    source: "buff_bid",
    extract: (e) => e?.highest_order?.price || 0,
  },
  {
    file: "skinport.json",
    source: "skinport",
    extract: (e) => e?.starting_at || e?.suggested_price || 0,
  },
  {
    file: "csfloat.json",
    source: "csfloat",
    extract: (e) => e?.price || 0,
    hasDoppler: true,
    dopplerPath: "doppler",
  },
  {
    file: "bitskins.json",
    source: "bitskins",
    extract: (e) => e?.price || 0,
  },
  {
    file: "csmoney.json",
    source: "csmoney",
    extract: (e) => e?.price || 0,
    hasDoppler: true,
    dopplerPath: "doppler",
  },
  {
    file: "youpin.json",
    source: "youpin",
    extract: (e) => typeof e === "number" ? e : 0,
  },
  {
    file: "lisskins.json",
    source: "lisskins",
    extract: (e) => e?.price || 0,
    hasDoppler: true,
    dopplerPath: "doppler",
  },
];

// ─── File Download Cache ─────────────────────────────────────────────────
// Multiple SourceDefs can reference the same file (e.g., buff163.json for ask + bid).
// Download each file only once per seed run.

async function downloadFile(file: string): Promise<Record<string, any> | null> {
  try {
    const { data } = await axios.get(`${BASE_URL}/${file}`, REQUEST_OPTS);
    if (!data || typeof data !== "object") return null;
    return data;
  } catch (err: any) {
    const msg = err?.response?.status
      ? `HTTP ${err.response.status}: ${err.response.statusText}`
      : err.message || String(err);
    console.error(`[CSGOTrader] Download ${file} failed: ${msg}`);
    return null;
  }
}

// ─── Process Source from Pre-downloaded Data ──────────────────────────────

function extractDopplerObject(entry: any, path: string): Record<string, number> | null {
  const parts = path.split(".");
  let obj = entry;
  for (const p of parts) {
    obj = obj?.[p];
  }
  if (!obj || typeof obj !== "object") return null;
  // Convert to Record<string, number> — phase name → price
  const result: Record<string, number> = {};
  for (const [phase, price] of Object.entries(obj)) {
    if (typeof price === "number" && price > 0) {
      result[phase] = price;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

async function processSource(
  def: SourceDef,
  data: Record<string, any>
): Promise<number> {
  const endLatency = recordFetchStart(def.source);
  try {
    const prices = new Map<string, number>();

    for (const [name, entry] of Object.entries(data)) {
      const price = def.extract(entry);
      if (price > 0) {
        prices.set(name, price);
      }
    }

    await upsertCurrentPrices(prices, def.source);

    // Feed doppler data into cache
    if (def.hasDoppler && def.dopplerPath) {
      feedDopplerData(def.source, data, def.dopplerPath);
    }

    endLatency();
    recordSuccess(def.source, prices.size);
    console.log(`[CSGOTrader:${def.source}] ${prices.size}/${Object.keys(data).length} prices`);
    return prices.size;
  } catch (err: any) {
    endLatency();
    const msg = err.message || String(err);
    recordFailure(def.source, msg);
    console.error(`[CSGOTrader:${def.source}] Process failed: ${msg}`);
    return 0;
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

/**
 * Fetch Steam prices only (legacy — used by existing init/cron).
 * Writes to price_history once per run (daily seed).
 */
export async function fetchCSGOTraderPrices(): Promise<number> {
  const steamDef = SOURCES[0]; // steam.json → "csgotrader"
  const endLatency = recordFetchStart("csgotrader");

  try {
    const data = await downloadFile(steamDef.file);
    endLatency();

    if (!data) {
      recordFailure("csgotrader", "Download failed or empty");
      return 0;
    }

    const prices = new Map<string, number>();
    for (const [name, entry] of Object.entries(data)) {
      const price = steamDef.extract(entry);
      if (price > 0) prices.set(name, price);
    }

    await upsertCurrentPrices(prices, "csgotrader");
    await savePrices(prices, "csgotrader");

    recordSuccess("csgotrader", prices.size);
    console.log(`[CSGOTrader] Saved ${prices.size}/${Object.keys(data).length} prices`);
    return prices.size;
  } catch (err: any) {
    endLatency();
    const msg = err?.response?.status
      ? `HTTP ${err.response.status}: ${err.response.statusText}`
      : err.message || String(err);
    recordFailure("csgotrader", msg);
    console.error(`[CSGOTrader] Fetch failed: ${msg}`);
    return 0;
  }
}

/**
 * Daily seed: fetch ALL sources from CSGOTrader.
 * Downloads each file once (shared between sources that use same file).
 * Writes to current_prices only (no price_history flooding).
 */
export async function runCSGOTraderDailySeed(): Promise<void> {
  console.log("[CSGOTrader Seed] Starting daily seed...");
  const start = Date.now();

  // Phase 0: Exchange rates (tiny file, always first)
  await fetchExchangeRates();

  // Group sources by file to avoid duplicate downloads
  const fileGroups = new Map<string, SourceDef[]>();
  for (const def of SOURCES) {
    const group = fileGroups.get(def.file) || [];
    group.push(def);
    fileGroups.set(def.file, group);
  }

  let totalItems = 0;

  for (const [file, defs] of fileGroups) {
    try {
      const data = await downloadFile(file);
      if (!data) continue;

      for (const def of defs) {
        try {
          const count = await processSource(def, data);
          totalItems += count;
        } catch (err) {
          console.error(`[CSGOTrader Seed] ${def.source} failed:`, err);
        }
      }
    } catch (err) {
      console.error(`[CSGOTrader Seed] Download ${file} failed:`, err);
    }

    // Small delay between file downloads to be polite
    await new Promise((r) => setTimeout(r, 2000));
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`[CSGOTrader Seed] Done: ${totalItems} total prices from ${SOURCES.length} sources in ${elapsed}s`);
}
