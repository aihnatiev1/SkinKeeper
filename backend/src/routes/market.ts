import { Router, Response, NextFunction } from "express";
import axios from "axios";
import { pool } from "../db/pool.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { sellOperationSchema, sellItemSchema, sessionCookiesSchema, clientTokenSchema } from "../middleware/schemas.js";
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

const router = Router();

// Store Steam session cookies for an account
// POST /api/market/session { sessionId, steamLoginSecure, accountId? }
router.post(
  "/session",
  authMiddleware,
  validateBody(sessionCookiesSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId, steamLoginSecure, accountId } = req.body;

      const resolvedAccountId = accountId
        ? parseInt(accountId)
        : await SteamSessionService.getActiveAccountId(req.userId!);

      await SteamSessionService.saveSession(resolvedAccountId, {
        sessionId,
        steamLoginSecure,
      });

      res.json({ success: true });
    } catch (err) {
      console.error("Session save error:", err);
      res.status(500).json({ error: "Failed to save session" });
    }
  }
);

// Store Steam clientjstoken for an account
// POST /api/market/clienttoken { steamid, token, accountId? }
router.post(
  "/clienttoken",
  authMiddleware,
  validateBody(clientTokenSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { steamid, token, accountId } = req.body;

      const resolvedAccountId = accountId
        ? parseInt(accountId)
        : await SteamSessionService.getActiveAccountId(req.userId!);

      // Exchange the access token for web cookies
      const session = await exchangeTokenForSession(steamid, token);
      if (!session) {
        await SteamSessionService.saveSession(resolvedAccountId, {
          sessionId: "",
          steamLoginSecure: "",
          accessToken: token,
        });
        res.json({
          success: true,
          method: "token_stored",
          message: "Token saved. Cookie exchange not available, some features may be limited.",
        });
        return;
      }

      await SteamSessionService.saveSession(resolvedAccountId, {
        sessionId: session.sessionId,
        steamLoginSecure: session.steamLoginSecure,
        accessToken: token,
      });

      res.json({ success: true, method: "cookies_obtained" });
    } catch (err) {
      console.error("Clienttoken save error:", err);
      res.status(500).json({ error: "Failed to save token" });
    }
  }
);

// GET /api/market/session/status?accountId=X — check if session is configured
router.get(
  "/session/status",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const paramId = parseInt(req.query.accountId as string);
      const accountId = paramId && !isNaN(paramId)
        ? paramId
        : await SteamSessionService.getActiveAccountId(req.userId!);

      const session = await SteamSessionService.getSession(accountId);
      const hasSession = !!(session?.sessionId && session?.steamLoginSecure);
      const hasToken = !!session?.accessToken;
      res.json({ hasSession, hasToken, configured: hasSession || hasToken });
    } catch (err) {
      res.status(500).json({ error: "Failed to check session" });
    }
  }
);

// Exchange Steam access token for web session cookies
async function exchangeTokenForSession(
  steamId: string,
  accessToken: string
): Promise<{ sessionId: string; steamLoginSecure: string } | null> {
  try {
    // Use Steam's IAuthenticationService to get web cookies
    await axios.get(
      "https://api.steampowered.com/IAuthenticationService/GenerateAccessTokenForApp/v1/",
      {
        params: {
          access_token: accessToken,
        },
        timeout: 10000,
      }
    );

    // Construct the steamLoginSecure cookie: steamId||accessToken
    const steamLoginSecure = `${steamId}||${accessToken}`;

    // Extract real sessionid from Steam's Set-Cookie header
    const sessionId = await SteamSessionService.extractSessionId(steamLoginSecure);
    if (!sessionId) {
      console.warn("[Session] Could not extract sessionid from Steam cookies, using fallback format");
      // Fall through to fallback below
    } else {
      return { sessionId, steamLoginSecure };
    }
  } catch {
    // Fallback: construct cookies directly from the access token
  }

  // Fallback: construct cookies with URL-encoded format
  try {
    const steamLoginSecure = `${steamId}%7C%7C${accessToken}`;
    const sessionId = await SteamSessionService.extractSessionId(steamLoginSecure);
    if (!sessionId) {
      console.warn("[Session] Could not extract sessionid from Steam even with fallback format");
      return null;
    }
    return { sessionId, steamLoginSecure };
  } catch {
    return null;
  }
}

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

      const operationId = await createOperation(req.userId!, items, activeAccountId);

      res.json({
        operationId,
        status: "pending",
        totalItems: items.length,
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
      currencyId: (l.currencyid as number) ?? 1,
      timeCreated: (l.time_created as number) ?? 0,
    };
  });

  // Convert prices to USD cents
  const walletInfo = await getWalletInfo(accountId);
  const rate = walletInfo?.rate ?? null;
  return rawMapped.map((l) => {
    if (!rate || rate === 1 || l.currencyId === 1) return l;
    return {
      ...l,
      sellerPrice: Math.round(l.sellerPrice / rate),
      buyerPrice: Math.round(l.buyerPrice / rate),
      currencyId: 1,
    };
  });
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

// Get quick sell price (lowest - 1 cent)
// GET /api/market/quickprice/:marketHashName
router.get("/quickprice/:marketHashName", async (req, res) => {
  try {
    const marketHashName = req.params.marketHashName as string;
    const price = await quickSellPrice(marketHashName);
    if (price === null) {
      res.status(404).json({ error: "No market price available" });
      return;
    }
    res.json({ sellerReceivesCents: price });
  } catch (err) {
    console.error("Quick price error:", err);
    res.status(500).json({ error: "Failed to get quick price" });
  }
});

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

      const results = await bulkSell(session, items);
      const succeeded = results.filter((r) => r.result.success).length;
      res.json({ results, succeeded, total: items.length });
    } catch (err) {
      next(err);
    }
  }
);


export default router;
