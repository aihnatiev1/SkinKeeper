import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import {
  fetchSteamTransactions,
  saveTransactions,
  getTransactions,
  getTransactionItems,
  getTransactionStats,
} from "../services/transactions.js";
import { SteamSessionService } from "../services/steamSession.js";

const router = Router();

// POST /api/transactions/sync — fetch from Steam and save to DB
router.post(
  "/sync",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const session = await SteamSessionService.getSession(req.userId!);
      if (!session) {
        res.status(400).json({
          error: "Steam session not configured. Add your cookies first.",
        });
        return;
      }

      let totalFetched = 0;
      let start = 0;
      const batchSize = 100;

      // Fetch all pages
      for (let page = 0; page < 50; page++) {
        const { transactions, totalCount } = await fetchSteamTransactions(
          session,
          start,
          batchSize
        );

        if (transactions.length === 0) break;

        await saveTransactions(req.userId!, transactions);
        totalFetched += transactions.length;
        start += batchSize;

        console.log(
          `[Transactions] Fetched ${totalFetched}/${totalCount} for user ${req.userId}`
        );

        if (start >= totalCount) break;

        // Rate limit pause
        await new Promise((r) => setTimeout(r, 2000));
      }

      res.json({ success: true, fetched: totalFetched });
    } catch (err) {
      console.error("Transaction sync error:", err);
      res.status(500).json({ error: "Failed to sync transactions" });
    }
  }
);

// GET /api/transactions — list with filters
// ?type=buy|sell&item=AK-47...&from=2024-01-01&to=2024-12-31&limit=50&offset=0
router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await getTransactions(req.userId!, {
      type: req.query.type as "buy" | "sell" | undefined,
      marketHashName: req.query.item as string | undefined,
      dateFrom: req.query.from as string | undefined,
      dateTo: req.query.to as string | undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    });
    res.json(result);
  } catch (err) {
    console.error("Transaction list error:", err);
    res.status(500).json({ error: "Failed to get transactions" });
  }
});

// GET /api/transactions/items — unique item names for filter
router.get(
  "/items",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const items = await getTransactionItems(req.userId!);
      res.json({ items });
    } catch (err) {
      console.error("Transaction items error:", err);
      res.status(500).json({ error: "Failed to get items" });
    }
  }
);

// GET /api/transactions/stats?from=...&to=...
router.get(
  "/stats",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const stats = await getTransactionStats(
        req.userId!,
        req.query.from as string | undefined,
        req.query.to as string | undefined
      );
      res.json(stats);
    } catch (err) {
      console.error("Transaction stats error:", err);
      res.status(500).json({ error: "Failed to get stats" });
    }
  }
);


export default router;
