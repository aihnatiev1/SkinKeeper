import { Router, Response } from "express";
import { pool } from "../db/pool.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { fetchSteamInventory } from "../services/steam.js";
import { getLatestPrices, fetchSkinportPrices, savePrices } from "../services/prices.js";
import { inspectItem, batchInspect } from "../services/inspect.js";
import { SteamSessionService } from "../services/steamSession.js";
import { getQueue } from "../infra/JobQueue.js";

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
              i.trade_ban_until,
              i.inspect_link, i.paint_seed, i.paint_index, i.stickers, i.charms,
              sa.steam_id as account_steam_id,
              sa.id as account_id,
              sa.display_name as account_name,
              sa.avatar_url as account_avatar_url
       FROM inventory_items i
       JOIN steam_accounts sa ON i.steam_account_id = sa.id
       WHERE sa.user_id = $1${accountFilter}
       ORDER BY i.market_hash_name`,
      params
    );

    // Attach latest prices
    const names = [...new Set(items.map((i) => i.market_hash_name))];
    const priceMap = await getLatestPrices(names);

    const parseJSON = (val: any) => {
      if (!val) return [];
      if (typeof val === "string") {
        try {
          return JSON.parse(val);
        } catch (_) {
          return [];
        }
      }
      return val;
    };

    const enriched = items.map((item) => ({
      ...item,
      stickers: parseJSON(item.stickers),
      charms: parseJSON(item.charms),
      prices: priceMap.get(item.market_hash_name) ?? {},
    }));

    // Check if active account has a session (for session-dependent UI features)
    const activeAccountId = await SteamSessionService.getActiveAccountId(req.userId!);
    const session = activeAccountId ? await SteamSessionService.getSession(activeAccountId) : null;

    res.json({ items: enriched, count: enriched.length, hasSession: !!session });
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

// ─── Inventory refresh via JobQueue ──────────────────────────────────────

interface InventoryRefreshData {
  userId: number;
  accounts: Array<{ id: number; steam_id: string }>;
}

const inventoryQueue = getQueue<InventoryRefreshData>('inventory');

inventoryQueue.process(async (job, updateProgress) => {
  const { userId, accounts } = job.data;
  let totalItems = 0;
  const privateAccounts: number[] = [];

  for (const account of accounts) {
    // Use session cookies to see trade-banned items not visible publicly
    const session = await SteamSessionService.getSession(account.id);
    let items: Awaited<ReturnType<typeof fetchSteamInventory>>;
    try {
      items = await fetchSteamInventory(
        account.steam_id,
        session ? { steamLoginSecure: session.steamLoginSecure, sessionId: session.sessionId } : undefined
      );
    } catch (err: any) {
      if (err.message === 'INVENTORY_PRIVATE') {
        console.log(`[Inventory] Account ${account.id} (${account.steam_id}) has private inventory`);
        privateAccounts.push(account.id);
        continue;
      }
      throw err;
    }

    // Batch upsert items using unnest for performance (~1 query instead of ~800)
    if (items.length > 0) {
      const accountIds = items.map(() => account.id);
      const assetIds = items.map(i => i.asset_id);
      const names = items.map(i => i.market_hash_name);
      const icons = items.map(i => i.icon_url);
      const wears = items.map(i => i.wear);
      const rarities = items.map(i => i.rarity);
      const rarityColors = items.map(i => i.rarity_color);
      const tradables = items.map(i => i.tradable);
      const tradeBans = items.map(i => i.trade_ban_until);
      const inspectLinks = items.map(i => i.inspect_link);

      await pool.query(
        `INSERT INTO inventory_items
           (steam_account_id, asset_id, market_hash_name, icon_url, wear, rarity, rarity_color, tradable, trade_ban_until, inspect_link, updated_at)
         SELECT * FROM unnest(
           $1::int[], $2::text[], $3::text[], $4::text[], $5::text[],
           $6::text[], $7::text[], $8::boolean[], $9::timestamptz[], $10::text[]
         ), NOW()
         ON CONFLICT (steam_account_id, asset_id)
         DO UPDATE SET market_hash_name = EXCLUDED.market_hash_name,
                       icon_url = EXCLUDED.icon_url,
                       wear = EXCLUDED.wear,
                       rarity = EXCLUDED.rarity,
                       rarity_color = EXCLUDED.rarity_color,
                       tradable = EXCLUDED.tradable,
                       trade_ban_until = EXCLUDED.trade_ban_until,
                       inspect_link = EXCLUDED.inspect_link,
                       updated_at = NOW()`,
        [accountIds, assetIds, names, icons, wears, rarities, rarityColors, tradables, tradeBans, inspectLinks]
      );
    }

    // Remove items that no longer exist in inventory
    const currentAssetIds = items.map((i) => i.asset_id);
    if (currentAssetIds.length > 0) {
      await pool.query(
        `DELETE FROM inventory_items
         WHERE steam_account_id = $1
           AND asset_id != ALL($2::text[])`,
        [account.id, currentAssetIds]
      );
    }

    totalItems += items.length;
    updateProgress(totalItems);
  }

  // Background: fetch latest Skinport prices so new items have prices immediately
  fetchSkinportPrices()
    .then((prices) => savePrices(prices, "skinport"))
    .catch((err) => console.error("Background Skinport refresh error:", err));

  // Background: inspect items missing float values (only skins with wear)
  const { rows: uninspected } = await pool.query(
    `SELECT i.asset_id FROM inventory_items i
     JOIN steam_accounts sa ON i.steam_account_id = sa.id
     WHERE sa.user_id = $1 AND i.float_value IS NULL
       AND i.inspect_link IS NOT NULL AND i.wear IS NOT NULL
     ORDER BY i.updated_at DESC
     LIMIT 100`,
    [userId]
  );
  if (uninspected.length > 0) {
    const ids = uninspected.map((r: any) => r.asset_id);
    batchInspect(userId, ids).catch((err) =>
      console.error("Background inspect error:", err)
    );
  }

  return { totalItems, privateAccounts };
});

// GET /api/inventory/sync-status/:jobId — check background sync status
router.get("/sync-status/:jobId", authMiddleware, (req: AuthRequest, res: Response) => {
  const job = inventoryQueue.getJob(req.params.jobId as string);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  const result = job.result as { totalItems?: number; privateAccounts?: number[] } | undefined;
  res.json({
    status: job.status === 'active' ? 'syncing' : job.status === 'completed' ? 'done' : job.status,
    totalItems: result?.totalItems ?? job.progress,
    error: job.error,
    startedAt: job.createdAt,
    privateAccounts: result?.privateAccounts ?? [],
  });
});

// POST /api/inventory/refresh?accountId=X — re-fetch from Steam and update DB
// Returns immediately with jobId, sync happens in background
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

      // Enqueue job — returns immediately with UUID
      const job = inventoryQueue.add('inventory-refresh', {
        userId: req.userId!,
        accounts: accounts.map((a: any) => ({ id: a.id, steam_id: a.steam_id })),
      });

      res.json({ success: true, jobId: job.id, status: "syncing" });
    } catch (err: any) {
      console.error("Inventory refresh error:", err);
      res.status(500).json({ error: "Failed to start inventory refresh" });
    }
  }
);

// GET /api/inventory/:assetId/inspect — fetch float/stickers/charms for a single item
router.get(
  "/:assetId/inspect",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const force = req.query.force === "true";
      const result = await inspectItem(req.userId!, req.params.assetId as string, force);
      if ("failed" in result) {
        const status = result.reason === "no_link" ? 404 : 503;
        res.status(status).json({ error: result.reason });
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
