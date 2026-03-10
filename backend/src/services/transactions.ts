import axios from "axios";
import { pool } from "../db/pool.js";
import type { SteamSession } from "./steamSession.js";
import { getLatestPrices } from "./prices.js";
import { getExchangeRate } from "./currency.js";

export interface Transaction {
  id: string;
  type: "buy" | "sell";
  marketHashName: string;
  price: number; // in cents
  date: string; // ISO
  partnerSteamId?: string;
  listingId?: string;
  iconUrl?: string;
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
  price: number; // in cents without fees (often 0 for sells)
  fee: number;
  publisher_fee: number;
  publisher_fee_app: number;
  currencyid: number;
  original_price?: number; // original listing price (cents, seller's currency)
  asset: {
    appid: number;
    contextid: string;
    id: string;
    amount: string;
    currency?: number;
    classid?: string;
    instanceid?: string;
  };
}

interface SteamHistoryPurchase {
  listingid: string;
  purchaseid: string;
  steamid_purchaser: string;
  paid_amount: number; // what buyer paid (cents, buyer's currency)
  paid_fee: number;
  steam_fee: number;
  publisher_fee: number;
  received_amount: number; // what seller received (cents, seller's currency)
  received_currencyid: string;
  currencyid: string;
  asset: {
    appid: number;
    contextid: string;
    id: string;
    classid?: string;
    instanceid?: string;
    amount: string;
  };
}

// Fetch market transaction history from Steam
export async function fetchSteamTransactions(
  session: SteamSession,
  start: number = 0,
  count: number = 100,
  walletCurrencyId: number = 1 // Steam currency ID (18=UAH, 1=USD)
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

  const assetKeys = data.assets ? Object.keys(data.assets) : [];
  const contextKeys = assetKeys.length > 0 ? Object.keys(data.assets[assetKeys[0]] ?? {}) : [];
  console.log(`[Transactions] Steam response: success=${data.success}, total_count=${data.total_count}, events=${data.events?.length ?? 0}, asset_apps=${assetKeys}, contexts=${contextKeys}`);

  if (!data.success) {
    throw new Error("Failed to fetch transaction history");
  }

  const assets: Record<string, SteamHistoryAsset> =
    data.assets?.["730"]?.["2"] ?? {};
  const events: SteamHistoryEvent[] = data.events ?? [];
  const listings: Record<string, SteamHistoryListing> = data.listings ?? {};
  const purchaseMap: Record<string, SteamHistoryPurchase> = data.purchases ?? {};

  const transactions: Transaction[] = [];

  // Log event types for debugging
  const typeCounts: Record<number, number> = {};
  for (const e of events) typeCounts[e.event_type] = (typeCounts[e.event_type] || 0) + 1;
  console.log(`[Transactions] Event types:`, typeCounts);
  console.log(`[Transactions] Data: ${Object.keys(listings).length} listings, ${Object.keys(purchaseMap).length} purchases`);

  // Get exchange rate to convert wallet currency → USD cents
  let walletToUsdRate = 1;
  if (walletCurrencyId !== 1) {
    const usdToWallet = await getExchangeRate(walletCurrencyId);
    if (usdToWallet && usdToWallet > 0) {
      walletToUsdRate = 1 / usdToWallet;
      console.log(`[Transactions] Exchange rate: 1 wallet unit = ${walletToUsdRate.toFixed(6)} USD (currency ${walletCurrencyId})`);
    } else {
      console.warn(`[Transactions] Could not get exchange rate for currency ${walletCurrencyId}, prices will be in wallet currency!`);
    }
  }

  let lookupMisses = 0;

  for (const event of events) {
    // event_type: 3 = item sold (someone bought your listing)
    // event_type: 4 = you bought something
    if (event.event_type !== 3 && event.event_type !== 4) continue;

    const isSell = event.event_type === 3;
    const listing = listings[event.listingid];
    const purchase = purchaseMap[event.purchaseid ? `${event.listingid}_${event.purchaseid}` : ""]
      ?? purchaseMap[event.purchaseid ?? ""];

    if (!listing && !purchase) {
      lookupMisses++;
      continue;
    }

    // Resolve asset: listing.asset and purchase.asset both have id
    const assetId = listing?.asset?.id ?? purchase?.asset?.id;
    const asset = assetId ? assets[assetId] : null;

    // Skip events where asset data is missing
    if (!asset?.market_hash_name) continue;

    // For sells: use received_amount from purchase (what seller actually got)
    // For buys: use paid_amount + paid_fee from purchase (what buyer paid total)
    // Fallback to listing.price/original_price if purchase unavailable
    let totalPrice: number;
    if (isSell) {
      totalPrice = purchase?.received_amount ?? listing?.original_price ?? listing?.price ?? 0;
    } else {
      totalPrice = purchase
        ? purchase.paid_amount + purchase.paid_fee
        : (listing ? listing.price + listing.fee + listing.publisher_fee : 0);
    }

    if (totalPrice <= 0) continue;

    // Convert from wallet currency to USD cents
    const priceUsdCents = Math.round(totalPrice * walletToUsdRate);

    transactions.push({
      id: `${event.listingid}_${event.time_event}`,
      type: isSell ? "sell" : "buy",
      marketHashName: asset.market_hash_name,
      price: priceUsdCents,
      date: new Date(event.time_event * 1000).toISOString(),
      partnerSteamId: event.steamid_actor,
      listingId: event.listingid,
      iconUrl: asset.icon_url,
    });
  }

  console.log(`[Transactions] Parsed: ${transactions.length} from ${events.length} events, ${Object.keys(assets).length} assets, lookupMisses=${lookupMisses}`);
  return {
    transactions,
    totalCount: data.total_count ?? transactions.length,
  };
}

