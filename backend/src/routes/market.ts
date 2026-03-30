import { Router, Response, NextFunction } from "express";
import axios from "axios";
import { pool } from "../db/pool.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { demoStubs } from "../middleware/demoStubs.js";
import { validateBody } from "../middleware/validate.js";
import { sellOperationSchema, sellItemSchema, sessionCookiesSchema, clientTokenSchema, refreshPricesSchema } from "../middleware/schemas.js";
import {
  sellItem,
  quickSellPrice,
  bulkSell,
  getMarketPrice,
} from "../services/market.js";
import { SteamSessionService } from "../services/steamSession.js";
import {
  createOperation,
  getOperation,
  cancelOperation,
  getDailyVolume,
} from "../services/sellOperations.js";
import {
  getWalletInfo,
  getWalletCurrency,
  detectWalletCurrency,
  getExchangeRate,
  getCurrencyInfo,
  convertUsdToWallet,
  setWalletCurrency,
  getSteamCurrencies,
} from "../services/currency.js";
import { SessionExpiredError } from "../utils/errors.js";
import { getExchangeRates, getExchangeRatesUpdatedAt } from "../services/csgoTrader.js";
import { getMarketplaceLinks } from "../services/buffIds.js";
import { refreshPricesOnDemand } from "../services/steamHistogram.js";

const router = Router();

// DEPRECATED: Use POST /api/session/token instead
router.post("/session", authMiddleware, (_req, res) => {
  res.status(410).json({ error: "Deprecated. Use POST /api/session/token instead." });
});

// DEPRECATED: Use POST /api/session/token instead
router.post("/clienttoken", authMiddleware, (_req, res) => {
  res.status(410).json({ error: "Deprecated. Use POST /api/session/token instead." });
});

// DEPRECATED: Use GET /api/session/status instead
router.get("/session/status", authMiddleware, (_req, res) => {
  res.status(410).json({ error: "Deprecated. Use GET /api/session/status instead." });
});

// ─── Exchange Rates (public, no auth) ────────────────────────────────────

/**
 * GET /api/market/exchange-rates
 * Returns CSGOTrader exchange rates (50+ currencies, USD-relative).
 * Used by Flutter client for multi-currency display.
 */
router.get("/exchange-rates", (_req, res: Response) => {
  const rates = getExchangeRates();
  const updatedAt = getExchangeRatesUpdatedAt();
  res.json({
    rates,
    count: Object.keys(rates).length,
    updatedAt: updatedAt?.toISOString() ?? null,
  });
});

// ─── Wallet Currency ─────────────────────────────────────────────────────

/**
 * GET /api/market/wallet-info
 * Returns the user's Steam wallet currency and exchange rate.
 */
router.get(
  "/wallet-info",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const paramId = parseInt(req.query.accountId as string);
      const accountId = paramId && !isNaN(paramId)
        ? paramId
        : await SteamSessionService.getActiveAccountId(req.userId!);

      // Try to get stored wallet info first
      let info = await getWalletInfo(accountId);

      // If not detected yet, try to detect now
      if (!info) {
        const session = await SteamSessionService.getSession(accountId);
        if (session?.steamLoginSecure) {
          const currencyId = await detectWalletCurrency(session.steamLoginSecure);
          if (currencyId) {
            await pool.query(
              "UPDATE steam_accounts SET wallet_currency = $1 WHERE id = $2",
              [currencyId, accountId]
            );
            info = await getWalletInfo(accountId);
          }
        }
      }

      if (!info) {
        res.json({ detected: false, currencyId: 1, code: "USD", symbol: "$", rate: 1, source: "default" });
        return;
      }

      res.json({ detected: true, ...info });
    } catch (err) {
      console.error("Wallet info error:", err);
      res.status(500).json({ error: "Failed to get wallet info" });
    }
  }
);

/**
 * PUT /api/market/wallet-currency
 * Manually set the wallet currency for a Steam account.
 * Body: { currencyId: number, accountId?: number }
 */
