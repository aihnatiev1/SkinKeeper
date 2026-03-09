import { Router, Response } from "express";
import { pool } from "../db/pool.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { fetchSteamInventory } from "../services/steam.js";
import { getLatestPrices } from "../services/prices.js";
import { inspectItem, batchInspect } from "../services/inspect.js";

const router = Router();

// GET /api/inventory?accountId=X — get items (optionally filtered by account)
router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const filterAccountId = parseInt(req.query.accountId as string);
    const params: any[] = [req.userId];
    let accountFilter = "";

    if (filterAccountId && !isNaN(filterAccountId)) {
      accountFilter = " AND sa.id = $2";
      params.push(filterAccountId);
    }

    const { rows: items } = await pool.query(
      `SELECT i.asset_id, i.market_hash_name, i.icon_url, i.wear,
              i.float_value, i.rarity, i.rarity_color, i.tradable,
              i.inspect_link, i.paint_seed, i.stickers, i.charms,
              sa.steam_id as account_steam_id,
              sa.id as account_id,
              sa.display_name as account_name
       FROM inventory_items i
       JOIN steam_accounts sa ON i.steam_account_id = sa.id
       WHERE sa.user_id = $1${accountFilter}
       ORDER BY i.market_hash_name`,
      params
    );

    // Attach latest prices
    const names = [...new Set(items.map((i) => i.market_hash_name))];
    const priceMap = await getLatestPrices(names);

    const enriched = items.map((item) => ({
      ...item,
      prices: priceMap.get(item.market_hash_name) ?? {},
    }));

    res.json({ items: enriched, count: enriched.length });
  } catch (err) {
    console.error("Inventory fetch error:", err);
    res.status(500).json({ error: "Failed to load inventory" });
  }
});

// GET /api/inventory/duplicates — get items grouped by name where count > 1
router.get(
  "/duplicates",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT
           i.market_hash_name,
           COUNT(*)::int AS count,
           ARRAY_AGG(i.asset_id ORDER BY i.asset_id) AS asset_ids,
           (ARRAY_AGG(i.icon_url))[1] AS icon_url
         FROM inventory_items i
         JOIN steam_accounts sa ON i.steam_account_id = sa.id
         WHERE sa.user_id = $1
         GROUP BY i.market_hash_name
         HAVING COUNT(*) > 1
         ORDER BY COUNT(*) DESC, i.market_hash_name`,
        [req.userId]
      );

      // Attach best (highest) market prices
      const names = rows.map((r) => r.market_hash_name);
      const priceMap = await getLatestPrices(names);

      const duplicates = rows.map((r) => {
        const prices = priceMap.get(r.market_hash_name);
        const priceValues = prices
          ? Object.values(prices).filter((p): p is number => p != null && p > 0)
          : [];
        const bestPrice = priceValues.length > 0
          ? Math.max(...priceValues)
          : null;

        return {
          marketHashName: r.market_hash_name,
          count: r.count,
          assetIds: r.asset_ids,
          iconUrl: r.icon_url,
          bestPrice,
        };
      });

      res.json({ duplicates, count: duplicates.length });
    } catch (err) {
      console.error("Duplicates fetch error:", err);
      res.status(500).json({ error: "Failed to load duplicates" });
    }
  }
);

// POST /api/inventory/refresh?accountId=X — re-fetch from Steam and update DB
router.post(
  "/refresh",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const filterAccountId = parseInt(req.query.accountId as string);
      let accountQuery = `SELECT id, steam_id FROM steam_accounts WHERE user_id = $1`;
      const accountParams: any[] = [req.userId];

      if (filterAccountId && !isNaN(filterAccountId)) {
        accountQuery += ` AND id = $2`;
        accountParams.push(filterAccountId);
      }

      const { rows: accounts } = await pool.query(accountQuery, accountParams);

      if (accounts.length === 0) {
        res.status(400).json({ error: "No linked accounts" });
        return;
      }

      let totalItems = 0;

      for (const account of accounts) {
        const items = await fetchSteamInventory(account.steam_id);

        // Upsert items
        for (const item of items) {
          await pool.query(
            `INSERT INTO inventory_items
               (steam_account_id, asset_id, market_hash_name, icon_url, wear, rarity, rarity_color, tradable, inspect_link, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
             ON CONFLICT (steam_account_id, asset_id)
             DO UPDATE SET market_hash_name = $3, icon_url = $4, wear = $5,
                           rarity = $6, rarity_color = $7, tradable = $8,
                           inspect_link = $9, updated_at = NOW()`,
            [
              account.id,
              item.asset_id,
              item.market_hash_name,
              item.icon_url,
              item.wear,
              item.rarity,
              item.rarity_color,
              item.tradable,
              item.inspect_link,
            ]
          );
        }

        // Remove items that no longer exist in inventory
        const currentAssetIds = items.map((i) => i.asset_id);
        if (currentAssetIds.length > 0) {
          const placeholders = currentAssetIds
            .map((_, i) => `$${i + 2}`)
            .join(",");
          await pool.query(
            `DELETE FROM inventory_items
             WHERE steam_account_id = $1 AND asset_id NOT IN (${placeholders})`,
            [account.id, ...currentAssetIds]
          );
        }

        totalItems += items.length;
      }

      res.json({ success: true, total_items: totalItems });
    } catch (err) {
      console.error("Inventory refresh error:", err);
      res.status(500).json({ error: "Failed to refresh inventory" });
    }
  }
);

// GET /api/inventory/:assetId/inspect — fetch float/stickers/charms for a single item
router.get(
  "/:assetId/inspect",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const result = await inspectItem(req.userId!, req.params.assetId as string);
      if (!result) {
        res.status(404).json({ error: "Item not found or no inspect link" });
        return;
      }
      res.json(result);
    } catch (err) {
      console.error("Inspect error:", err);
      res.status(500).json({ error: "Failed to inspect item" });
    }
  }
);

// POST /api/inventory/inspect-batch — batch inspect multiple items
router.post(
  "/inspect-batch",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { assetIds } = req.body;
      if (!Array.isArray(assetIds) || assetIds.length === 0) {
        res.status(400).json({ error: "assetIds array required" });
        return;
      }
      // Limit batch size
      const limited = assetIds.slice(0, 20);
      const results = await batchInspect(req.userId!, limited);

      const response: Record<string, any> = {};
      for (const [id, data] of results) {
        response[id] = data;
      }
      res.json({ results: response, inspected: results.size });
    } catch (err) {
      console.error("Batch inspect error:", err);
      res.status(500).json({ error: "Failed to batch inspect" });
    }
  }
);

export default router;
