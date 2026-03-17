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

export default router;
