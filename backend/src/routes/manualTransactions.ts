import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { manualTransactionSchema, batchManualSchema, csvImportSchema } from "../middleware/schemas.js";
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
  validateBody(manualTransactionSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        marketHashName,
        priceCents,
        type,
        date,
        source,
        note,
        iconUrl,
        portfolioId,
      } = req.body;

      // Free tier: max 10 manual transactions (bumped from 5 to give users
      // enough data for P/L to feel meaningful before they hit the gate).
      const FREE_MANUAL_TX_LIMIT = 10;
      const { rows: userRows } = await pool.query(
        `SELECT is_premium FROM users WHERE id = $1`, [req.userId]
      );
      const isPremium = userRows[0]?.is_premium ?? false;
      if (!isPremium) {
        const { rows: countRows } = await pool.query(
          `SELECT COUNT(*)::int AS cnt FROM transactions WHERE user_id = $1 AND source = 'manual'`,
          [req.userId]
        );
        if (countRows[0].cnt >= FREE_MANUAL_TX_LIMIT) {
          res.status(403).json({
            error: "premium_required",
            code: "PREMIUM_REQUIRED",
            message: `Upgrade to PRO to add more than ${FREE_MANUAL_TX_LIMIT} manual transactions`,
          });
          return;
        }
      }

      const txId = `manual_${randomUUID()}`;
      const txDate = date ? new Date(date).toISOString() : new Date().toISOString();

      const { rows } = await pool.query(
        `INSERT INTO transactions (user_id, tx_id, type, market_hash_name, price_cents, tx_date, source, note, icon_url, portfolio_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, tx_id`,
        [req.userId, txId, type, marketHashName, priceCents, txDate, source, note || null, iconUrl || null, portfolioId ?? null]
      );

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
  validateBody(csvImportSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { rows: csvRows } = req.body;

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
          JOIN active_steam_accounts sa ON i.steam_account_id = sa.id
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
  validateBody(batchManualSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        marketHashName,
        priceCentsPerUnit,
        quantity,
        type,
        date,
        source,
        note,
        iconUrl,
        portfolioId,
      } = req.body;

      const qty = quantity;
      const txDate = date ? new Date(date).toISOString() : new Date().toISOString();
      const txIds: string[] = [];

      for (let i = 0; i < qty; i++) {
        const txId = `manual_${randomUUID()}`;
        await pool.query(
          `INSERT INTO transactions (user_id, tx_id, type, market_hash_name, price_cents, tx_date, source, note, icon_url, portfolio_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [req.userId, txId, type, marketHashName, priceCentsPerUnit, txDate, source, note || null, iconUrl || null, portfolioId ?? null]
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

/**
 * PUT /api/transactions/item/replace — Replace all transactions for an item
 * Deletes all existing transactions for user+item, inserts qty new ones.
 * Body: { marketHashName, qty, priceCentsPerUnit, type?, date?, portfolioId? }
 */
router.put(
  "/item/replace",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { marketHashName, qty, priceCentsPerUnit, type = "buy", date, portfolioId } = req.body;
      if (!marketHashName || typeof qty !== "number" || qty < 1 || qty > 100000) {
        res.status(400).json({ error: "Invalid parameters" }); return;
      }
      if (typeof priceCentsPerUnit !== "number" || priceCentsPerUnit < 0) {
        res.status(400).json({ error: "Invalid price" }); return;
      }
      const txDate = date ? new Date(date).toISOString() : new Date().toISOString();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `DELETE FROM transactions WHERE user_id = $1 AND market_hash_name = $2`,
          [req.userId, marketHashName]
        );
        for (let i = 0; i < qty; i++) {
          const txId = `manual_${randomUUID()}`;
          await client.query(
            `INSERT INTO transactions (user_id, tx_id, type, market_hash_name, price_cents, tx_date, source, portfolio_id)
             VALUES ($1, $2, $3, $4, $5, $6, 'manual', $7)`,
            [req.userId, txId, type, marketHashName, priceCentsPerUnit, txDate, portfolioId ?? null]
          );
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
      await recalculateCostBasis(req.userId!);
      res.json({ success: true });
    } catch (err) {
      console.error("[ManualTx] Replace error:", err);
      res.status(500).json({ error: "Failed to replace transactions" });
    }
  }
);

export default router;