router.put(
  "/wallet-currency",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { currencyId, accountId } = req.body;

      if (!currencyId || typeof currencyId !== "number") {
        res.status(400).json({ error: "currencyId is required (number)" });
        return;
      }

      const resolvedAccountId = accountId
        ? parseInt(accountId)
        : await SteamSessionService.getActiveAccountId(req.userId!);

      const result = await setWalletCurrency(resolvedAccountId, currencyId);
      if (!result) {
        res.status(400).json({ error: "Unsupported currency ID" });
        return;
      }

      res.json({ ok: true, ...result });
    } catch (err) {
      console.error("Set wallet currency error:", err);
      res.status(500).json({ error: "Failed to set wallet currency" });
    }
  }
);

/**
 * GET /api/market/currencies
 * List all supported Steam currencies for the picker UI.
 */
router.get("/currencies", (_req, res: Response) => {
  res.json({ currencies: getSteamCurrencies() });
});

// ─── Sell Operations (async, tracked) ────────────────────────────────────

/**
 * POST /api/market/sell-operation
 * Create a new async sell operation with per-item tracking.
 * Body: { items: [{ assetId, marketHashName, priceCents }] }
 */
router.post(
  "/sell-operation",
  authMiddleware,
  demoStubs.sellOperation,
  validateBody(sellOperationSchema),
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { items } = req.body;

      // Check daily volume limit
      const volume = await getDailyVolume(req.userId!);
      if (volume.count + items.length > volume.limit) {
        res.status(429).json({
          error: "Daily sell limit would be exceeded",
          today: volume.count,
          limit: volume.limit,
          remaining: volume.remaining,
          requested: items.length,
        });
        return;
      }

      // Pre-validate sessions for all unique accounts referenced by items.
      // Falls back to active account for items without explicit accountId.
      const activeAccountId = await SteamSessionService.getActiveAccountId(req.userId!);
      const accountIds = new Set<number>(
        items.map((i: { accountId?: number }) => i.accountId ?? activeAccountId)
      );
      await Promise.all(
        [...accountIds].map((id) => SteamSessionService.ensureValidSession(id))
      );

      // Fix 6: Validate asset ownership — every item must exist in the user's inventory
      const assetIds = items.map((i: { assetId: string }) => i.assetId);
      const { rows: ownedRows } = await pool.query(
        `SELECT ii.asset_id
         FROM inventory_items ii
         JOIN steam_accounts sa ON ii.steam_account_id = sa.id
         WHERE sa.user_id = $1 AND ii.asset_id = ANY($2::text[])`,
        [req.userId!, assetIds]
      );
      const ownedSet = new Set(ownedRows.map((r: { asset_id: string }) => r.asset_id));
      const invalidAssetIds = assetIds.filter((id: string) => !ownedSet.has(id));
      let validItems = items;
      if (invalidAssetIds.length > 0) {
        if (invalidAssetIds.length === assetIds.length) {
          res.status(400).json({
            error: "None of the items were found in your inventory",
            invalidAssetIds,
          });
          return;
        }
        validItems = items.filter((i: { assetId: string }) => ownedSet.has(i.assetId));
      }

      const { operationId, skippedAssetIds } = await createOperation(req.userId!, validItems, activeAccountId);

      res.json({
        operationId,
        status: "pending",
        totalItems: validItems.length,
        skippedAssetIds: [...skippedAssetIds, ...invalidAssetIds],
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/market/sell-operation/:id
 * Poll a sell operation for current status and per-item progress.
 */
router.get(
  "/sell-operation/:id",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const operation = await getOperation(
        req.params.id as string,
        req.userId!
      );

      if (!operation) {
        res.status(404).json({ error: "Operation not found" });
        return;
      }

      res.json(operation);
    } catch (err) {
      console.error("Sell operation get error:", err);
      res.status(500).json({ error: "Failed to get sell operation" });
    }
  }
);

/**
 * POST /api/market/sell-operation/:id/cancel
 * Cancel a running sell operation. Already-listed items are not affected.
 */
router.post(
  "/sell-operation/:id/cancel",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const cancelled = await cancelOperation(
        req.params.id as string,
        req.userId!
      );

      if (!cancelled) {
        res.status(404).json({
          error: "Operation not found or already completed/cancelled",
        });
        return;
      }

      res.json({ status: "cancelled" });
    } catch (err) {
      console.error("Sell operation cancel error:", err);
      res.status(500).json({ error: "Failed to cancel sell operation" });
    }
  }
);

