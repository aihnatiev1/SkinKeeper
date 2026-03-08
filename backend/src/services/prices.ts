import axios from "axios";
import { pool } from "../db/pool.js";

interface SkinportItem {
  market_hash_name: string;
  suggested_price: number | null;
  min_price: number | null;
  median_price: number | null;
  mean_price: number | null;
}

// Skinport: free, no auth, 8 requests per 5 min
let skinportCache: Map<string, number> = new Map();
let skinportLastFetch = 0;

export async function fetchSkinportPrices(): Promise<Map<string, number>> {
  const now = Date.now();
  // Cache for 5 minutes (Skinport caches server-side anyway)
  if (now - skinportLastFetch < 5 * 60 * 1000 && skinportCache.size > 0) {
    return skinportCache;
  }

  const { data } = await axios.get<SkinportItem[]>(
    "https://api.skinport.com/v1/items",
    {
      params: { app_id: 730, currency: "USD" },
      headers: { "Accept-Encoding": "br, gzip" },
      timeout: 30000,
    }
  );

  const prices = new Map<string, number>();
  for (const item of data) {
    const price = item.suggested_price ?? item.min_price ?? item.median_price;
    if (price !== null) {
      prices.set(item.market_hash_name, price);
    }
  }

  skinportCache = prices;
  skinportLastFetch = now;
  return prices;
}

// Steam Market price (limited, one item at a time)
export async function fetchSteamMarketPrice(
  marketHashName: string
): Promise<number | null> {
  try {
    const { data } = await axios.get(
      "https://steamcommunity.com/market/priceoverview/",
      {
        params: {
          appid: 730,
          currency: 1, // USD
          market_hash_name: marketHashName,
        },
        timeout: 10000,
      }
    );
    if (data.success && data.lowest_price) {
      // Parse "$12.34" -> 12.34
      return parseFloat(data.lowest_price.replace(/[^0-9.]/g, ""));
    }
    return null;
  } catch {
    return null;
  }
}

// Store prices in DB for history
export async function savePrices(
  prices: Map<string, number>,
  source: string
): Promise<void> {
  if (prices.size === 0) return;

  // Batch insert in chunks of 500 (PG has param limit)
  const entries = [...prices.entries()];
  const chunkSize = 500;

  for (let c = 0; c < entries.length; c += chunkSize) {
    const chunk = entries.slice(c, c + chunkSize);
    const values: string[] = [];
    const params: (string | number)[] = [];
    let i = 1;

    for (const [name, price] of chunk) {
      values.push(`($${i}, $${i + 1}, $${i + 2})`);
      params.push(name, source, price);
      i += 3;
    }

    await pool.query(
      `INSERT INTO price_history (market_hash_name, source, price_usd)
       VALUES ${values.join(",")}`,
      params
    );
  }
}

// Get latest prices for a list of items
export async function getLatestPrices(
  marketHashNames: string[]
): Promise<Map<string, Record<string, number>>> {
  if (marketHashNames.length === 0) return new Map();

  const placeholders = marketHashNames.map((_, i) => `$${i + 1}`).join(",");

  const { rows } = await pool.query(
    `SELECT DISTINCT ON (market_hash_name, source)
       market_hash_name, source, price_usd
     FROM price_history
     WHERE market_hash_name IN (${placeholders})
     ORDER BY market_hash_name, source, recorded_at DESC`,
    marketHashNames
  );

  const result = new Map<string, Record<string, number>>();
  for (const row of rows) {
    const existing = result.get(row.market_hash_name) ?? {};
    existing[row.source] = parseFloat(row.price_usd);
    result.set(row.market_hash_name, existing);
  }
  return result;
}

// Get unique market_hash_names from all users' inventories
export async function getUniqueInventoryNames(): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT market_hash_name FROM inventory_items`
  );
  return rows.map((r) => r.market_hash_name);
}

// Get price history for a specific item
export async function getPriceHistory(
  marketHashName: string,
  days: number = 30
): Promise<Array<{ source: string; price_usd: number; recorded_at: string }>> {
  const { rows } = await pool.query(
    `SELECT source, price_usd, recorded_at
     FROM price_history
     WHERE market_hash_name = $1
       AND recorded_at > NOW() - INTERVAL '1 day' * $2
     ORDER BY recorded_at ASC`,
    [marketHashName, days]
  );
  return rows.map((r) => ({
    source: r.source,
    price_usd: parseFloat(r.price_usd),
    recorded_at: r.recorded_at,
  }));
}
