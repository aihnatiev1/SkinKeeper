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

const router = Router();

// Store Steam session cookies for a user
// POST /api/market/session { sessionId, steamLoginSecure }
router.post(
  "/session",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId, steamLoginSecure } = req.body;
      if (!sessionId || !steamLoginSecure) {
        res.status(400).json({ error: "sessionId and steamLoginSecure required" });
        return;
      }

      await SteamSessionService.saveSession(req.userId!, {
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

// Store Steam clientjstoken for a user
// POST /api/market/clienttoken { token JSON from steamcommunity.com/chat/clientjstoken }
router.post(
  "/clienttoken",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { steamid, token } = req.body;
      if (!steamid || !token) {
        res.status(400).json({ error: "Invalid clientjstoken data. Must contain steamid and token." });
        return;
      }

      // Exchange the access token for web cookies
      const session = await exchangeTokenForSession(steamid, token);
      if (!session) {
        // Fallback: store the token directly for future use
        await SteamSessionService.saveSession(req.userId!, {
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

      // Store the session cookies
      await SteamSessionService.saveSession(req.userId!, {
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

// GET /api/market/session/status — check if session is configured
router.get(
  "/session/status",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const session = await SteamSessionService.getSession(req.userId!);
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

// Sell single item
// POST /api/market/sell { assetId, priceInCents }
router.post(
  "/sell",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { assetId, priceInCents } = req.body;
      if (!assetId || !priceInCents) {
        res.status(400).json({ error: "assetId and priceInCents required" });
        return;
      }

      const session = await SteamSessionService.getSession(req.userId!);
      if (!session) {
        res.status(400).json({ error: "Steam session not configured." });
        return;
      }
      const isValid = await SteamSessionService.validateSession(session);
      if (!isValid) {
        res.status(401).json({ error: "Steam session expired. Please re-authenticate.", code: "SESSION_EXPIRED" });
        return;
      }

      const result = await sellItem(session, assetId, priceInCents);
      res.json(result);
    } catch (err) {
      console.error("Sell error:", err);
      res.status(500).json({ error: "Failed to sell item" });
    }
  }
);

// Bulk sell items
// POST /api/market/bulk-sell { items: [{ assetId, priceInCents }] }
router.post(
  "/bulk-sell",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { items } = req.body as {
        items: Array<{ assetId: string; priceInCents: number }>;
      };

      if (!items || items.length === 0) {
        res.status(400).json({ error: "Items array required" });
        return;
      }

      if (items.length > 50) {
        res.status(400).json({ error: "Max 50 items per batch" });
        return;
      }

      const session = await SteamSessionService.getSession(req.userId!);
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