/**
 * GET /api/market/volume
 * Get today's sell volume and rate limit info.
 */
router.get(
  "/volume",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const volume = await getDailyVolume(req.userId!);
      res.json({
        today: volume.count,
        limit: volume.limit,
        warningAt: volume.warningAt,
        remaining: volume.remaining,
      });
    } catch (err) {
      console.error("Volume check error:", err);
      res.status(500).json({ error: "Failed to check sell volume" });
    }
  }
);

// ─── Market Listings ──────────────────────────────────────────────────────

/** Fetch webTradeEligibility cookie required for Steam market pages. */
async function getEligibilityCookie(
  steamLoginSecure: string,
  sessionId: string
): Promise<string | null> {
  try {
    const resp = await axios.get(
      "https://steamcommunity.com/market/eligibilitycheck/?goto=%2F",
      {
        headers: {
          Cookie: `steamLoginSecure=${steamLoginSecure}; sessionid=${sessionId}`,
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        },
        maxRedirects: 0,
        timeout: 10000,
        validateStatus: () => true,
      }
    );
    for (const c of (resp.headers["set-cookie"] as string[] | undefined) ?? []) {
      const match = c.match(/webTradeEligibility=([^;]+)/);
      if (match) return match[1];
    }
    return null;
  } catch {
    return null;
  }
}

/**
/** Fetch listings for a single account. Returns [] on session errors (for multi-account aggregation). */
async function fetchListingsForAccount(
  accountId: number,
  accountName: string | null,
  start = 0,
  count = 100
): Promise<object[]> {
  const session = await SteamSessionService.getSession(accountId);
  if (!session?.steamLoginSecure) return [];

  const isValid = await SteamSessionService.validateSession(session);
  if (!isValid) return [];

  const eligibility = await getEligibilityCookie(session.steamLoginSecure, session.sessionId);
  let cookieHeader = `steamLoginSecure=${session.steamLoginSecure}; sessionid=${session.sessionId}`;
  if (eligibility) cookieHeader += `; webTradeEligibility=${eligibility}`;

  let data: Record<string, unknown>;
  try {
    const response = await axios.get("https://steamcommunity.com/market/mylistings", {
      params: { norender: 1, start, count },
      headers: {
        Cookie: cookieHeader,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
      },
      timeout: 15000,
    });
    data = response.data as Record<string, unknown>;
  } catch {
    return [];
  }

  if (!data?.success) return [];

  const assets =
    (((data.assets as Record<string, unknown>)?.["730"] as Record<string, unknown>)?.["2"] as
      Record<string, Record<string, unknown>>) ?? {};

  const rawListings = [
    ...((data.listings as unknown[]) ?? []).map((l) => ({ ...(l as object), _state: "active" })),
    ...((data.listings_to_confirm as unknown[]) ?? []).map((l) => ({ ...(l as object), _state: "to_confirm" })),
    ...((data.listings_on_hold as unknown[]) ?? []).map((l) => ({ ...(l as object), _state: "on_hold" })),
  ];

  const rawMapped = rawListings.map((listing) => {
    const l = listing as Record<string, unknown>;
    const asset = l.asset as Record<string, unknown> | undefined;
    const assetId = asset?.id as string | undefined;
    const desc: Record<string, unknown> = assetId ? (assets[assetId] ?? {}) : {};
    return {
      listingId: l.listingid as string,
      assetId,
      accountId,
      accountName,
      state: l._state as string,
      marketHashName: (desc.market_hash_name as string | undefined) ?? (l.hashname as string | undefined) ?? null,
      name: (desc.name as string | undefined) ?? null,
      iconUrl: (desc.icon_url as string | undefined) ?? null,
      sellerPrice: (l.original_price as number) ?? 0,
      buyerPrice: (l.price as number) ?? 0,
      // Steam returns currencyid with +2000 offset (e.g. 2018 = UAH id 18)
      currencyId: ((l.currencyid as number) ?? 2001) >= 2000
        ? (l.currencyid as number) - 2000
        : (l.currencyid as number) ?? 1,
      timeCreated: (l.time_created as number) ?? 0,
    };
  });

  // Convert prices to USD cents using per-listing currency rate
  const ratePromises = new Map<number, Promise<number | null>>();
  return Promise.all(rawMapped.map(async (l) => {
    if (l.currencyId === 1) return l; // Already USD

    // Fetch rate for the listing's actual currency (not wallet assumption)
    if (!ratePromises.has(l.currencyId)) {
      ratePromises.set(l.currencyId, getExchangeRate(l.currencyId));
    }
    const rate = await ratePromises.get(l.currencyId)!;

    if (!rate || rate === 1) return l; // Can't convert — return as-is
    return {
      ...l,
      sellerPrice: Math.round(l.sellerPrice / rate),
      buyerPrice: Math.round(l.buyerPrice / rate),
      currencyId: 1,
    };
  }));
}

