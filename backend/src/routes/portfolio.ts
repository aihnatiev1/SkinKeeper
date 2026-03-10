import { Router, Response } from "express";
import { pool } from "../db/pool.js";
import { authMiddleware, requirePremium, AuthRequest } from "../middleware/auth.js";
import { getLatestPrices } from "../services/prices.js";
import {
  getPortfolioPL,
  getPortfolioPLByAccount,
  getItemsPL,
  getPLHistory,
  recalculateCostBasis,
} from "../services/profitLoss.js";

const router = Router();

// GET /api/portfolio/summary
router.get(
  "/summary",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      // Get all items for user
      const { rows: items } = await pool.query(
        `SELECT i.market_hash_name
         FROM inventory_items i
         JOIN steam_accounts sa ON i.steam_account_id = sa.id
         WHERE sa.user_id = $1`,
        [req.userId]
      );

      const names = [...new Set(items.map((i) => i.market_hash_name))];
      const priceMap = await getLatestPrices(names);

      // Calculate total value (using skinport price first, then steam)
      let totalValue = 0;
      for (const item of items) {
        const prices = priceMap.get(item.market_hash_name);
        if (prices) {
          totalValue += prices.skinport ?? prices.steam ?? 0;
        }
      }

      // Get value from 24h ago and 7d ago using LATERAL for fast index lookups
      const [{ rows: hist24h }, { rows: hist7d }] = await Promise.all([
        pool.query(
          `WITH names AS (SELECT unnest($1::text[]) AS market_hash_name)
           SELECT n.market_hash_name, lp.price_usd
           FROM names n
           JOIN LATERAL (
             SELECT price_usd FROM price_history ph
             WHERE ph.market_hash_name = n.market_hash_name
               AND ph.source = 'skinport'
               AND ph.recorded_at < NOW() - INTERVAL '24 hours'
             ORDER BY ph.recorded_at DESC LIMIT 1
           ) lp ON true`,
          [names]
        ),
        pool.query(
          `WITH names AS (SELECT unnest($1::text[]) AS market_hash_name)
           SELECT n.market_hash_name, lp.price_usd
           FROM names n
           JOIN LATERAL (
             SELECT price_usd FROM price_history ph
             WHERE ph.market_hash_name = n.market_hash_name
               AND ph.source = 'skinport'
               AND ph.recorded_at < NOW() - INTERVAL '7 days'
             ORDER BY ph.recorded_at DESC LIMIT 1
           ) lp ON true`,
          [names]
        ),
      ]);

      const oldPrices24h = new Map(
        hist24h.map((r: any) => [r.market_hash_name, parseFloat(r.price_usd)])
      );
      const oldPrices7d = new Map(
        hist7d.map((r: any) => [r.market_hash_name, parseFloat(r.price_usd)])
      );

      let totalValue24hAgo = 0;
      let totalValue7dAgo = 0;
      for (const item of items) {
        totalValue24hAgo += oldPrices24h.get(item.market_hash_name) ?? 0;
        totalValue7dAgo += oldPrices7d.get(item.market_hash_name) ?? 0;
      }

      const change24h = totalValue - totalValue24hAgo;
      const change7d = totalValue - totalValue7dAgo;

      // Get portfolio history using daily_pl_snapshots (pre-aggregated) instead of scanning price_history
      const { rows: history } = await pool.query(
        `SELECT snapshot_date AS date,
                total_current_value_cents / 100.0 AS value
         FROM daily_pl_snapshots
         WHERE user_id = $1
           AND snapshot_date > CURRENT_DATE - 30
         ORDER BY snapshot_date`,
        [req.userId]
      );

      res.json({
        total_value: Math.round(totalValue * 100) / 100,
        change_24h: Math.round(change24h * 100) / 100,
        change_24h_pct:
          totalValue24hAgo > 0
            ? Math.round((change24h / totalValue24hAgo) * 10000) / 100
            : 0,
        change_7d: Math.round(change7d * 100) / 100,
        change_7d_pct:
          totalValue7dAgo > 0
            ? Math.round((change7d / totalValue7dAgo) * 10000) / 100
            : 0,
        item_count: items.length,
        history: history.map((h) => ({
          date: h.date,
          value: parseFloat(h.value),
        })),
      });
    } catch (err) {
      console.error("Portfolio error:", err);
      res.status(500).json({ error: "Failed to load portfolio" });
    }
  }
);

// GET /api/portfolio/pl — Portfolio P/L summary (FREE)
// Optional ?accountId=X to filter by specific steam account
router.get("/pl", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;
    const pl = await getPortfolioPL(req.userId!, accountId);
    res.json(pl);
  } catch (err) {
    console.error("Portfolio P/L error:", err);
    res.status(500).json({ error: "Failed to load P/L" });
  }
});

// GET /api/portfolio/pl/by-account — Per-account P/L breakdown (PREMIUM)
router.get(
  "/pl/by-account",
  authMiddleware,
  // requirePremium,
  async (req: AuthRequest, res: Response) => {
    try {
      const accounts = await getPortfolioPLByAccount(req.userId!);
      res.json({ accounts });
    } catch (err) {
      console.error("Per-account P/L error:", err);
      res.status(500).json({ error: "Failed to load per-account P/L" });
    }
  }
);

// GET /api/portfolio/pl/items — Per-item P/L (PREMIUM)
// TODO: re-enable requirePremium after testing
router.get(
  "/pl/items",
  authMiddleware,
  // requirePremium,
  async (req: AuthRequest, res: Response) => {
    try {
      const items = await getItemsPL(req.userId!);
      res.json({ items });
    } catch (err) {
      console.error("Item P/L error:", err);
      res.status(500).json({ error: "Failed to load item P/L" });
    }
  }
);

// GET /api/portfolio/pl/history?days=30 — P/L history chart (PREMIUM)
// TODO: re-enable requirePremium after testing
router.get(
  "/pl/history",
  authMiddleware,
  // requirePremium,
  async (req: AuthRequest, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const history = await getPLHistory(req.userId!, Math.min(days, 365));
      res.json({ history });
    } catch (err) {
      console.error("P/L history error:", err);
      res.status(500).json({ error: "Failed to load P/L history" });
    }
  }
);

// POST /api/portfolio/pl/recalculate — Force recalculate cost basis (FREE)
router.post(
  "/pl/recalculate",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      await recalculateCostBasis(req.userId!);
      const pl = await getPortfolioPL(req.userId!);
      res.json(pl);
    } catch (err) {
      console.error("P/L recalculate error:", err);
      res.status(500).json({ error: "Failed to recalculate P/L" });
    }
  }
);

export default router;
