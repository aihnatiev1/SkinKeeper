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
import { recalculateCostBasis } from "../services/profitLoss.js";
import { pool } from "../db/pool.js";

const router = Router();

// POST /api/transactions/sync — fetch from Steam and save to DB
router.post(
  "/sync",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      console.log(`[Transactions] Sync requested for user ${req.userId}`);
      const accountId = await SteamSessionService.getActiveAccountId(req.userId!);
      const session = await SteamSessionService.getSession(accountId);
      if (!session) {
        res.status(400).json({
          error: "Steam session not configured. Add your cookies first.",
        });
        return;
      }

      // Get wallet currency for price conversion
      const { rows: accRows } = await pool.query(
        "SELECT id, wallet_currency FROM steam_accounts WHERE id = $1",
        [accountId]
      );
      const steamAccountId = accRows[0]?.id;
      const walletCurrencyId = accRows[0]?.wallet_currency
        ?? (await pool.query("SELECT wallet_currency FROM users WHERE id = $1", [req.userId])).rows[0]?.wallet_currency
        ?? 1;
      console.log(`[Transactions] Wallet currency ID: ${walletCurrencyId}, accountId: ${steamAccountId}`);

      let totalFetched = 0;
      let start = 0;
      const batchSize = 100;

      // Fetch all pages with retry on 429
      for (let page = 0; page < 50; page++) {
        let transactions: Awaited<ReturnType<typeof fetchSteamTransactions>>["transactions"];
        let totalCount: number;
        let retries = 0;

        while (true) {
          try {
            const result = await fetchSteamTransactions(session, start, batchSize, walletCurrencyId);
            transactions = result.transactions;
            totalCount = result.totalCount;
            break;
          } catch (err: any) {
            if (err?.response?.status === 429 && retries < 3) {
              retries++;
              const delay = retries * 10000; // 10s, 20s, 30s
              console.log(`[Transactions] 429 rate limit, retry ${retries}/3 in ${delay / 1000}s`);
              await new Promise((r) => setTimeout(r, delay));
            } else {
              throw err;
            }
          }
        }

        if (transactions.length === 0) break;

        await saveTransactions(req.userId!, transactions, steamAccountId);
        totalFetched += transactions.length;
        start += batchSize;

        console.log(
          `[Transactions] Fetched ${totalFetched}/${totalCount} for user ${req.userId}`
        );

        if (start >= totalCount) break;

        // Rate limit pause (3s between pages)
        await new Promise((r) => setTimeout(r, 3000));
      }

      // Auto-recalculate cost basis after sync
      if (totalFetched > 0) {
        try {
          await recalculateCostBasis(req.userId!);
          console.log(`[Transactions] Cost basis recalculated for user ${req.userId}`);
        } catch (plErr) {
          console.error("[Transactions] Cost basis recalculation failed:", plErr);
        }
      }

      res.json({ success: true, fetched: totalFetched });
    } catch (err: any) {
      console.error("[Transactions] Sync error:", err?.response?.status ?? err?.message ?? err);
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