/**
 * GET /api/market/listings
 * Fetch the user's active Steam Market listings.
 * Without accountId (or accountId=all): aggregates all linked accounts.
 * With accountId=N: fetches only that account.
 */
router.get(
  "/listings",
  authMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const paramId = parseInt(req.query.accountId as string);
      const start = parseInt(req.query.start as string) || 0;
      const count = Math.min(parseInt(req.query.count as string) || 100, 100);

      if (paramId && !isNaN(paramId)) {
        // Single account mode
        const { rows } = await pool.query(
          "SELECT id, display_name FROM steam_accounts WHERE id = $1 AND user_id = $2",
          [paramId, req.userId]
        );
        if (!rows[0]) {
          res.status(404).json({ error: "Account not found" });
          return;
        }
        const listings = await fetchListingsForAccount(paramId, rows[0].display_name, start, count);
        res.json({ listings, totalCount: listings.length, start });
      } else {
        // All accounts mode: fetch in parallel, skip accounts without active sessions
        const { rows: accounts } = await pool.query(
          "SELECT id, display_name FROM steam_accounts WHERE user_id = $1",
          [req.userId]
        );
        const results = await Promise.all(
          accounts.map((a: { id: number; display_name: string }) =>
            fetchListingsForAccount(a.id, a.display_name, 0, 100)
          )
        );
        const listings = results.flat();
        res.json({ listings, totalCount: listings.length, start: 0 });
      }
    } catch (err) {
      next(err);
    }
  }
);

// ─── Price Endpoints ─────────────────────────────────────────────────────

// Get market price for an item
// GET /api/market/price/:marketHashName
router.get("/price/:marketHashName", async (req, res) => {
  try {
    const marketHashName = req.params.marketHashName as string;
    const price = await getMarketPrice(marketHashName);
    res.json(price);
  } catch (err) {
    console.error("Market price error:", err);
    res.status(500).json({ error: "Failed to get price" });
  }
});

// Get quick sell price (lowest listing - 1 smallest unit) in wallet currency
// GET /api/market/quickprice/:marketHashName
// Query: ?accountId= (optional, uses active account if omitted)
// Response: { sellerReceivesCents, stale, source, marketUrl, currencyId }
//   sellerReceivesCents is in the wallet's smallest unit (cents/kopecks/etc.)
//   stale=true when live Steam API failed and price is from fallback
router.get("/quickprice/:marketHashName", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const marketHashName = req.params.marketHashName as string;

    // Resolve wallet currency from account
    const accountId = req.query.accountId
      ? parseInt(req.query.accountId as string)
      : await SteamSessionService.getActiveAccountId(req.userId!);
    let walletCurrencyId = 1; // default USD
    if (accountId) {
      const wc = await getWalletCurrency(accountId);
      if (wc) walletCurrencyId = wc;
    }

    const result = await quickSellPrice(marketHashName, walletCurrencyId);
    if (result === null) {
      res.status(404).json({ error: "No market price available" });
      return;
    }
    const marketUrl = `https://steamcommunity.com/market/listings/730/${encodeURIComponent(marketHashName)}`;
    const info = getCurrencyInfo(result.currencyId);
    res.json({
      sellerReceivesCents: result.sellerReceivesCents,
      stale: result.source !== "live" && result.source !== "histogram",
      source: result.source,
      marketUrl,
      currencyId: result.currencyId,
      currencyCode: info?.code ?? "USD",
      currencySymbol: info?.symbol ?? "$",
    });
  } catch (err) {
    console.error("Quick price error:", err);
    res.status(500).json({ error: "Failed to get quick price" });
  }
});

