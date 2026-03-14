import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import {
  fetchSteamTransactions,
  saveTransactions,
  getTransactions,
  getTransactionItems,
  getTransactionStats,
  getLatestTxDate,
  countExistingTxIds,
} from "../services/transactions.js";
import { SteamSessionService } from "../services/steamSession.js";
import { recalculateCostBasis } from "../services/profitLoss.js";
import { pool } from "../db/pool.js";

const router = Router();

// POST /api/transactions/sync — fetch from Steam and save to DB
// Incremental: stops fetching when it hits transactions we already have
// Query param ?full=1 forces full resync of all pages
router.post(
  "/sync",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const startTime = Date.now();
      const forceFullSync = req.query.full === "1";
      // Optional ?accountId= lets the client sync a specific account (e.g. when scope chip differs from active account)
      const requestedAccountId = req.query.accountId ? parseInt(req.query.accountId as string) : null;
      console.log(`[Transactions] Sync requested for user ${req.userId}${forceFullSync ? " (FULL)" : ""}${requestedAccountId ? ` (accountId=${requestedAccountId})` : ""}`);

      let accountId: number;
      if (requestedAccountId) {
        // Verify this account belongs to the user
        const { rows } = await pool.query(
          "SELECT id FROM steam_accounts WHERE id = $1 AND user_id = $2",
          [requestedAccountId, req.userId]
        );
        if (!rows.length) {
          res.status(403).json({ error: "Account not found or access denied" });
          return;
        }
        accountId = requestedAccountId;
      } else {
        accountId = await SteamSessionService.getActiveAccountId(req.userId!);
      }

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

      // For incremental sync: get latest known tx date to estimate how far back we need to go
      const latestKnownDate = forceFullSync ? null : await getLatestTxDate(req.userId!, steamAccountId);
      if (latestKnownDate) {
        console.log(`[Transactions] Incremental sync — latest known tx: ${latestKnownDate.toISOString()}`);
      } else {
        console.log(`[Transactions] Full sync — no previous data`);
      }

      let totalFetched = 0;
      let totalNew = 0;
      let start = 0;
      const batchSize = 100;
      let consecutiveFullDupePages = 0;

      // Fetch pages with retry on 429, stop early on incremental sync
      for (let page = 0; page < 300; page++) {
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

        // Early termination check for incremental sync:
        // If all transactions on this page already exist in DB, we've caught up
        if (latestKnownDate && !forceFullSync) {
          const existingCount = await countExistingTxIds(
            req.userId!,
            transactions.map(tx => tx.id),
            steamAccountId
          );
          const newOnPage = transactions.length - existingCount;

          if (newOnPage === 0) {
            consecutiveFullDupePages++;
            console.log(`[Transactions] Page ${page}: all ${transactions.length} already exist (streak: ${consecutiveFullDupePages})`);
            // 2 consecutive pages of all-dupes = we've caught up for sure
            if (consecutiveFullDupePages >= 2) {
              console.log(`[Transactions] Incremental sync caught up — stopping early at page ${page}`);
              // Still save this page (updates icon_url etc.)
              await saveTransactions(req.userId!, transactions, steamAccountId);
              break;
            }
          } else {
            consecutiveFullDupePages = 0;
            totalNew += newOnPage;
          }
        }

        const inserted = await saveTransactions(req.userId!, transactions, steamAccountId);
        totalFetched += transactions.length;
        start += batchSize;

        console.log(
          `[Transactions] Page ${page}: ${transactions.length} fetched, ${inserted} inserted/updated (${totalFetched}/${totalCount} total)`
        );

        if (start >= totalCount) break;

        // Rate limit pause (1s between pages — Steam is fine with this)
        await new Promise((r) => setTimeout(r, 1000));
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

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[Transactions] Sync complete: ${totalFetched} fetched, ${totalNew} new in ${elapsed}s`);
      res.json({ success: true, fetched: totalFetched, newCount: totalNew, elapsed: parseFloat(elapsed) });
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
      accountId: req.query.accountId ? parseInt(req.query.accountId as string) : undefined,
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
        req.query.to as string | undefined,
        req.query.accountId ? parseInt(req.query.accountId as string) : undefined
      );
      res.json(stats);
    } catch (err) {
      console.error("Transaction stats error:", err);
      res.status(500).json({ error: "Failed to get stats" });
    }
  }
);


// DELETE /api/transactions?item=X — delete all transactions for one item
router.delete("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const item = (req.query.item as string | undefined)?.trim();
    if (!item) { res.status(400).json({ error: "item query param is required" }); return; }
    const { rowCount } = await pool.query(
      `DELETE FROM transactions WHERE user_id = $1 AND market_hash_name = $2`,
      [req.userId, item]
    );
    await recalculateCostBasis(req.userId!);
    res.json({ deleted: rowCount ?? 0 });
  } catch (err) {
    console.error("Bulk delete error:", err);
    res.status(500).json({ error: "Failed to delete transactions" });
  }
});

// PUT /api/transactions/:id — edit price/date/type of a single transaction
router.put("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { price_usd, date, type, portfolio_id } = req.body;
    const updates: string[] = [];
    const params: unknown[] = [req.userId, id];

    if (price_usd !== undefined) {
      const cents = Math.round(parseFloat(price_usd) * 100);
      if (isNaN(cents)) { res.status(400).json({ error: "Invalid price_usd" }); return; }
      updates.push(`price_cents = $${params.push(cents)}`);
    }
    if (date !== undefined) {
      const d = new Date(date);
      if (isNaN(d.getTime())) { res.status(400).json({ error: "Invalid date" }); return; }
      updates.push(`created_at = $${params.push(d)}`);
    }
    if (type !== undefined) {
      if (type !== "buy" && type !== "sell") { res.status(400).json({ error: "type must be buy or sell" }); return; }
      updates.push(`type = $${params.push(type)}`);
    }
    if (portfolio_id !== undefined) {
      updates.push(`portfolio_id = $${params.push(portfolio_id === null ? null : parseInt(portfolio_id))}`);
    }

    if (updates.length === 0) { res.status(400).json({ error: "Nothing to update" }); return; }

    const { rows, rowCount } = await pool.query(
      `UPDATE transactions SET ${updates.join(", ")}
       WHERE user_id = $1 AND id = $2
       RETURNING id, market_hash_name, type, price_cents, created_at, portfolio_id`,
      params
    );
    if (!rowCount) { res.status(404).json({ error: "Transaction not found" }); return; }
    await recalculateCostBasis(req.userId!);
    res.json(rows[0]);
  } catch (err) {
    console.error("Transaction update error:", err);
    res.status(500).json({ error: "Failed to update transaction" });
  }
});

// DELETE /api/transactions/:id — delete single transaction
router.delete("/:id", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const id = parseInt(req.params.id as string);
    const { rowCount } = await pool.query(
      `DELETE FROM transactions WHERE user_id = $1 AND id = $2`,
      [req.userId, id]
    );
    if (!rowCount) { res.status(404).json({ error: "Transaction not found" }); return; }
    await recalculateCostBasis(req.userId!);
    res.json({ success: true });
  } catch (err) {
    console.error("Transaction delete error:", err);
    res.status(500).json({ error: "Failed to delete transaction" });
  }
});

// POST /api/transactions/import — bulk import from CSV rows
// Body: { rows: Array<{ name, type, qty?, price_usd, date?, portfolio_id? }> }
router.post(
  "/import",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const rows = req.body.rows;
      if (!Array.isArray(rows) || rows.length === 0) {
        res.status(400).json({ error: "rows array is required" });
        return;
      }
      if (rows.length > 500) {
        res.status(400).json({ error: "Maximum 500 rows per import" });
        return;
      }

      const parsed: Array<{
        name: string;
        type: string;
        qty: number;
        priceCents: number;
        date: Date;
        portfolioId?: number;
      }> = [];

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const name = (r.name ?? "").trim();
        if (!name) { res.status(400).json({ error: `Row ${i + 1}: name is required` }); return; }
        const type = (r.type ?? "").trim().toLowerCase();
        if (type !== "buy" && type !== "sell") { res.status(400).json({ error: `Row ${i + 1}: type must be buy or sell` }); return; }
        const qty = r.qty !== undefined ? parseInt(r.qty) : 1;
        if (isNaN(qty) || qty < 1) { res.status(400).json({ error: `Row ${i + 1}: qty must be a positive integer` }); return; }
        const priceUsd = parseFloat(r.price_usd);
        if (isNaN(priceUsd) || priceUsd < 0) { res.status(400).json({ error: `Row ${i + 1}: price_usd must be a non-negative number` }); return; }
        const date = r.date ? new Date(r.date) : new Date();
        if (isNaN(date.getTime())) { res.status(400).json({ error: `Row ${i + 1}: invalid date` }); return; }
        const portfolioId = r.portfolio_id ? parseInt(r.portfolio_id) : undefined;

        parsed.push({ name, type, qty, priceCents: Math.round(priceUsd * 100), date, portfolioId });
      }

      // Expand qty > 1 into individual rows, insert all
      const client = await pool.connect();
      let inserted = 0;
      try {
        await client.query("BEGIN");
        for (const row of parsed) {
          for (let q = 0; q < row.qty; q++) {
            await client.query(
              `INSERT INTO transactions
                (user_id, tx_id, market_hash_name, type, price_cents, tx_date, portfolio_id, source, created_at)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 'csv_import', $6)`,
              [req.userId, `csv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`, row.name, row.type, row.priceCents, row.date, row.portfolioId ?? null]
            );
            inserted++;
          }
        }
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }

      await recalculateCostBasis(req.userId!);
      res.json({ imported: inserted });
    } catch (err) {
      console.error("CSV import error:", err);
      res.status(500).json({ error: "Import failed" });
    }
  }
);

export default router;
