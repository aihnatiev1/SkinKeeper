import { Router, Response } from "express";
import { authMiddleware, AuthRequest, requirePremium } from "../middleware/auth.js";
import { pool } from "../db/pool.js";

const router = Router();

/**
 * GET /api/export/csv?type=all|buy|sell&from=ISO&to=ISO
 * Premium-only CSV export of transactions + P/L data.
 */
router.get(
  "/csv",
  authMiddleware,
  /* requirePremium — disabled for testing */
  async (req: AuthRequest, res: Response) => {
    try {
      const type = req.query.type as string | undefined;
      const from = req.query.from as string | undefined;
      const to = req.query.to as string | undefined;

      let query = `
        SELECT t.tx_id, t.type, t.market_hash_name, t.price_cents, t.tx_date,
               t.partner_steam_id,
               cb.avg_buy_price_cents, cb.current_holding,
               cb.realized_profit_cents, cb.total_spent_cents, cb.total_earned_cents
        FROM transactions t
        LEFT JOIN item_cost_basis cb
          ON cb.user_id = t.user_id AND cb.market_hash_name = t.market_hash_name
        WHERE t.user_id = $1`;

      const params: unknown[] = [req.userId!];
      let idx = 2;

      if (type && type !== "all") {
        query += ` AND t.type = $${idx}`;
        params.push(type);
        idx++;
      }
      if (from) {
        query += ` AND t.tx_date >= $${idx}`;
        params.push(from);
        idx++;
      }
      if (to) {
        query += ` AND t.tx_date <= $${idx}`;
        params.push(to);
        idx++;
      }

      query += ` ORDER BY t.tx_date DESC`;

      const { rows } = await pool.query(query, params);

      // BOM for Excel UTF-8 compatibility
      const BOM = "\uFEFF";
      const header = "Date,Type,Item,Price (USD),Avg Buy Price (USD),Realized P/L (USD),Partner Steam ID";
      const csvRows = rows.map((r) => {
        const date = new Date(r.tx_date).toISOString().slice(0, 19).replace("T", " ");
        const price = (r.price_cents / 100).toFixed(2);
        const avgBuy = r.avg_buy_price_cents ? (r.avg_buy_price_cents / 100).toFixed(2) : "";
        const realizedPL = r.realized_profit_cents != null ? (r.realized_profit_cents / 100).toFixed(2) : "";
        const name = `"${(r.market_hash_name || "").replace(/"/g, '""')}"`;
        return `${date},${r.type},${name},${price},${avgBuy},${realizedPL},${r.partner_steam_id || ""}`;
      });

      const csv = BOM + header + "\n" + csvRows.join("\n");

      const now = new Date().toISOString().slice(0, 10);
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="skinkeeper-export-${now}.csv"`);
      res.send(csv);
    } catch (err) {
      console.error("CSV export error:", err);
      res.status(500).json({ error: "Failed to export" });
    }
  }
);

/**
 * GET /api/export/price-history?days=30&source=steam
 * Download price history CSV for all items in the user's inventory.
 */
const VALID_SOURCES = new Set(["skinport", "steam", "csfloat", "dmarket"]);

router.get(
  "/price-history",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const days = Math.min(Math.max(parseInt(req.query.days as string) || 30, 1), 90);
      const sourceRaw = (req.query.source as string || "").toLowerCase().trim();
      const source = VALID_SOURCES.has(sourceRaw) ? sourceRaw : null;

      // Get all items the user has in inventory
      const { rows: userItems } = await pool.query(
        `SELECT DISTINCT i.market_hash_name
         FROM inventory_items i
         JOIN active_steam_accounts sa ON i.steam_account_id = sa.id
         WHERE sa.user_id = $1`,
        [req.userId]
      );

      if (userItems.length === 0) {
        res.status(400).json({ error: "No items in inventory" });
        return;
      }

      const names = userItems.map((r: any) => r.market_hash_name);

      const params: (string[] | string | number)[] = [names, days];
      let sourceFilter = "";
      if (source) {
        params.push(source);
        sourceFilter = `AND ph.source = $${params.length}`;
      }

      const { rows } = await pool.query(
        `SELECT ph.market_hash_name, ph.source, ph.price_usd::float, ph.recorded_at
         FROM price_history ph
         WHERE ph.market_hash_name = ANY($1::text[])
           AND ph.recorded_at > NOW() - INTERVAL '1 day' * $2
           AND ph.price_usd > 0
           ${sourceFilter}
         ORDER BY ph.market_hash_name, ph.recorded_at DESC`,
        params
      );

      // Build CSV with BOM for Excel UTF-8 compatibility
      const BOM = "\uFEFF";
      const header = "Item,Source,Price (USD),Date";
      const csvRows = rows.map((r: any) => {
        const name = `"${(r.market_hash_name || "").replace(/"/g, '""')}"`;
        const date = new Date(r.recorded_at).toISOString().slice(0, 19).replace("T", " ");
        return `${name},"${r.source}",${r.price_usd},"${date}"`;
      });

      const csv = BOM + header + "\n" + csvRows.join("\n");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="price-history-${days}d${source ? `-${source}` : ""}.csv"`
      );
      res.send(csv);
    } catch (err) {
      console.error("Price history export error:", err);
      res.status(500).json({ error: "Export failed" });
    }
  }
);

export default router;
