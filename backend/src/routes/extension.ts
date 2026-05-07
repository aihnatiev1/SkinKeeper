import { Router, Response } from "express";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { pool } from "../db/pool.js";
import { fetchInspectData } from "../services/inspect.js";
import rateLimit from "express-rate-limit";

const router = Router();

// Rate limit price submissions: 20 per minute per user/IP
const priceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: AuthRequest) => `ext:${req.userId || req.ip || 'anon'}`,
  message: { error: "Too many price submissions" },
  validate: false,
});

// Stricter rate limit for anonymous: 10 per minute per IP
const anonPriceLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `ext-anon:${req.ip}`,
  message: { error: "Too many price submissions" },
  validate: false,
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

// ─── POST /api/ext/prices/anon — DISABLED ─────────────────────────────
// Previously accepted unauthenticated price submissions and wrote them to
// current_prices, which feeds portfolio totals, paywall teasers, and alert
// thresholds. An attacker rotating IPs through the 10/min limiter could
// walk prices in either direction and corrupt the authoritative table.
//
// Crowdsourced prices are no longer promoted to current_prices. The
// authoritative pricing pipeline (backend scrapers + CSFloat / Skinport /
// DMarket) is unaffected. Endpoint kept as a 200 no-op so older extension
// builds don't surface errors; new builds should call /ext/prices (auth'd)
// or skip entirely. Re-enable only via a staging table reconciled with
// vetted sources.
router.post(
  "/prices/anon",
  anonPriceLimiter,
  async (req, res: Response) => {
    res.json({ ok: true, processed: 0 });
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

// ─── POST /api/ext/items/enrich — receive float/seed/paint data from extension ─
router.post(
  "/items/enrich",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { items } = req.body;

      if (!Array.isArray(items) || items.length === 0) {
        res.status(400).json({ error: "No items provided" });
        return;
      }

      // Cap at 500 items per request
      const batch = items.slice(0, 500);

      // Get user's steam account IDs for ownership check
      const { rows: accounts } = await pool.query(
        `SELECT id FROM steam_accounts WHERE user_id = $1`,
        [req.userId]
      );
      const accountIds = accounts.map((a) => a.id);

      if (accountIds.length === 0) {
        res.status(400).json({ error: "No steam accounts" });
        return;
      }

      // Track diagnostics so we can answer "is the extension actually
      // delivering data?" without grepping logs.
      let updated = 0;
      let decodedFromLink = 0;
      let linkUpdated = 0;
      let skippedNoData = 0;

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        for (const item of batch) {
          if (!item.asset_id) continue;

          // Treat empty arrays the same as missing — "stickers: []" carries
          // no signal but used to flow through and refresh inspected_at,
          // making the column useless as a real "we have data" marker.
          let floatVal: number | null =
            typeof item.float_value === "number" ? item.float_value : null;
          let paintSeed: number | null =
            typeof item.paint_seed === "number" ? item.paint_seed : null;
          let paintIndex: number | null =
            typeof item.paint_index === "number" ? item.paint_index : null;
          let stickers: any[] | null =
            Array.isArray(item.stickers) && item.stickers.length > 0
              ? item.stickers
              : null;
          let charms: any[] | null =
            Array.isArray(item.charms) && item.charms.length > 0
              ? item.charms
              : null;

          // If the extension gave us a *resolved* inspect link (no %propid
          // placeholders), decode it locally — the cs2-inspect-serializer
          // recovers float / paintSeed / paintIndex / stickers / charms with
          // real slot+wear+pattern that the page state never exposes.
          const link = typeof item.inspect_link === "string" ? item.inspect_link : null;
          const isResolvedLink =
            link !== null
            && link.includes("csgo_econ_action_preview")
            && !link.includes("%propid");

          if (isResolvedLink) {
            const decoded = await fetchInspectData(link!);
            if (!("failed" in decoded)) {
              floatVal = floatVal ?? decoded.floatValue;
              paintSeed = paintSeed ?? decoded.paintSeed;
              paintIndex = paintIndex ?? decoded.paintIndex;
              if (stickers === null && decoded.stickers.length > 0) {
                stickers = decoded.stickers;
              }
              if (charms === null && decoded.charms.length > 0) {
                charms = decoded.charms;
              }
              decodedFromLink++;
            }
          }

          const sets: string[] = [];
          const vals: any[] = [];
          let idx = 1;

          if (floatVal !== null) {
            sets.push(`float_value = $${idx++}`);
            vals.push(floatVal);
          }
          if (paintSeed !== null) {
            sets.push(`paint_seed = $${idx++}`);
            vals.push(paintSeed);
          }
          if (paintIndex !== null) {
            sets.push(`paint_index = $${idx++}`);
            vals.push(paintIndex);
          }
          if (stickers !== null) {
            sets.push(`stickers = $${idx++}`);
            vals.push(JSON.stringify(stickers));
          }
          if (charms !== null) {
            sets.push(`charms = $${idx++}`);
            vals.push(JSON.stringify(charms));
          }
          // Persist the resolved inspect_link separately so a future enrich
          // call (or admin re-decode) doesn't need the extension again.
          if (isResolvedLink) {
            sets.push(`inspect_link = $${idx++}`);
            vals.push(link);
            linkUpdated++;
          }

          if (sets.length === 0) {
            skippedNoData++;
            continue;
          }

          sets.push(`inspected_at = NOW()`);

          // Only update items owned by this user
          vals.push(item.asset_id);
          vals.push(accountIds);

          await client.query(
            `UPDATE inventory_items
             SET ${sets.join(", ")}
             WHERE asset_id = $${idx++} AND steam_account_id = ANY($${idx})`,
            vals
          );
          updated++;
        }

        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      console.log(
        `[Extension] Enriched ${updated} items for user ${req.userId} ` +
        `(decoded=${decodedFromLink}, links=${linkUpdated}, skipped=${skippedNoData})`
      );
      res.json({ ok: true, updated, decoded: decodedFromLink, skipped: skippedNoData });
    } catch (err) {
      console.error("[Extension] Item enrich error:", err);
      res.status(500).json({ error: "Failed to enrich items" });
    }
  }
);

export default router;
