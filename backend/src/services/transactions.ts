import axios from "axios";
import { pool } from "../db/pool.js";

interface SteamSession {
  sessionId: string;
  steamLoginSecure: string;
}

export interface Transaction {
  id: string;
  type: "buy" | "sell";
  marketHashName: string;
  price: number; // in cents
  date: string; // ISO
  partnerSteamId?: string;
  listingId?: string;
}

interface SteamHistoryAsset {
  classid: string;
  instanceid: string;
  name: string;
  market_hash_name: string;
  icon_url: string;
}

interface SteamHistoryEvent {
  listingid: string;
  purchaseid?: string;
  event_type: number; // 3 = sell to buyer, 4 = buy
  time_event: number;
  steamid_actor: string;
}

interface SteamHistoryListing {
  listingid: string;
  price: number; // in cents without fees
  fee: number;
  publisher_fee: number;
  publisher_fee_app: number;
  currencyid: number;
  asset: {
    appid: number;
    contextid: string;
    id: string;
    classid: string;
    instanceid: string;
    amount: string;
  };
}

// Fetch market transaction history from Steam
export async function fetchSteamTransactions(
  session: SteamSession,
  start: number = 0,
  count: number = 100
): Promise<{ transactions: Transaction[]; totalCount: number }> {
  const { data } = await axios.get(
    "https://steamcommunity.com/market/myhistory/render/",
    {
      params: { query: "", start, count, norender: 1 },
      headers: {
        Cookie: `steamLoginSecure=${session.steamLoginSecure}; sessionid=${session.sessionId}`,
        Referer: "https://steamcommunity.com/market/",
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      timeout: 15000,
    }
  );

  if (!data.success) {
    throw new Error("Failed to fetch transaction history");
  }

  const assets: Record<string, SteamHistoryAsset> =
    data.assets?.["730"]?.["2"] ?? {};
  const events: SteamHistoryEvent[] = data.events ?? [];
  const listings: Record<string, SteamHistoryListing> = data.listings ?? {};
  const purchaseMap: Record<string, SteamHistoryListing> = data.purchases ?? {};

  const transactions: Transaction[] = [];

  for (const event of events) {
    // event_type: 3 = item sold (someone bought your listing)
    // event_type: 4 = you bought something
    if (event.event_type !== 3 && event.event_type !== 4) continue;

    const isSell = event.event_type === 3;
    const listing =
      listings[event.listingid] ?? purchaseMap[event.purchaseid ?? ""];
    if (!listing) continue;

    const assetKey = listing.asset?.classid;
    const asset = assetKey
      ? Object.values(assets).find((a) => a.classid === listing.asset.classid)
      : null;

    const totalPrice = isSell
      ? listing.price // seller receives
      : listing.price + listing.fee + listing.publisher_fee; // buyer pays

    transactions.push({
      id: `${event.listingid}_${event.time_event}`,
      type: isSell ? "sell" : "buy",
      marketHashName: asset?.market_hash_name ?? "Unknown Item",
      price: totalPrice,
      date: new Date(event.time_event * 1000).toISOString(),
      partnerSteamId: event.steamid_actor,
      listingId: event.listingid,
    });
  }

  return {
    transactions,
    totalCount: data.total_count ?? transactions.length,
  };
}

// Save transactions to DB
export async function saveTransactions(
  userId: number,
  transactions: Transaction[]
): Promise<void> {
  if (transactions.length === 0) return;

  for (const tx of transactions) {
    await pool.query(
      `INSERT INTO transactions (user_id, tx_id, type, market_hash_name, price_cents, tx_date, partner_steam_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (user_id, tx_id) DO NOTHING`,
      [
        userId,
        tx.id,
        tx.type,
        tx.marketHashName,
        tx.price,
        tx.date,
        tx.partnerSteamId,
      ]
    );
  }
}

// Get transactions from DB with filters
export async function getTransactions(
  userId: number,
  filters: {
    type?: "buy" | "sell";
    marketHashName?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ transactions: any[]; total: number }> {
  const conditions = ["t.user_id = $1"];
  const params: any[] = [userId];
  let idx = 2;

  if (filters.type) {
    conditions.push(`t.type = $${idx}`);
    params.push(filters.type);
    idx++;
  }

  if (filters.marketHashName) {
    conditions.push(`t.market_hash_name = $${idx}`);
    params.push(filters.marketHashName);
    idx++;
  }

  if (filters.dateFrom) {
    conditions.push(`t.tx_date >= $${idx}`);
    params.push(filters.dateFrom);
    idx++;
  }

  if (filters.dateTo) {
    conditions.push(`t.tx_date <= $${idx}`);
    params.push(filters.dateTo);
    idx++;
  }

  const where = conditions.join(" AND ");
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM transactions t WHERE ${where}`,
    params
  );

  const { rows } = await pool.query(
    `SELECT t.tx_id, t.type, t.market_hash_name, t.price_cents, t.tx_date, t.partner_steam_id
     FROM transactions t
     WHERE ${where}
     ORDER BY t.tx_date DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  return {
    transactions: rows.map((r) => ({
      id: r.tx_id,
      type: r.type,
      market_hash_name: r.market_hash_name,
      price: r.price_cents,
      date: r.tx_date,
      partner_steam_id: r.partner_steam_id,
    })),
    total: parseInt(countResult.rows[0].count),
  };
}

// Get unique item names from transactions (for filter dropdown)
export async function getTransactionItems(
  userId: number
): Promise<string[]> {
  const { rows } = await pool.query(
    `SELECT DISTINCT market_hash_name FROM transactions
     WHERE user_id = $1
     ORDER BY market_hash_name`,
    [userId]
  );
  return rows.map((r) => r.market_hash_name);
}

// Get summary stats
export async function getTransactionStats(
  userId: number,
  dateFrom?: string,
  dateTo?: string
): Promise<{
  totalBought: number;
  totalSold: number;
  spentCents: number;
  earnedCents: number;
  profitCents: number;
  topBought: Array<{ name: string; count: number; total: number }>;
  topSold: Array<{ name: string; count: number; total: number }>;
}> {
  const conditions = ["user_id = $1"];
  const params: any[] = [userId];
  let idx = 2;

  if (dateFrom) {
    conditions.push(`tx_date >= $${idx}`);
    params.push(dateFrom);
    idx++;
    conditions.push(`tx_date <= $${idx}`);
    params.push(dateTo ?? new Date().toISOString());
    idx++;
  }

  const where = conditions.join(" AND ");

  const { rows: stats } = await pool.query(
    `SELECT type, COUNT(*) as count, SUM(price_cents) as total
     FROM transactions
     WHERE ${where}
     GROUP BY type`,
    params
  );

  const buyRow = stats.find((s) => s.type === "buy");
  const sellRow = stats.find((s) => s.type === "sell");

  const { rows: topBought } = await pool.query(
    `SELECT market_hash_name as name, COUNT(*) as count, SUM(price_cents) as total
     FROM transactions
     WHERE ${where} AND type = 'buy'
     GROUP BY market_hash_name
     ORDER BY total DESC LIMIT 10`,
    params
  );

  const { rows: topSold } = await pool.query(
    `SELECT market_hash_name as name, COUNT(*) as count, SUM(price_cents) as total
     FROM transactions
     WHERE ${where} AND type = 'sell'
     GROUP BY market_hash_name
     ORDER BY total DESC LIMIT 10`,
    params
  );

  return {
    totalBought: parseInt(buyRow?.count ?? "0"),
    totalSold: parseInt(sellRow?.count ?? "0"),
    spentCents: parseInt(buyRow?.total ?? "0"),
    earnedCents: parseInt(sellRow?.total ?? "0"),
    profitCents:
      parseInt(sellRow?.total ?? "0") - parseInt(buyRow?.total ?? "0"),
    topBought: topBought.map((r) => ({
      name: r.name,
      count: parseInt(r.count),
      total: parseInt(r.total),
    })),
    topSold: topSold.map((r) => ({
      name: r.name,
      count: parseInt(r.count),
      total: parseInt(r.total),
    })),
  };
}
