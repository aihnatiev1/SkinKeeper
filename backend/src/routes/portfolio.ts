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
      // Get items — filtered by account if specified
      const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : null;
      const { rows: items } = await pool.query(
        accountId
          ? `SELECT i.market_hash_name
             FROM inventory_items i
             JOIN steam_accounts sa ON i.steam_account_id = sa.id
             WHERE sa.user_id = $1 AND sa.id = $2`
          : `SELECT i.market_hash_name
             FROM inventory_items i
             JOIN steam_accounts sa ON i.steam_account_id = sa.id
             WHERE sa.user_id = $1`,
        accountId ? [req.userId, accountId] : [req.userId]
      );

      const names = [...new Set(items.map((i) => i.market_hash_name))];
      const priceMap = await getLatestPrices(names);

      // Calculate total value using Steam price (consistent with inventory screen)
      let totalValue = 0;
      for (const item of items) {
        const prices = priceMap.get(item.market_hash_name);
        if (prices) {
          totalValue += prices.steam ?? prices.skinport ?? 0;
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
               AND ph.source = 'steam'
               AND ph.price_usd > 0
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
               AND ph.source = 'steam'
               AND ph.price_usd > 0
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

      // Get portfolio history using daily_pl_snapshots (pre-aggregated)
      const { rows: history } = await pool.query(
        `SELECT snapshot_date AS date,
                total_current_value_cents / 100.0 AS value
         FROM daily_pl_snapshots
         WHERE user_id = $1
           AND snapshot_date > CURRENT_DATE - 30
         ORDER BY snapshot_date`,
        [req.userId]
      );

      // Always include today's live value as the last point
      // so charts work from day 1 (no need to wait for daily cron)
      const todayStr = new Date().toISOString().slice(0, 10);
      const historyPoints = history.map((h) => ({
        date: h.date,
        value: parseFloat(h.value),
      }));
      const lastPoint = historyPoints[historyPoints.length - 1];
      if (!lastPoint || lastPoint.date !== todayStr) {
        historyPoints.push({ date: todayStr, value: totalValue });
      } else {
        // Update today's point with live value
        lastPoint.value = totalValue;
      }

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
        history: historyPoints,
      });
    } catch (err) {
      console.error("Portfolio error:", err);
      res.status(500).json({ error: "Failed to load portfolio" });
    }
  }
);

