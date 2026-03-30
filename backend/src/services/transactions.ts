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

  // Exchange rate cache for this batch — avoid repeated API calls
  const rateCache = new Map<number, number>();
  rateCache.set(1, 1); // USD = 1

  /**
   * Get walletToUsd rate for a Steam currencyid (raw format: 2000 + enum).
   * Returns multiplier to convert from wallet cents to USD cents.
   */
  async function getWalletToUsdRate(rawCurrencyId: number | string): Promise<number> {
    const raw = typeof rawCurrencyId === "string" ? parseInt(rawCurrencyId) : rawCurrencyId;
    const currencyId = raw >= 2000 ? raw - 2000 : raw;
    if (currencyId <= 0) return 1;

    const cached = rateCache.get(currencyId);
    if (cached !== undefined) return cached;

    const usdToWallet = await getExchangeRate(currencyId);
    if (!usdToWallet || usdToWallet <= 0 || !isFinite(usdToWallet)) {
      console.warn(`[Transactions] No exchange rate for currency ${currencyId}, assuming USD`);
      rateCache.set(currencyId, 1);
      return 1;
    }
    const rate = 1 / usdToWallet;
    rateCache.set(currencyId, rate);
    return rate;
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

    // For sells: use received_amount + received_currencyid (what seller got in THEIR currency)
    // For buys: use paid_amount + paid_fee + currencyid (what buyer paid in THEIR currency)
    let totalPrice: number;
    let txCurrencyId: number | string;
    if (isSell) {
      totalPrice = purchase?.received_amount ?? listing?.original_price ?? listing?.price ?? 0;
      txCurrencyId = purchase?.received_currencyid ?? listing?.currencyid ?? 2001;
    } else {
      totalPrice = purchase
        ? purchase.paid_amount + purchase.paid_fee
        : (listing ? listing.price + listing.fee + listing.publisher_fee : 0);
      txCurrencyId = purchase?.currencyid ?? listing?.currencyid ?? 2001;
    }

    if (totalPrice <= 0) continue;

    // Convert from transaction's actual currency to USD cents
    const walletToUsdRate = await getWalletToUsdRate(txCurrencyId);
    if (walletToUsdRate < 0.0001 || walletToUsdRate > 1000) {
      console.warn(`[Transactions] Suspicious walletToUsd rate ${walletToUsdRate} for currency ${txCurrencyId}, skipping transaction`);
      continue;
    }
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

// Save transactions to DB (batch INSERT for performance)
export async function saveTransactions(
  userId: number,
  transactions: Transaction[],
  steamAccountId?: number
): Promise<number> {
  if (transactions.length === 0) return 0;

  // Batch insert using unnest for maximum performance
  const txIds = transactions.map(tx => tx.id);
  const types = transactions.map(tx => tx.type);
  const names = transactions.map(tx => tx.marketHashName);
  const prices = transactions.map(tx => tx.price);
  const dates = transactions.map(tx => tx.date);
  const partners = transactions.map(tx => tx.partnerSteamId ?? null);
  const icons = transactions.map(tx => tx.iconUrl ?? null);
  const accountIds = transactions.map(() => steamAccountId ?? null);

  const { rowCount } = await pool.query(
    `INSERT INTO transactions (user_id, tx_id, type, market_hash_name, price_cents, tx_date, partner_steam_id, icon_url, source, steam_account_id)
     SELECT $1, unnest($2::text[]), unnest($3::text[]), unnest($4::text[]),
            unnest($5::int[]), unnest($6::timestamptz[]), unnest($7::text[]),
            unnest($8::text[]), 'steam', unnest($9::int[])
     ON CONFLICT (user_id, tx_id) DO UPDATE SET
       icon_url = COALESCE(transactions.icon_url, EXCLUDED.icon_url),
       steam_account_id = EXCLUDED.steam_account_id`,
    [
      userId,
      txIds,
      types,
      names,
      prices,
      dates,
      partners,
      icons,
      accountIds,
    ]
  );

  return rowCount ?? 0;
}

// Get the most recent transaction date for incremental sync
export async function getLatestTxDate(
  userId: number,
  steamAccountId?: number
): Promise<Date | null> {
  const { rows } = await pool.query(
    `SELECT MAX(tx_date) AS latest FROM transactions
     WHERE user_id = $1 AND source = 'steam'
     ${steamAccountId ? 'AND steam_account_id = $2' : ''}`,
    steamAccountId ? [userId, steamAccountId] : [userId]
  );
  return rows[0]?.latest ? new Date(rows[0].latest) : null;
}

// Check how many of the given tx_ids already exist in DB for a specific account
export async function countExistingTxIds(
  userId: number,
  txIds: string[],
  steamAccountId?: number
): Promise<number> {
  if (txIds.length === 0) return 0;
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS cnt FROM transactions
     WHERE user_id = $1 AND tx_id = ANY($2::text[])
     ${steamAccountId ? 'AND steam_account_id = $3' : ''}`,
    steamAccountId ? [userId, txIds, steamAccountId] : [userId, txIds]
  );
  return parseInt(rows[0].cnt);
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
    accountId?: number;
  }
): Promise<{ transactions: any[]; total: number }> {
  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  // Build market transactions conditions
  // Only show Steam market history in the transactions feed;
  // manual/csv entries only affect P/L calculations
  const txConditions = ["t.user_id = $1", "t.source = 'steam'"];
  const params: any[] = [userId];
  let idx = 2;
  let accountIdIdx = 0; // track param index for trade WHERE reuse

  if (filters.accountId) {
    accountIdIdx = idx;
    txConditions.push(`t.steam_account_id = $${idx}`);
    params.push(filters.accountId);
    idx++;
  }

  if (filters.type && filters.type !== "trade") {
    txConditions.push(`t.type = $${idx}`);
    params.push(filters.type);
    idx++;
  }

  let itemIdx = 0;
  if (filters.marketHashName) {
    itemIdx = idx;
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

  // Aggregate subquery shared by trade selects
  const tradeAgg = `
    LEFT JOIN (
      SELECT ti.offer_id,
        COUNT(*) FILTER (WHERE ti.side = 'give') AS give_count,
        COUNT(*) FILTER (WHERE ti.side = 'receive') AS recv_count,
        COALESCE(SUM(ti.price_cents) FILTER (WHERE ti.side = 'give'), 0) AS give_total,
        COALESCE(SUM(ti.price_cents) FILTER (WHERE ti.side = 'receive'), 0) AS recv_total,
        (ARRAY_AGG(ti.icon_url ORDER BY ti.price_cents DESC) FILTER (WHERE ti.icon_url IS NOT NULL))[1] AS first_icon,
        CASE
          WHEN COUNT(*) FILTER (WHERE ti.market_hash_name IS NOT NULL) = 0 THEN NULL
          WHEN COUNT(*) FILTER (WHERE ti.market_hash_name IS NOT NULL) = 1
            THEN (ARRAY_AGG(ti.market_hash_name) FILTER (WHERE ti.market_hash_name IS NOT NULL))[1]
          ELSE (ARRAY_AGG(ti.market_hash_name) FILTER (WHERE ti.market_hash_name IS NOT NULL))[1]
            || ' +' || (COUNT(*) FILTER (WHERE ti.market_hash_name IS NOT NULL) - 1)::text
        END AS item_summary
      FROM trade_offer_items ti
      GROUP BY ti.offer_id
    ) agg ON agg.offer_id = to2.id`;

  // Trade subquery — for non-internal trades: one row per trade
  // For internal trades: two rows — one per account perspective (from/to)
  const tradeSelect = `
    SELECT to2.id::text AS id, 'trade'::text AS type,
      COALESCE(NULLIF(agg.item_summary, ''), to2.partner_name, 'Trade #' || to2.steam_offer_id, 'Trade') AS market_hash_name,
      0 AS price_cents,
      to2.created_at AS date,
      to2.partner_steam_id,
      to2.direction AS trade_direction,
      to2.status AS trade_status,
      to2.value_give_cents,
      to2.value_recv_cents,
      COALESCE(agg.give_count, 0)::int AS give_count,
      COALESCE(agg.recv_count, 0)::int AS recv_count,
      COALESCE(agg.give_total, 0)::int AS give_total,
      COALESCE(agg.recv_total, 0)::int AS recv_total,
      agg.first_icon AS icon_url,
      NULL::text AS note,
      to2.is_internal,
      NULL::int AS perspective_account_id,
      NULL::text AS perspective
    FROM trade_offers to2
    ${tradeAgg}`;

  // Internal trades: two rows — "sent" perspective (from account) + "received" perspective (to account)
  const internalTradeSelect = `
    SELECT to2.id::text || '_from' AS id, 'trade'::text AS type,
      COALESCE(NULLIF(agg.item_summary, ''), 'Transfer') AS market_hash_name,
      0 AS price_cents,
      to2.created_at AS date,
      to2.partner_steam_id,
      'outgoing'::text AS trade_direction,
      to2.status AS trade_status,
      to2.value_give_cents,
      to2.value_recv_cents,
      COALESCE(agg.give_count, 0)::int AS give_count,
      COALESCE(agg.recv_count, 0)::int AS recv_count,
      COALESCE(agg.give_total, 0)::int AS give_total,
      COALESCE(agg.recv_total, 0)::int AS recv_total,
      agg.first_icon AS icon_url,
      NULL::text AS note,
      true AS is_internal,
      to2.account_id_from AS perspective_account_id,
      'sent'::text AS perspective
    FROM trade_offers to2
    ${tradeAgg}
    UNION ALL
    SELECT to2.id::text || '_to' AS id, 'trade'::text AS type,
      COALESCE(NULLIF(agg.item_summary, ''), 'Transfer') AS market_hash_name,
      0 AS price_cents,
      to2.created_at AS date,
      to2.partner_steam_id,
      'incoming'::text AS trade_direction,
      to2.status AS trade_status,
      to2.value_give_cents,
      to2.value_recv_cents,
      COALESCE(agg.give_count, 0)::int AS give_count,
      COALESCE(agg.recv_count, 0)::int AS recv_count,
      COALESCE(agg.give_total, 0)::int AS give_total,
      COALESCE(agg.recv_total, 0)::int AS recv_total,
      agg.first_icon AS icon_url,
      NULL::text AS note,
      true AS is_internal,
      to2.account_id_to AS perspective_account_id,
      'received'::text AS perspective
    FROM trade_offers to2
    ${tradeAgg}`;

  const marketSelect = `
    SELECT t.tx_id AS id, t.type, t.market_hash_name, t.price_cents, t.tx_date AS date,
      t.partner_steam_id, NULL AS trade_direction, NULL AS trade_status,
      NULL::int AS value_give_cents, NULL::int AS value_recv_cents,
      NULL::int AS give_count, NULL::int AS recv_count,
      NULL::int AS give_total, NULL::int AS recv_total,
      t.icon_url, t.note,
      FALSE AS is_internal,
      NULL::int AS perspective_account_id,
      NULL::text AS perspective
    FROM transactions t`;

  const onlyTrades = filters.type === "trade";
  const onlyMarket = filters.type === "buy" || filters.type === "sell";

  // Build trade conditions
  const buildTradeWhere = () => {
    const conds = [`to2.user_id = $1`];
    if (accountIdIdx) {
      // Show trades where this account is sender OR receiver
      conds.push(`(to2.account_id_from = $${accountIdIdx} OR to2.account_id_to = $${accountIdIdx})`);
    }
    if (dateFromIdx) conds.push(`to2.created_at >= $${dateFromIdx}::timestamptz`);
    if (dateToIdx) conds.push(`to2.created_at <= $${dateToIdx}::timestamptz`);
    if (itemIdx) {
      // Filter trades that contain this item on either side
      conds.push(`EXISTS (
        SELECT 1 FROM trade_offer_items ti
        WHERE ti.offer_id = to2.id AND ti.market_hash_name = $${itemIdx}
      )`);
    }
    return conds.join(" AND ");
  };

  let query: string;
  let countQuery: string;

  // Internal trades get split into 2 rows (sent/received perspectives).
  // Non-internal trades stay as 1 row.
  const buildTradeUnion = (where: string) => `
    ${tradeSelect} WHERE ${where} AND NOT to2.is_internal
    UNION ALL
    ${internalTradeSelect} WHERE ${where} AND to2.is_internal`;

  // Count: internal trades count as 2 rows
  const buildTradeCount = (where: string) => `
    (SELECT COUNT(*) FROM trade_offers to2 WHERE ${where} AND NOT to2.is_internal)
    + (SELECT COUNT(*) * 2 FROM trade_offers to2 WHERE ${where} AND to2.is_internal)`;

  if (onlyTrades) {
    const trWhere = buildTradeWhere();
    countQuery = `SELECT ${buildTradeCount(trWhere)} AS count`;
    query = `SELECT * FROM (${buildTradeUnion(trWhere)}) AS trades ORDER BY date DESC LIMIT $${idx} OFFSET $${idx + 1}`;
  } else if (onlyMarket) {
    countQuery = `SELECT COUNT(*) FROM transactions t WHERE ${txWhere}`;
    query = `${marketSelect} WHERE ${txWhere} ORDER BY t.tx_date DESC LIMIT $${idx} OFFSET $${idx + 1}`;
  } else {
    const trWhere = buildTradeWhere();
    countQuery = `SELECT ((SELECT COUNT(*) FROM transactions t WHERE ${txWhere}) + ${buildTradeCount(trWhere)}) AS count`;
    query = `
      SELECT * FROM (
        ${marketSelect} WHERE ${txWhere}
        UNION ALL
        ${buildTradeUnion(trWhere)}
      ) AS unified
      ORDER BY date DESC
      LIMIT $${idx} OFFSET $${idx + 1}`;
  }

  params.push(limit, offset);

  // Run count + main query in parallel
  const [countResult, { rows }] = await Promise.all([
    pool.query(countQuery, params.slice(0, -2)),
    pool.query(query, params),
  ]);

  // Fetch current prices for all unique market_hash_names (market buy/sell only)
  const marketNames = [
    ...new Set(
      rows
        .filter((r: any) => r.type === "buy" || r.type === "sell")
        .map((r: any) => r.market_hash_name)
    ),
  ];
  const priceMap =
    marketNames.length > 0 ? await getLatestPrices(marketNames) : new Map();

  return {
    transactions: rows.map((r: any) => {
      const prices = priceMap.get(r.market_hash_name);
      // Steam price — consistent with inventory and portfolio
      const currentPriceCents = prices
        ? Math.round((prices.steam ?? prices.skinport ?? 0) * 100)
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
        note: r.note ?? null,
        current_price_cents: currentPriceCents,
        is_internal: r.is_internal ?? false,
        perspective_account_id: r.perspective_account_id ?? null,
        perspective: r.perspective ?? null,
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
  dateTo?: string,
  accountId?: number
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
  const conditions = ["user_id = $1", "source = 'steam'"];
  const params: any[] = [userId];
  let idx = 2;

  if (accountId) {
    conditions.push(`steam_account_id = $${idx}`);
    params.push(accountId);
    idx++;
  }

  if (dateFrom) {
    conditions.push(`tx_date >= $${idx}`);
    params.push(dateFrom);
    idx++;
    conditions.push(`tx_date <= $${idx}`);
    params.push(dateTo ?? new Date().toISOString());
    idx++;
  }

  const where = conditions.join(" AND ");

  // Trade stats query (exclude internal transfers)
  const tradeConditions = ["user_id = $1", "is_internal = FALSE"];
  const tradeParams: any[] = [userId];
  let tradeIdx = 2;
  if (accountId) {
    tradeConditions.push(`(account_id_from = $${tradeIdx} OR account_id_to = $${tradeIdx})`);
    tradeParams.push(accountId);
    tradeIdx++;
  }
  if (dateFrom) {
    tradeConditions.push(`created_at >= $${tradeIdx}`);
    tradeParams.push(dateFrom);
    tradeIdx++;
    tradeConditions.push(`created_at <= $${tradeIdx}`);
    tradeParams.push(dateTo ?? new Date().toISOString());
    tradeIdx++;
  }
  const tradeWhere = tradeConditions.join(" AND ");

  // Run all 4 queries in parallel
  const [
    { rows: stats },
    { rows: tradeStats },
    { rows: topBought },
    { rows: topSold },
  ] = await Promise.all([
    pool.query(
      `SELECT type, COUNT(*) as count, SUM(price_cents) as total
       FROM transactions
       WHERE ${where}
       GROUP BY type`,
      params
    ),
    pool.query(
      `SELECT COUNT(*) as count,
              COALESCE(SUM(value_give_cents + value_recv_cents), 0) as total_value
       FROM trade_offers
       WHERE ${tradeWhere}`,
      tradeParams
    ),
    pool.query(
      `SELECT market_hash_name as name, COUNT(*) as count, SUM(price_cents) as total
       FROM transactions
       WHERE ${where} AND type = 'buy'
       GROUP BY market_hash_name
       ORDER BY total DESC LIMIT 10`,
      params
    ),
    pool.query(
      `SELECT market_hash_name as name, COUNT(*) as count, SUM(price_cents) as total
       FROM transactions
       WHERE ${where} AND type = 'sell'
       GROUP BY market_hash_name
       ORDER BY total DESC LIMIT 10`,
      params
    ),
  ]);

  const buyRow = stats.find((s) => s.type === "buy");
  const sellRow = stats.find((s) => s.type === "sell");

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