/**
 * POST /api/market/refresh-prices
 * On-demand price refresh via Steam histogram API.
 * Call when user opens sell UI to get fresh prices for selected items.
 * Body: { names: string[], accountId?: number }
 * Returns prices in wallet currency with real-time buy/sell order data.
 */
router.post(
  "/refresh-prices",
  authMiddleware,
  validateBody(refreshPricesSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { names, accountId: bodyAccountId } = req.body;

      const accountId = bodyAccountId
        ?? await SteamSessionService.getActiveAccountId(req.userId!);
      let walletCurrencyId = 1;
      if (accountId) {
        const wc = await getWalletCurrency(accountId);
        if (wc) walletCurrencyId = wc;
      }

      const priceMap = await refreshPricesOnDemand(names, walletCurrencyId);

      // Build response: compute sellerReceivesCents (undercut lowest sell)
      const prices: Record<string, {
        sellerReceivesCents: number;
        highestBuyOrder: number;
        lowestSellOrder: number;
        currencyId: number;
        fresh: boolean;
      }> = {};

      for (const [name, p] of priceMap) {
        // Undercut: lowest listing - 1, minus fees
        const listing = Math.max(1, p.lowestSellOrder - 1);
        const valveFee = Math.max(1, Math.floor(listing * 0.05));
        const cs2Fee = Math.max(1, Math.floor(listing * 0.10));
        const sellerReceives = Math.max(1, listing - valveFee - cs2Fee);

        prices[name] = {
          sellerReceivesCents: sellerReceives,
          highestBuyOrder: p.highestBuyOrder,
          lowestSellOrder: p.lowestSellOrder,
          currencyId: p.currencyId,
          fresh: p.fresh,
        };
      }

      const info = getCurrencyInfo(walletCurrencyId);
      res.json({
        prices,
        currencyId: walletCurrencyId,
        currencyCode: info?.code ?? "USD",
        currencySymbol: info?.symbol ?? "$",
      });
    } catch (err) {
      console.error("Refresh prices error:", err);
      res.status(500).json({ error: "Failed to refresh prices" });
    }
  }
);

// @deprecated — Use POST /api/market/sell-operation instead
router.post(
  "/sell",
  authMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { assetId, priceInCents, accountId } = req.body;
      if (!assetId || !priceInCents) {
        res.status(400).json({ error: "assetId and priceInCents required" });
        return;
      }

      const resolvedAccountId = accountId
        ? parseInt(accountId)
        : await SteamSessionService.getActiveAccountId(req.userId!);

      const session = await SteamSessionService.getSession(resolvedAccountId);
      if (!session) {
        res.status(400).json({ error: "Steam session not configured." });
        return;
      }
      const isValid = await SteamSessionService.validateSession(session);
      if (!isValid) {
        next(new SessionExpiredError("Steam session expired. Please re-authenticate."));
        return;
      }

      const result = await sellItem(session, assetId, priceInCents, resolvedAccountId);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// @deprecated — Use POST /api/market/sell-operation instead
router.post(
  "/bulk-sell",
  authMiddleware,
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const { items, accountId } = req.body as {
        items: Array<{ assetId: string; priceInCents: number }>;
        accountId?: number;
      };

      if (!items || items.length === 0) {
        res.status(400).json({ error: "Items array required" });
        return;
      }

      if (items.length > 50) {
        res.status(400).json({ error: "Max 50 items per batch" });
        return;
      }

      const resolvedAccountId = accountId
        ?? await SteamSessionService.getActiveAccountId(req.userId!);

      const session = await SteamSessionService.getSession(resolvedAccountId);
      if (!session) {
        res.status(400).json({ error: "Steam session not configured." });
        return;
      }
      const isValid = await SteamSessionService.validateSession(session);
      if (!isValid) {
        next(new SessionExpiredError("Steam session expired. Please re-authenticate."));
        return;
      }

      const results = await bulkSell(session, items, resolvedAccountId);
      const succeeded = results.filter((r) => r.result.success).length;
      res.json({ results, succeeded, total: items.length });
    } catch (err) {
      next(err);
    }
  }
);


