import { Router, Response } from "express";
import axios from "axios";
import { pool } from "../db/pool.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
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
} from "../services/currency.js";

const router = Router();

// Store Steam session cookies for an account
// POST /api/market/session { sessionId, steamLoginSecure, accountId? }
router.post(
  "/session",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId, steamLoginSecure, accountId } = req.body;
      if (!sessionId || !steamLoginSecure) {
        res.status(400).json({ error: "sessionId and steamLoginSecure required" });
        return;
      }

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
  async (req: AuthRequest, res: Response) => {
    try {
      const { steamid, token, accountId } = req.body;
      if (!steamid || !token) {
        res.status(400).json({ error: "Invalid clientjstoken data. Must contain steamid and token." });
        return;
      }

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
        res.json({ detected: false, currencyId: 1, code: "USD", symbol: "$", rate: 1 });
        return;
      }

      res.json({ detected: true, ...info });
    } catch (err) {
      console.error("Wallet info error:", err);
      res.status(500).json({ error: "Failed to get wallet info" });
    }
  }
);

// ─── Sell Operations (async, tracked) ────────────────────────────────────

/**
 * POST /api/market/sell-operation
 * Create a new async sell operation with per-item tracking.
 * Body: { items: [{ assetId, marketHashName, priceCents }] }
 */
router.post(
  "/sell-operation",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { items, accountId } = req.body as {
        items: Array<{
          assetId: string;
          marketHashName: string;
          priceCents: number;
        }>;
        accountId?: number;
      };

      if (!items || !Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "Items array is required and must not be empty" });
        return;
      }

      if (items.length > 50) {
        res.status(400).json({ error: "Maximum 50 items per sell operation" });
        return;
      }

      for (const item of items) {
        if (!item.assetId || !item.priceCents || item.priceCents <= 0) {
          res.status(400).json({
            error: "Each item must have assetId and priceCents > 0",
          });
          return;
        }
      }

      // Resolve account
      const resolvedAccountId = accountId
        ?? await SteamSessionService.getActiveAccountId(req.userId!);

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

      // Validate session for this specific account
      await SteamSessionService.ensureValidSession(resolvedAccountId);

      const operationId = await createOperation(req.userId!, items, resolvedAccountId);

      res.json({
        operationId,
        status: "pending",
        totalItems: items.length,
      });
    } catch (err: unknown) {
      if ((err as any)?.code === "SESSION_EXPIRED") {
        res.status(401).json({
          error: "Steam session expired. Please re-authenticate.",
          code: "SESSION_EXPIRED",
        });
        return;
      }
      console.error("Sell operation create error:", err);
      res.status(500).json({ error: "Failed to create sell operation" });
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
  async (req: AuthRequest, res: Response) => {
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
        res.status(401).json({ error: "Steam session expired. Please re-authenticate.", code: "SESSION_EXPIRED" });
        return;
      }

      const result = await sellItem(session, assetId, priceInCents, resolvedAccountId);
      res.json(result);
    } catch (err) {
      console.error("Sell error:", err);
      res.status(500).json({ error: "Failed to sell item" });
    }
  }
);

// @deprecated — Use POST /api/market/sell-operation instead
router.post(
  "/bulk-sell",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
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
        res.status(401).json({ error: "Steam session expired. Please re-authenticate.", code: "SESSION_EXPIRED" });
        return;
      }

      const results = await bulkSell(session, items);
      const succeeded = results.filter((r) => r.result.success).length;
      res.json({ results, succeeded, total: items.length });
    } catch (err) {
      console.error("Bulk sell error:", err);
      res.status(500).json({ error: "Failed to bulk sell" });
    }
  }
);


export default router;