// GET /api/portfolio/pl — Portfolio P/L summary (PREMIUM)
// Optional ?accountId=X to filter by specific steam account
// Optional ?portfolioId=X to filter by named portfolio
router.get("/pl", authMiddleware, requirePremium, async (req: AuthRequest, res: Response) => {
  try {
    const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;
    const portfolioId = req.query.portfolioId ? parseInt(req.query.portfolioId as string) : undefined;
    const pl = await getPortfolioPL(req.userId!, accountId, portfolioId);
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
// Optional ?portfolioId=X to filter by named portfolio
router.get(
  "/pl/items",
  authMiddleware,
  requirePremium,
  async (req: AuthRequest, res: Response) => {
    try {
      const portfolioId = req.query.portfolioId ? parseInt(req.query.portfolioId as string) : undefined;
      const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;
      const limit = req.query.limit ? Math.min(parseInt(req.query.limit as string), 500) : 100;
      const offset = req.query.offset ? parseInt(req.query.offset as string) : 0;
      const result = await getItemsPL(req.userId!, portfolioId, accountId, limit, offset);
      res.json({ items: result.items, total: result.total, offset, limit });
    } catch (err) {
      console.error("Item P/L error:", err);
      res.status(500).json({ error: "Failed to load item P/L" });
    }
  }
);

// GET /api/portfolio/pl/history?days=30 — P/L history chart (PREMIUM)
router.get(
  "/pl/history",
  authMiddleware,
  requirePremium,
  async (req: AuthRequest, res: Response) => {
    try {
      const days = parseInt(req.query.days as string) || 30;
      const accountId = req.query.accountId ? parseInt(req.query.accountId as string) : undefined;
      const history = await getPLHistory(req.userId!, Math.min(days, 365), accountId);
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

// GET /api/portfolio/value-by-source
// Returns total inventory value broken down by price source
router.get(
  "/value-by-source",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT cp.source,
                SUM(cp.price_usd)::float AS total_value,
                COUNT(*)::int AS item_count
         FROM current_prices cp
         INNER JOIN inventory_items ii ON ii.market_hash_name = cp.market_hash_name
         INNER JOIN steam_accounts sa ON ii.steam_account_id = sa.id
         WHERE sa.user_id = $1 AND cp.price_usd > 0
           AND cp.source NOT IN ('csgotrader', 'buff_bid')
         GROUP BY cp.source
         ORDER BY total_value DESC`,
        [req.userId]
      );

      const sources = rows.map((r: any) => ({
        source: r.source,
        totalValue: r.total_value,
        itemCount: r.item_count,
      }));

      res.json({ sources });
    } catch (err) {
      console.error("Value by source error:", err);
      res.status(500).json({ error: "Failed to load value breakdown" });
    }
  }
);

// GET /api/portfolio/analytics
// Returns inventory breakdown: by rarity, by type, top stickers
router.get(
  "/analytics",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      // Rarity breakdown
      const { rows: rarityRows } = await pool.query(
        `SELECT COALESCE(i.rarity, 'Unknown') AS rarity,
                i.rarity_color,
                COUNT(*)::int AS count
         FROM inventory_items i
         JOIN steam_accounts sa ON i.steam_account_id = sa.id
         WHERE sa.user_id = $1
         GROUP BY i.rarity, i.rarity_color
         ORDER BY count DESC`,
        [req.userId]
      );

      // Type breakdown (by name prefix)
      const { rows: typeRows } = await pool.query(
        `SELECT
           CASE
             WHEN i.market_hash_name LIKE '★ %' AND (i.market_hash_name LIKE '%Gloves%' OR i.market_hash_name LIKE '%Wraps%' OR i.market_hash_name LIKE '%Hand%') THEN 'Gloves'
             WHEN i.market_hash_name LIKE '★ %' THEN 'Knives'
             WHEN i.market_hash_name LIKE 'Sticker |%' THEN 'Stickers'
             WHEN i.market_hash_name LIKE 'Sealed Graffiti%' OR i.market_hash_name LIKE 'Graffiti |%' THEN 'Graffiti'
             WHEN i.market_hash_name LIKE 'Music Kit%' OR i.market_hash_name LIKE 'StatTrak™ Music Kit%' THEN 'Music Kits'
             WHEN i.market_hash_name LIKE 'Patch |%' THEN 'Patches'
             WHEN i.market_hash_name LIKE 'Charm |%' THEN 'Charms'
             WHEN i.market_hash_name LIKE '%Case%' OR i.market_hash_name LIKE '%Capsule%' OR i.market_hash_name LIKE '%Package%' THEN 'Containers'
             WHEN i.market_hash_name LIKE 'Agent |%' THEN 'Agents'
             ELSE 'Weapons'
           END AS item_type,
           COUNT(*)::int AS count
         FROM inventory_items i
         JOIN steam_accounts sa ON i.steam_account_id = sa.id
         WHERE sa.user_id = $1
         GROUP BY item_type
         ORDER BY count DESC`,
        [req.userId]
      );

      // Top applied stickers by value (sticker names from inventory items + prices from current_prices)
      const { rows: topStickers } = await pool.query(
        `WITH applied_stickers AS (
           SELECT s->>'name' AS sticker_name,
                  COUNT(*)::int AS applied_count
           FROM inventory_items i
           JOIN steam_accounts sa ON i.steam_account_id = sa.id,
           jsonb_array_elements(
             CASE WHEN i.stickers IS NOT NULL AND i.stickers::text != '[]'
                  THEN i.stickers::jsonb
                  ELSE '[]'::jsonb
             END
           ) s
           WHERE sa.user_id = $1 AND s->>'name' IS NOT NULL
           GROUP BY s->>'name'
         )
         SELECT a.sticker_name,
                a.applied_count,
                COALESCE(MAX(cp.price_usd), 0)::float AS price
         FROM applied_stickers a
         LEFT JOIN current_prices cp
           ON cp.market_hash_name = 'Sticker | ' || a.sticker_name
           AND cp.price_usd > 0
         GROUP BY a.sticker_name, a.applied_count
         ORDER BY price DESC
         LIMIT 10`,
        [req.userId]
      );

      res.json({
        rarity: rarityRows.map((r: any) => ({
          rarity: r.rarity,
          color: r.rarity_color,
          count: r.count,
        })),
        types: typeRows.map((r: any) => ({
          type: r.item_type,
          count: r.count,
        })),
        topStickers: topStickers.map((r: any) => ({
          name: r.sticker_name,
          count: r.applied_count,
          price: r.price,
        })),
      });
    } catch (err) {
      console.error("Analytics error:", err);
      res.status(500).json({ error: "Failed to load analytics" });
    }
  }
);

export default router;

// ---- Named Portfolios CRUD (mounted at /api) ----
// Routes: GET/POST/PUT/DELETE /api/portfolios

export const portfoliosRouter = Router();

// GET /api/portfolios — list portfolios
portfoliosRouter.get("/portfolios", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, color, created_at AS "createdAt" FROM portfolios WHERE user_id = $1 ORDER BY created_at ASC`,
      [req.userId]
    );
    res.json({ portfolios: rows });
  } catch (err) {
    console.error("List portfolios error:", err);
    res.status(500).json({ error: "Failed to list portfolios" });
  }
});

// POST /api/portfolios — create portfolio
portfoliosRouter.post("/portfolios", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const name = (req.body.name ?? "").trim();
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const color = (req.body.color ?? "#6366F1").trim();
    const { rows } = await pool.query(
      `INSERT INTO portfolios (user_id, name, color) VALUES ($1, $2, $3)
       RETURNING id, name, color, created_at AS "createdAt"`,
      [req.userId, name, color]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error("Create portfolio error:", err);
    res.status(500).json({ error: "Failed to create portfolio" });
  }
});

// PUT /api/portfolios/:id — update portfolio
portfoliosRouter.put("/portfolios/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const name = (req.body.name ?? "").trim();
    const color = req.body.color;
    if (!name) { res.status(400).json({ error: "name is required" }); return; }
    const updates: string[] = ["name = $2"];
    const params: unknown[] = [req.userId, name];
    if (color) { updates.push(`color = $${params.length + 1}`); params.push(color.trim()); }
    params.push(id);
    const { rows } = await pool.query(
      `UPDATE portfolios SET ${updates.join(", ")} WHERE user_id = $1 AND id = $${params.length}
       RETURNING id, name, color, created_at AS "createdAt"`,
      params
    );
    if (!rows.length) { res.status(404).json({ error: "Portfolio not found" }); return; }
    res.json(rows[0]);
  } catch (err) {
    console.error("Update portfolio error:", err);
    res.status(500).json({ error: "Failed to update portfolio" });
  }
});

// DELETE /api/portfolios/:id — delete portfolio
portfoliosRouter.delete("/portfolios/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { rowCount } = await pool.query(
      `DELETE FROM portfolios WHERE id = $1 AND user_id = $2`,
      [id, req.userId]
    );
    if (!rowCount) { res.status(404).json({ error: "Portfolio not found" }); return; }
    res.json({ success: true });
  } catch (err) {
    console.error("Delete portfolio error:", err);
    res.status(500).json({ error: "Failed to delete portfolio" });
  }
});