// ─── Arbitrage / Best Deals ──────────────────────────────────────────────────

/**
 * GET /api/market/deals
 * Find items where buying on an external market and selling on Steam is profitable.
 * Profit = (Steam_Price * 0.87) - External_Price  (87% = after Steam 13% commission)
 *
 * Query params:
 *   limit    — max results (default 50, max 100)
 *   minProfit — minimum profit % to include (default 5)
 */
router.get(
  "/deals",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const minProfit = parseFloat(req.query.minProfit as string) || 5;

      // Use current_prices table (always fresh) instead of 10M+ row price_history.
      // Compare external marketplace prices vs Steam to find arbitrage.
      const { rows } = await pool.query(
        `WITH steam_prices AS (
           SELECT cp.market_hash_name, cp.price_usd AS steam_price
           FROM current_prices cp
           INNER JOIN inventory_items ii ON ii.market_hash_name = cp.market_hash_name
           WHERE cp.source = 'steam' AND cp.price_usd > 0
         ),
         external_prices AS (
           SELECT cp.market_hash_name, cp.source, cp.price_usd AS external_price
           FROM current_prices cp
           INNER JOIN inventory_items ii ON ii.market_hash_name = cp.market_hash_name
           WHERE cp.source IN ('skinport','csfloat','dmarket','buff','bitskins','csmoney','youpin','lisskins')
             AND cp.price_usd > 0
         )
         SELECT DISTINCT ON (e.market_hash_name, e.source)
           e.market_hash_name,
           e.source AS buy_source,
           e.external_price AS buy_price,
           s.steam_price AS sell_price,
           ROUND((s.steam_price * 0.87 - e.external_price)::numeric, 2) AS profit_usd,
           ROUND(((s.steam_price * 0.87 / e.external_price - 1) * 100)::numeric, 1) AS profit_pct
         FROM external_prices e
         JOIN steam_prices s ON s.market_hash_name = e.market_hash_name
         WHERE (s.steam_price * 0.87 - e.external_price) > 0
           AND ((s.steam_price * 0.87 / e.external_price - 1) * 100) >= $1
         ORDER BY e.market_hash_name, e.source, profit_pct DESC
         LIMIT $2`,
        [minProfit, limit]
      );

      // Get icon URLs for the result items
      const names = rows.map((r: any) => r.market_hash_name);
      let iconMap = new Map<string, string>();
      if (names.length > 0) {
        const { rows: icons } = await pool.query(
          `SELECT DISTINCT ON (market_hash_name) market_hash_name, icon_url
           FROM inventory_items WHERE market_hash_name = ANY($1::text[])`,
          [names]
        );
        iconMap = new Map(icons.map((r: any) => [r.market_hash_name, r.icon_url]));
      }

      // Get buff_bid prices for alternative sell target
      let buffBidMap = new Map<string, number>();
      if (names.length > 0) {
        const { rows: buffBids } = await pool.query(
          `SELECT market_hash_name, price_usd FROM current_prices
           WHERE market_hash_name = ANY($1::text[]) AND source = 'buff_bid' AND price_usd > 0`,
          [names]
        );
        buffBidMap = new Map(buffBids.map((r: any) => [r.market_hash_name, parseFloat(r.price_usd)]));
      }

      const deals = rows.map((r: any) => {
        const links = getMarketplaceLinks(r.market_hash_name);
        return {
          marketHashName: r.market_hash_name,
          buySource: r.buy_source,
          buyPrice: parseFloat(r.buy_price),
          sellPrice: parseFloat(r.sell_price),
          profitUsd: parseFloat(r.profit_usd),
          profitPct: parseFloat(r.profit_pct),
          iconUrl: iconMap.get(r.market_hash_name) || null,
          buyUrl: links[r.buy_source] ?? null,
          buffBidPrice: buffBidMap.get(r.market_hash_name) ?? null,
        };
      });

      res.json({ deals, count: deals.length });
    } catch (err) {
      console.error("Market deals error:", err);
      res.status(500).json({ error: "Failed to load deals" });
    }
  }
);

export default router;
