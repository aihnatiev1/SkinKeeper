import { Router, Request, Response } from "express";
import { getLatestPrices, getPriceHistory } from "../services/prices.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { batchPricesSchema, priceHistoryQuerySchema } from "../middleware/schemas.js";

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
router.get(
  "/:marketHashName/history",
  validateQuery(priceHistoryQuerySchema),
  async (req: Request, res: Response) => {
    try {
      const marketHashName = req.params.marketHashName as string;
      const days = req.query.days as unknown as number;
      const history = await getPriceHistory(marketHashName, days);
      res.json({ market_hash_name: marketHashName, history });
    } catch (err) {
      console.error("Price history error:", err);
      res.status(500).json({ error: "Failed to fetch price history" });
    }
  }
);

export default router;
