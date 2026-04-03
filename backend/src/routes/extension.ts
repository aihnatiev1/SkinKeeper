import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import rateLimit from "express-rate-limit";

const router = Router();

// Rate limit price submissions: 20 per minute per user
const priceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: AuthRequest) => `ext:${req.userId || req.ip}`,
  message: { error: "Too many price submissions" },
});

// ─── POST /api/ext/prices — receive crowdsourced price data ───────────
router.post(
  "/prices",
  authMiddleware,
  priceLimiter,
  async (req: AuthRequest, res: Response) => {
    try {
      const { items } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "No items provided" });
        return;
      }

      // Cap at 200 items per request
      const batch = items.slice(0, 200);

      // Steam currency ID to USD conversion (approximate — for price normalization)
      // Full conversion happens in price job, here we just store raw
      let inserted = 0;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        for (const item of batch) {
          if (!item.market_hash_name || !item.price_cents || item.price_cents <= 0) continue;

          // Upsert into current_prices (crowdsourced source)
          // We tag these as 'ext_steam' to distinguish from server-fetched 'steam'
          const source = item.source === "steam_buyorder" ? "ext_buyorder" : "ext_steam";

          await client.query(
            `INSERT INTO current_prices (market_hash_name, source, price_usd, updated_at)
             VALUES ($1, $2, $3, NOW())
             ON CONFLICT (market_hash_name, source) DO UPDATE SET
               price_usd = CASE
                 -- Only update if the new data is fresher (within reason)
                 WHEN current_prices.updated_at < NOW() - INTERVAL '30 seconds'
                 THEN EXCLUDED.price_usd
                 ELSE current_prices.price_usd
               END,
               updated_at = CASE
                 WHEN current_prices.updated_at < NOW() - INTERVAL '30 seconds'
                 THEN NOW()
                 ELSE current_prices.updated_at
               END`,
            [
              item.market_hash_name,
              source,
              item.price_cents / 100, // cents to USD (assumes USD for now)
            ]
          );
          inserted++;
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      res.json({ ok: true, processed: inserted });
    } catch (err) {
      console.error("[Extension] Price ingestion error:", err);
      res.status(500).json({ error: "Failed to process prices" });
    }
  }
);

// ─── POST /api/ext/prices/bulk — return prices for a list of items ────
router.post(
  "/prices/bulk",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { names } = req.body;

      if (!Array.isArray(names) || names.length === 0) {
        res.status(400).json({ error: "No names provided" });
        return;
      }

      // Cap at 100 names
      const batch = names.slice(0, 100);

      const { rows } = await pool.query(
        `SELECT market_hash_name, source, price_usd
         FROM current_prices
         WHERE market_hash_name = ANY($1)`,
        [batch]
      );

      // Group by item name
      const result: Record<string, Record<string, number>> = {};
      for (const row of rows) {
        if (!result[row.market_hash_name]) {
          result[row.market_hash_name] = {};
        }
        // Map source names: steam -> steam, skinport -> skinport, etc.
        // ext_steam -> steam (merge crowdsourced with server data)
        const sourceKey = row.source.replace("ext_", "").replace("_buyorder", "");
        const key = sourceKey === "buyorder" ? "steam_buyorder" : sourceKey;
        result[row.market_hash_name][key] = Math.round(row.price_usd * 100); // USD to cents
      }

      res.json(result);
    } catch (err) {
      console.error("[Extension] Bulk price fetch error:", err);
      res.status(500).json({ error: "Failed to fetch prices" });
    }
  }
);

export default router;
