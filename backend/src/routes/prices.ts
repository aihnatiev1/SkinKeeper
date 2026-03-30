import { Router, Request, Response } from "express";
import { getLatestPrices, getPriceHistory, getSteamPriceHistory } from "../services/prices.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { batchPricesSchema, priceHistoryQuerySchema } from "../middleware/schemas.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { SteamSessionService } from "../services/steamSession.js";

const router = Router();

// POST /api/prices/batch — batch price lookup from DB (no Steam fallback)
// Prices are populated by bulk background jobs (Skinport, SteamAnalyst, DMarket)
// Body: { names: ["AK-47 | Redline", ...] }
router.post("/batch", validateBody(batchPricesSchema), async (req: Request, res: Response) => {
  try {
    const names: string[] = req.body.names;
    if (names.length === 0) { res.json({ prices: {} }); return; }
    const uniqueNames = [...new Set(names)].slice(0, 500);
    const priceMap = await getLatestPrices(uniqueNames);
    const result: Record<string, any> = {};
    for (const [name, prices] of priceMap) {
      result[name] = prices;
    }

    res.json({ prices: result });
  } catch (err) {
    console.error("Batch price error:", err);
    res.status(500).json({ error: "Failed to fetch prices" });
  }
});

// GET /api/prices/:marketHashName — current prices from all sources
router.get("/:marketHashName", async (req: Request, res: Response) => {
  try {
    const marketHashName = req.params.marketHashName as string;
    const priceMap = await getLatestPrices([marketHashName]);
    const prices = priceMap.get(marketHashName) ?? {};
    res.json({ market_hash_name: marketHashName, current_prices: prices });
  } catch (err) {
    console.error("Price fetch error:", err);
    res.status(500).json({ error: "Failed to fetch prices" });
  }
});

// GET /api/prices/:marketHashName/history?days=30
// ≤7 days: local DB (steam only). >7 days: proxied from Steam API (requires auth).
router.get(
  "/:marketHashName/history",
  validateQuery(priceHistoryQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const marketHashName = req.params.marketHashName as string;
      const days = req.query.days as unknown as number;

      if (days <= 7) {
        const history = await getPriceHistory(marketHashName, days);
        res.json({ market_hash_name: marketHashName, history });
        return;
      }

      // >7 days: need Steam session — run auth middleware inline
      await new Promise<void>((resolve) => authMiddleware(req as AuthRequest, res, () => resolve()));
      const authReq = req as AuthRequest;
      if (!authReq.userId) return; // auth middleware already sent 401

      try {
        const accountId = await SteamSessionService.getActiveAccountId(authReq.userId);
        const session = await SteamSessionService.getSession(accountId);
        if (!session) {
          // No Steam session — fall back to local 7-day data
          const history = await getPriceHistory(marketHashName, 7);
          res.json({ market_hash_name: marketHashName, history, partial: true, maxLocalDays: 7 });
          return;
        }

        const history = await getSteamPriceHistory(marketHashName, days, session);
        res.json({ market_hash_name: marketHashName, history });
      } catch (steamErr: any) {
        console.warn(`[PriceHistory] Steam API failed for "${marketHashName}":`, steamErr.message);
        // Fallback to local data
        const history = await getPriceHistory(marketHashName, 7);
        res.json({ market_hash_name: marketHashName, history, partial: true, maxLocalDays: 7 });
      }
    } catch (err) {
      console.error("Price history error:", err);
      res.status(500).json({ error: "Failed to fetch price history" });
    }
  }
);

export default router;
