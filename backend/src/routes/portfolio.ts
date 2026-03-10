import { Router, Response } from "express";
import { pool } from "../db/pool.js";
import { authMiddleware, requirePremium, AuthRequest } from "../middleware/auth.js";
import { getLatestPrices } from "../services/prices.js";
import {
  getPortfolioPL,
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

      // Get value from 24h ago and 7d ago
      const { rows: hist24h } = await pool.query(
        `SELECT DISTINCT ON (market_hash_name)
           market_hash_name, price_usd
         FROM price_history
         WHERE market_hash_name = ANY($1)
           AND source = 'skinport'
           AND recorded_at < NOW() - INTERVAL '24 hours'
         ORDER BY market_hash_name, recorded_at DESC`,
        [names]
      );

      const { rows: hist7d } = await pool.query(
        `SELECT DISTINCT ON (market_hash_name)
           market_hash_name, price_usd
         FROM price_history
         WHERE market_hash_name = ANY($1)
           AND source = 'skinport'
           AND recorded_at < NOW() - INTERVAL '7 days'
         ORDER BY market_hash_name, recorded_at DESC`,
        [names]
      );

      const oldPrices24h = new Map(
        hist24h.map((r) => [r.market_hash_name, parseFloat(r.price_usd)])
      );
      const oldPrices7d = new Map(
        hist7d.map((r) => [r.market_hash_name, parseFloat(r.price_usd)])
      );

      let totalValue24hAgo = 0;
      let totalValue7dAgo = 0;
      for (const item of items) {
        totalValue24hAgo += oldPrices24h.get(item.market_hash_name) ?? 0;
        totalValue7dAgo += oldPrices7d.get(item.market_hash_name) ?? 0;
      }

      const change24h = totalValue - totalValue24hAgo;
      const change7d = totalValue - totalValue7dAgo;

      // Get portfolio history (daily snapshots)
      const { rows: history } = await pool.query(
        `SELECT date_trunc('day', ph.recorded_at) AS date,
                SUM(ph.price_usd) AS value
         FROM price_history ph
         WHERE ph.market_hash_name = ANY($1)
           AND ph.source = 'skinport'
           AND ph.recorded_at > NOW() - INTERVAL '30 days'
         GROUP BY date
         ORDER BY date`,
        [names]
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
router.get("/pl", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const pl = await getPortfolioPL(req.userId!);
    res.json(pl);
  } catch (err) {
    console.error("Portfolio P/L error:", err);
    res.status(500).json({ error: "Failed to load P/L" });
  }
});

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