// Save transactions to DB
export async function saveTransactions(
  userId: number,
  transactions: Transaction[],
  steamAccountId?: number
): Promise<void> {
  if (transactions.length === 0) return;

  for (const tx of transactions) {
    await pool.query(
      `INSERT INTO transactions (user_id, tx_id, type, market_hash_name, price_cents, tx_date, partner_steam_id, icon_url, source, steam_account_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'steam', $9)
       ON CONFLICT (user_id, tx_id) DO UPDATE SET
         icon_url = COALESCE(transactions.icon_url, EXCLUDED.icon_url),
         steam_account_id = COALESCE(transactions.steam_account_id, EXCLUDED.steam_account_id)`,
      [
        userId,
        tx.id,
        tx.type,
        tx.marketHashName,
        tx.price,
        tx.date,
        tx.partnerSteamId,
        tx.iconUrl ?? null,
        steamAccountId ?? null,
      ]
    );
  }
}

// Get unified transaction history (market buy/sell + trades)
export async function getTransactions(
  userId: number,
  filters: {
    type?: "buy" | "sell" | "trade";
    marketHashName?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ transactions: any[]; total: number }> {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  // Build market transactions conditions
  const txConditions = ["t.user_id = $1"];
  const params: any[] = [userId];
  let idx = 2;

  if (filters.type && filters.type !== "trade") {
    txConditions.push(`t.type = $${idx}`);
    params.push(filters.type);
    idx++;
  }

  if (filters.marketHashName) {
    txConditions.push(`t.market_hash_name = $${idx}`);
    params.push(filters.marketHashName);
    idx++;
  }

  // Store date param indices for reuse in trade conditions
  let dateFromIdx = 0;
  let dateToIdx = 0;

  if (filters.dateFrom) {
    dateFromIdx = idx;
    txConditions.push(`t.tx_date >= $${idx}::timestamptz`);
    params.push(filters.dateFrom);
    idx++;
  }

  if (filters.dateTo) {
    dateToIdx = idx;
    txConditions.push(`t.tx_date <= $${idx}::timestamptz`);
    params.push(filters.dateTo);
    idx++;
  }

  const txWhere = txConditions.join(" AND ");

  // Trade subquery with item counts
  const tradeSelect = `
    SELECT to2.id::text AS id, 'trade'::text AS type,
      COALESCE(to2.partner_name, 'Trade #' || to2.steam_offer_id) AS market_hash_name,
      0 AS price_cents,
      to2.created_at AS date,
      to2.partner_steam_id,
      to2.direction AS trade_direction,
      to2.status AS trade_status,
      to2.value_give_cents,
      to2.value_recv_cents,
      (SELECT COUNT(*) FROM trade_offer_items ti WHERE ti.offer_id = to2.id AND ti.side = 'give')::int AS give_count,
      (SELECT COUNT(*) FROM trade_offer_items ti WHERE ti.offer_id = to2.id AND ti.side = 'receive')::int AS recv_count,
      (SELECT COALESCE(SUM(ti.price_cents), 0) FROM trade_offer_items ti WHERE ti.offer_id = to2.id AND ti.side = 'give')::int AS give_total,
      (SELECT COALESCE(SUM(ti.price_cents), 0) FROM trade_offer_items ti WHERE ti.offer_id = to2.id AND ti.side = 'receive')::int AS recv_total,
      NULL::text AS icon_url,
      to2.is_internal
    FROM trade_offers to2`;

  const marketSelect = `
    SELECT t.tx_id AS id, t.type, t.market_hash_name, t.price_cents, t.tx_date AS date,
      t.partner_steam_id, NULL AS trade_direction, NULL AS trade_status,
      NULL::int AS value_give_cents, NULL::int AS value_recv_cents,
      NULL::int AS give_count, NULL::int AS recv_count,
      NULL::int AS give_total, NULL::int AS recv_total,
      t.icon_url,
      FALSE AS is_internal
    FROM transactions t`;

  const onlyTrades = filters.type === "trade";
  const onlyMarket = filters.type === "buy" || filters.type === "sell";

  // Build trade conditions
  const buildTradeWhere = () => {
    const conds = [`to2.user_id = $1`];
    if (dateFromIdx) conds.push(`to2.created_at >= $${dateFromIdx}::timestamptz`);
    if (dateToIdx) conds.push(`to2.created_at <= $${dateToIdx}::timestamptz`);
    return conds.join(" AND ");
  };

  let query: string;
  let countQuery: string;

  if (onlyTrades) {
    const trWhere = buildTradeWhere();
    countQuery = `SELECT COUNT(*) FROM trade_offers to2 WHERE ${trWhere}`;
    query = `${tradeSelect} WHERE ${trWhere} ORDER BY to2.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
  } else if (onlyMarket) {
    countQuery = `SELECT COUNT(*) FROM transactions t WHERE ${txWhere}`;
    query = `${marketSelect} WHERE ${txWhere} ORDER BY t.tx_date DESC LIMIT $${idx} OFFSET $${idx + 1}`;
  } else {
    const trWhere = buildTradeWhere();
    countQuery = `SELECT ((SELECT COUNT(*) FROM transactions t WHERE ${txWhere}) + (SELECT COUNT(*) FROM trade_offers to2 WHERE ${trWhere})) AS count`;
    query = `
      SELECT * FROM (
        ${marketSelect} WHERE ${txWhere}
        UNION ALL
        ${tradeSelect} WHERE ${trWhere}
      ) AS unified
      ORDER BY date DESC
      LIMIT $${idx} OFFSET $${idx + 1}`;
  }

  params.push(limit, offset);

  const countResult = await pool.query(countQuery, params.slice(0, -2));
  const { rows } = await pool.query(query, params);

  // Fetch current prices for all unique market_hash_names (market buy/sell only)
  const marketNames = [
    ...new Set(
      rows
        .filter((r) => r.type === "buy" || r.type === "sell")
        .map((r) => r.market_hash_name)
    ),
  ];
  const priceMap =
    marketNames.length > 0 ? await getLatestPrices(marketNames) : new Map();

  return {
    transactions: rows.map((r) => {
      const prices = priceMap.get(r.market_hash_name);
      // Best price: highest of all sources (best for selling)
      const currentPriceCents = prices
        ? Math.round(
            Math.max(
              prices.steam ?? 0,
              prices.skinport ?? 0,
              prices.csfloat ?? 0,
              prices.dmarket ?? 0
            ) * 100
          )
        : null;

      return {
        id: r.id,
        type: r.type,
        market_hash_name: r.market_hash_name,
        price: r.price_cents ?? 0,
        date: r.date,
        partner_steam_id: r.partner_steam_id,
        trade_direction: r.trade_direction,
        trade_status: r.trade_status,
        value_give_cents: r.value_give_cents,
        value_recv_cents: r.value_recv_cents,
        give_count: r.give_count,
        recv_count: r.recv_count,
        give_total: r.give_total,
        recv_total: r.recv_total,
        icon_url: r.icon_url,
        current_price_cents: currentPriceCents,
        is_internal: r.is_internal ?? false,
      };
    }),
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

// Get summary stats (market buy/sell only — trades excluded from profit)
export async function getTransactionStats(
  userId: number,
  dateFrom?: string,
  dateTo?: string
): Promise<{
  totalBought: number;
  totalSold: number;
  totalTraded: number;
  spentCents: number;
  earnedCents: number;
  profitCents: number;
  tradedValueCents: number;
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

  // Trade stats (exclude internal transfers)
  const tradeConditions = ["user_id = $1", "is_internal = FALSE"];
  const tradeParams: any[] = [userId];
  if (dateFrom) {
    tradeConditions.push(`created_at >= $2`);
    tradeParams.push(dateFrom);
    tradeConditions.push(`created_at <= $3`);
    tradeParams.push(dateTo ?? new Date().toISOString());
  }
  const tradeWhere = tradeConditions.join(" AND ");

  const { rows: tradeStats } = await pool.query(
    `SELECT COUNT(*) as count,
            COALESCE(SUM(value_give_cents + value_recv_cents), 0) as total_value
     FROM trade_offers
     WHERE ${tradeWhere}`,
    tradeParams
  );

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
    totalTraded: parseInt(tradeStats[0]?.count ?? "0"),
    spentCents: parseInt(buyRow?.total ?? "0"),
    earnedCents: parseInt(sellRow?.total ?? "0"),
    profitCents:
      parseInt(sellRow?.total ?? "0") - parseInt(buyRow?.total ?? "0"),
    tradedValueCents: parseInt(tradeStats[0]?.total_value ?? "0"),
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
