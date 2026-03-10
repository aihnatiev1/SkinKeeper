import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { recalculateCostBasis } from "../services/profitLoss.js";
import { randomUUID } from "crypto";

const router = Router();

/**
 * POST /api/transactions/manual — Add a manual buy/sell transaction
 * Body: { marketHashName, priceCents, type?, date?, source?, note?, iconUrl? }
 */
router.post(
  "/manual",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        marketHashName,
        priceCents,
        type = "buy",
        date,
        source = "manual",
        note,
        iconUrl,
      } = req.body;

      if (!marketHashName || !priceCents || priceCents <= 0) {
        res.status(400).json({ error: "marketHashName and priceCents > 0 are required" });
        return;
      }

      if (type !== "buy" && type !== "sell") {
        res.status(400).json({ error: "type must be 'buy' or 'sell'" });
        return;
      }

      const txId = `manual_${randomUUID()}`;
      const txDate = date ? new Date(date).toISOString() : new Date().toISOString();

      const { rows } = await pool.query(
        `INSERT INTO transactions (user_id, tx_id, type, market_hash_name, price_cents, tx_date, source, note, icon_url)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, tx_id`,
        [req.userId, txId, type, marketHashName, priceCents, txDate, source, note || null, iconUrl || null]
      );

      // Recalculate cost basis
      await recalculateCostBasis(req.userId!);

      res.json({ success: true, id: rows[0].id, txId: rows[0].tx_id });
    } catch (err) {
      console.error("[ManualTx] Error:", err);
      res.status(500).json({ error: "Failed to add transaction" });
    }
  }
);

/**
 * DELETE /api/transactions/manual/:txId — Delete a manual transaction
 */
router.delete(
  "/manual/:txId",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { txId } = req.params;

      // Only allow deleting manual transactions
      const { rowCount } = await pool.query(
        `DELETE FROM transactions WHERE user_id = $1 AND tx_id = $2 AND source = 'manual'`,
        [req.userId, txId]
      );

      if (rowCount === 0) {
        res.status(404).json({ error: "Manual transaction not found" });
        return;
      }

      await recalculateCostBasis(req.userId!);
      res.json({ success: true });
    } catch (err) {
      console.error("[ManualTx] Delete error:", err);
      res.status(500).json({ error: "Failed to delete transaction" });
    }
  }
);

/**
 * GET /api/transactions/manual?marketHashName=... — Get manual transactions for an item
 */
router.get(
  "/manual",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { marketHashName } = req.query;

      let query = `SELECT id, tx_id, type, market_hash_name, price_cents, tx_date, source, note
                    FROM transactions
                    WHERE user_id = $1 AND source != 'steam'`;
      const params: any[] = [req.userId];

      if (marketHashName) {
        query += ` AND market_hash_name = $2`;
        params.push(marketHashName);
      }

      query += ` ORDER BY tx_date DESC`;

      const { rows } = await pool.query(query, params);
      res.json({ transactions: rows });
    } catch (err) {
      console.error("[ManualTx] List error:", err);
      res.status(500).json({ error: "Failed to get manual transactions" });
    }
  }
);

/**
 * POST /api/transactions/import-csv — Bulk import from CSV
 * Body: { rows: Array<{ marketHashName, priceCents, type?, date?, source?, note? }> }
 */
router.post(
  "/import-csv",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { rows: csvRows } = req.body;

      if (!Array.isArray(csvRows) || csvRows.length === 0) {
        res.status(400).json({ error: "rows array is required" });
        return;
      }

      if (csvRows.length > 500) {
        res.status(400).json({ error: "Maximum 500 rows per import" });
        return;
      }

      let imported = 0;
      let skipped = 0;

      for (const row of csvRows) {
        const { marketHashName, priceCents, type = "buy", date, source = "csv", note } = row;

        if (!marketHashName || !priceCents || priceCents <= 0) {
          skipped++;
          continue;
        }

        const txId = `csv_${randomUUID()}`;
        const txDate = date ? new Date(date).toISOString() : new Date().toISOString();

        await pool.query(
          `INSERT INTO transactions (user_id, tx_id, type, market_hash_name, price_cents, tx_date, source, note)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [req.userId, txId, type === "sell" ? "sell" : "buy", marketHashName, Math.round(priceCents), txDate, source, note || null]
        );
        imported++;
      }

      // Recalculate cost basis after bulk import
      await recalculateCostBasis(req.userId!);

      res.json({ success: true, imported, skipped });
    } catch (err) {
      console.error("[CSVImport] Error:", err);
      res.status(500).json({ error: "Failed to import CSV" });
    }
  }
);

/**
 * GET /api/transactions/search-items?q=ak-47 — Search item names for autocomplete
 * Searches inventory items + price history for matching names
 */
router.get(
  "/search-items",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const q = (req.query.q as string || "").trim();
      if (q.length < 2) {
        res.json({ items: [] });
        return;
      }

      const pattern = `%${q}%`;

      // Search user's inventory + their transaction history + cost basis (all small tables)
      // Avoids full scan of price_history which can be huge
      const { rows } = await pool.query(
        `(
          SELECT DISTINCT market_hash_name, icon_url
          FROM inventory_items i
          JOIN steam_accounts sa ON i.steam_account_id = sa.id
          WHERE sa.user_id = $1 AND i.market_hash_name ILIKE $2
          LIMIT 20
        )
        UNION
        (
          SELECT DISTINCT market_hash_name, icon_url
          FROM transactions
          WHERE user_id = $1 AND market_hash_name ILIKE $2
          LIMIT 20
        )
        UNION
        (
          SELECT DISTINCT market_hash_name, NULL as icon_url
          FROM item_cost_basis
          WHERE user_id = $1 AND market_hash_name ILIKE $2
          LIMIT 20
        )
        ORDER BY market_hash_name
        LIMIT 30`,
        [req.userId, pattern]
      );

      res.json({
        items: rows.map((r) => ({
          marketHashName: r.market_hash_name,
          iconUrl: r.icon_url || null,
        })),
      });
    } catch (err) {
      console.error("[SearchItems] Error:", err);
      res.status(500).json({ error: "Failed to search items" });
    }
  }
);

/**
 * POST /api/transactions/manual/batch — Add multiple units of same item
 * Body: { marketHashName, priceCentsPerUnit, quantity, type?, date?, source?, note?, iconUrl? }
 */
router.post(
  "/manual/batch",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        marketHashName,
        priceCentsPerUnit,
        quantity = 1,
        type = "buy",
        date,
        source = "manual",
        note,
        iconUrl,
      } = req.body;

      if (!marketHashName || !priceCentsPerUnit || priceCentsPerUnit <= 0) {
        res.status(400).json({ error: "marketHashName and priceCentsPerUnit > 0 required" });
        return;
      }

      const qty = Math.max(1, Math.min(quantity, 10000));
      const txDate = date ? new Date(date).toISOString() : new Date().toISOString();
      const txIds: string[] = [];

      for (let i = 0; i < qty; i++) {
        const txId = `manual_${randomUUID()}`;
        await pool.query(
          `INSERT INTO transactions (user_id, tx_id, type, market_hash_name, price_cents, tx_date, source, note, icon_url)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [req.userId, txId, type, marketHashName, priceCentsPerUnit, txDate, source, note || null, iconUrl || null]
        );
        txIds.push(txId);
      }

      await recalculateCostBasis(req.userId!);

      res.json({ success: true, quantity: qty, txIds });
    } catch (err) {
      console.error("[ManualTx] Batch error:", err);
      res.status(500).json({ error: "Failed to add transactions" });
    }
  }
);

export default router;
