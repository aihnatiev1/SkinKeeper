/**
 * Steam Market Histogram — on-demand real-time pricing via itemordershistogram.
 *
 * The histogram endpoint returns exact lowest_sell_order and highest_buy_order
 * in the requested currency, making it ideal for sell-time price resolution.
 *
 * Requires item_nameid per item — cached in DB + seeded from GitHub at startup.
 */

import { pool } from "../db/pool.js";
import { TTLCache } from "../utils/TTLCache.js";
import { registerCache } from "../utils/cacheRegistry.js";
import { proxyRequest, getSlotCount, waitForRate } from "./proxyPool.js";
import { getExchangeRate } from "./currency.js";
import { savePrices } from "./prices.js";

// ─── Types ──────────────────────────────────────────────────────────────

export interface HistogramResult {
  lowestSellOrder: number;  // cents in requested currency
  highestBuyOrder: number;  // cents in requested currency
}

export interface OnDemandPrice {
  lowestSellOrder: number;
  highestBuyOrder: number;
  currencyId: number;
  fresh: boolean; // true = just fetched via histogram, false = from DB cache
}

interface HistogramApiResponse {
  success: number;
  lowest_sell_order?: string; // e.g. "1234" (cents)
  highest_buy_order?: string;
  sell_order_count?: string;
  buy_order_count?: string;
}

// ─── item_nameid cache ──────────────────────────────────────────────────

const nameIdCache = new TTLCache<string, number>(24 * 3600_000, 15_000);
registerCache("itemNameId", nameIdCache as unknown as TTLCache<unknown, unknown>);

const STEAM_DOMAIN = "steamcommunity.com";

/**
 * Resolve item_nameid for a market_hash_name.
 * Checks: in-memory cache → DB → scrape from Steam listing page.
 */
export async function fetchItemNameId(marketHashName: string): Promise<number | null> {
  const cached = nameIdCache.get(marketHashName);
  if (cached !== undefined) return cached;

  // DB lookup
  const { rows } = await pool.query(
    `SELECT item_nameid FROM steam_item_nameids WHERE market_hash_name = $1`,
    [marketHashName]
  );
  if (rows.length > 0) {
    nameIdCache.set(marketHashName, rows[0].item_nameid);
    return rows[0].item_nameid;
  }

  // Scrape from Steam listing page
  try {
    const encoded = encodeURIComponent(marketHashName);
    const { data: html } = await proxyRequest<string>(
      {
        url: `https://steamcommunity.com/market/listings/730/${encoded}`,
        timeout: 15_000,
        responseType: "text",
      },
      STEAM_DOMAIN
    );

    // Parse: ItemActivityTicker.Start( 176304090 );
    const match = typeof html === "string"
      ? html.match(/ItemActivityTicker\.Start\(\s*(\d+)\s*\)/)
      : null;

    if (!match) return null;

    const id = parseInt(match[1], 10);
    if (isNaN(id)) return null;

    // Save to DB + cache
    await pool.query(
      `INSERT INTO steam_item_nameids (market_hash_name, item_nameid)
       VALUES ($1, $2) ON CONFLICT (market_hash_name) DO NOTHING`,
      [marketHashName, id]
    );
    nameIdCache.set(marketHashName, id);
    return id;
  } catch (err) {
    console.warn(`[Histogram] Failed to scrape item_nameid for "${marketHashName}":`, (err as Error).message);
    return null;
  }
}

// ─── Histogram price fetch ──────────────────────────────────────────────

/**
 * Fetch real-time lowest sell / highest buy from Steam histogram endpoint.
 * Returns prices in the requested currency's cents.
 * Also saves the price to current_prices (as USD) for other consumers.
 */
export async function fetchHistogramPrice(
  marketHashName: string,
  currency: number = 1
): Promise<HistogramResult | null> {
  const nameId = await fetchItemNameId(marketHashName);
  if (!nameId) return null;

  try {
    const { data } = await proxyRequest<HistogramApiResponse>(
      {
        url: "https://steamcommunity.com/market/itemordershistogram",
        params: {
          country: "US",
          language: "english",
          currency,
          item_nameid: nameId,
          two_factor: 0,
        },
        timeout: 10_000,
      },
      STEAM_DOMAIN
    );

    if (!data || data.success !== 1) return null;

    const lowestSellOrder = parseInt(data.lowest_sell_order ?? "0", 10);
    const highestBuyOrder = parseInt(data.highest_buy_order ?? "0", 10);

    if (lowestSellOrder <= 0 && highestBuyOrder <= 0) return null;

    // Save to current_prices as USD for other consumers (hot loop, portfolio, etc.)
    if (lowestSellOrder > 0) {
      let usdDollars: number;
      if (currency === 1) {
        usdDollars = lowestSellOrder / 100;
      } else {
        const rate = await getExchangeRate(currency);
        usdDollars = rate ? lowestSellOrder / 100 / rate : 0;
      }
      if (usdDollars > 0) {
        await savePrices(new Map([[marketHashName, usdDollars]]), "steam");
      }
    }

    return { lowestSellOrder, highestBuyOrder };
  } catch (err) {
    console.warn(`[Histogram] Fetch failed for "${marketHashName}":`, (err as Error).message);
    return null;
  }
}

