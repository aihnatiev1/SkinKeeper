import { Router, Request, Response } from "express";
import axios from "axios";
import { getLatestPrices, getPriceHistory } from "../services/prices.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { batchPricesSchema, priceHistoryQuerySchema } from "../middleware/schemas.js";

const router = Router();

// Fetch single item price from Steam Market (no auth needed)
async function fetchSteamMarketPrice(name: string): Promise<number | null> {
  try {
    const { data } = await axios.get(
      "https://steamcommunity.com/market/priceoverview/",
      {
        params: { appid: 730, currency: 1, market_hash_name: name },
        timeout: 5000,
        headers: { "User-Agent": "Mozilla/5.0" },
      }
    );
    if (data?.success && data.median_price) {
      return parseFloat(data.median_price.replace("$", "").replace(",", ""));
    }
    if (data?.success && data.lowest_price) {
      return parseFloat(data.lowest_price.replace("$", "").replace(",", ""));
    }
    return null;
  } catch {
    return null;
  }
}

// POST /api/prices/batch — batch price lookup with Steam Market fallback
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

    // Find items with no prices in DB — fallback to Steam Market
    const missing = uniqueNames.filter((n) => !result[n] || (!result[n].steam && !result[n].skinport));
    // Rate-limited: max 5 Steam lookups per batch
    for (const name of missing.slice(0, 5)) {
      const price = await fetchSteamMarketPrice(name);
      if (price) {
        result[name] = { ...result[name], steam: price };
      }
      // Small delay to avoid Steam rate limit
      if (missing.length > 1) await new Promise((r) => setTimeout(r, 500));
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