// ─── Bulk on-demand refresh ─────────────────────────────────────────────

const FRESH_THRESHOLD_MS = 5 * 60_000; // 5 minutes

/**
 * Refresh prices on demand for a list of items.
 * Fresh items (steam price < 5 min old) are returned from DB.
 * Stale items are fetched via histogram in parallel across proxy slots.
 */
export async function refreshPricesOnDemand(
  names: string[],
  walletCurrencyId: number
): Promise<Map<string, OnDemandPrice>> {
  const result = new Map<string, OnDemandPrice>();
  if (names.length === 0) return result;

  // 1. Check which items are fresh in current_prices
  const { rows: freshRows } = await pool.query(
    `SELECT market_hash_name, price_usd::float AS price
     FROM current_prices
     WHERE source = 'steam'
       AND market_hash_name = ANY($1::text[])
       AND price_usd > 0
       AND updated_at > NOW() - INTERVAL '5 minutes'`,
    [names]
  );

  const freshSet = new Set<string>();
  for (const row of freshRows) {
    freshSet.add(row.market_hash_name);
    // Convert USD to wallet currency for response
    let cents: number;
    if (walletCurrencyId === 1) {
      cents = Math.round(row.price * 100);
    } else {
      const rate = await getExchangeRate(walletCurrencyId);
      cents = rate ? Math.round(row.price * 100 * rate) : 0;
    }
    if (cents > 0) {
      result.set(row.market_hash_name, {
        lowestSellOrder: cents,
        highestBuyOrder: 0, // not available from DB cache
        currencyId: walletCurrencyId,
        fresh: false,
      });
    }
  }

  // 2. Fetch stale items via histogram, parallel across slots
  const staleNames = names.filter((n) => !freshSet.has(n));
  if (staleNames.length === 0) return result;

  const slotCount = Math.max(1, getSlotCount());
  const concurrency = slotCount; // one in-flight per slot

  // Process with bounded concurrency
  let cursor = 0;
  const fetchOne = async (): Promise<void> => {
    while (cursor < staleNames.length) {
      const idx = cursor++;
      const name = staleNames[idx];
      const slotIndex = idx % slotCount;
      await waitForRate(slotIndex, STEAM_DOMAIN);

      const histo = await fetchHistogramPrice(name, walletCurrencyId);
      if (histo && (histo.lowestSellOrder > 0 || histo.highestBuyOrder > 0)) {
        result.set(name, {
          lowestSellOrder: histo.lowestSellOrder,
          highestBuyOrder: histo.highestBuyOrder,
          currencyId: walletCurrencyId,
          fresh: true,
        });
      }
    }
  };

  await Promise.allSettled(
    Array.from({ length: concurrency }, () => fetchOne())
  );

  return result;
}

// ─── Seed item_nameids from GitHub ──────────────────────────────────────

const SEED_URL = "https://raw.githubusercontent.com/somespecialone/steam-item-name-ids/main/data/730.json";

/**
 * Seed steam_item_nameids table from GitHub JSON dump.
 * Non-blocking, non-fatal — called on startup.
 */
export async function seedItemNameIds(): Promise<void> {
  // Skip if already seeded (check count)
  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM steam_item_nameids`
  );
  if (countRows[0].cnt > 1000) {
    console.log(`[Histogram] item_nameids already seeded (${countRows[0].cnt} items)`);
    return;
  }

  console.log("[Histogram] Seeding item_nameids from GitHub...");
  const { default: axios } = await import("axios");
  const { data } = await axios.get<Record<string, number>>(SEED_URL, { timeout: 30_000 });

  const entries = Object.entries(data);
  if (entries.length === 0) {
    console.warn("[Histogram] Empty seed data");
    return;
  }

  // Batch insert in chunks of 500
  const chunkSize = 500;
  let inserted = 0;
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize);
    const values: string[] = [];
    const params: (string | number)[] = [];
    let p = 1;

    for (const [name, id] of chunk) {
      values.push(`($${p}, $${p + 1})`);
      params.push(name, id);
      p += 2;
    }

    const { rowCount } = await pool.query(
      `INSERT INTO steam_item_nameids (market_hash_name, item_nameid)
       VALUES ${values.join(",")}
       ON CONFLICT (market_hash_name) DO NOTHING`,
      params
    );
    inserted += rowCount ?? 0;
  }

  console.log(`[Histogram] Seeded ${inserted} item_nameids (${entries.length} total in source)`);
}
