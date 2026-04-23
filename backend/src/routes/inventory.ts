import { Router, Response } from "express";
import { pool } from "../db/pool.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { demoStubs } from "../middleware/demoStubs.js";
import { fetchSteamInventory } from "../services/steam.js";
import { getLatestPrices, getBestPrices, fillMissingPrices } from "../services/prices.js";
import { getDopplerPrice, isDopplerPaintIndex } from "../services/dopplerPrices.js";
import { getFadePercentage } from "../services/fadeData.js";
import { getMarketplaceLinks } from "../services/buffIds.js";
import { getSteamDepthBatch, SteamDepthData } from "../services/steamMarketDepth.js";
import { inspectItem, batchInspect } from "../services/inspect.js";
import { getSkinInfoBatch } from "../services/csgoData.js";
import { SteamSessionService } from "../services/steamSession.js";
import { getQueue } from "../infra/JobQueue.js";

const router = Router();

// GET /api/inventory?limit=20&offset=0&sort=price-desc&search=&tradableOnly=false&accountId=
// Server-side sort, filter, pagination — prices resolved in DB via JOIN
router.get("/", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 5000, 1), 5000);
    const offset = Math.max(parseInt(req.query.offset as string) || 0, 0);
    const sort = (req.query.sort as string) || "price-desc";
    const search = (req.query.search as string) || "";
    const tradableOnly = req.query.tradableOnly === "true";
    const filterAccountId = parseInt(req.query.accountId as string);

    // Build WHERE clauses
    const conditions = ["sa.user_id = $1"];
    const params: any[] = [req.userId];
    let paramIdx = 2;

    if (filterAccountId && !isNaN(filterAccountId)) {
      conditions.push(`sa.id = $${paramIdx}`);
      params.push(filterAccountId);
      paramIdx++;
    }
    if (search) {
      conditions.push(`i.market_hash_name ILIKE $${paramIdx}`);
      params.push(`%${search}%`);
      paramIdx++;
    }
    if (tradableOnly) {
      conditions.push("i.tradable = true");
    }

    const whereClause = conditions.join(" AND ");

    // CTE: best price per item name (computed once, used for sort + total)
    // Use Steam price first, then fall back to best external price.
    // This matches Portfolio total_value calculation for consistency.
    const bestPriceCTE = `
      best AS (
        SELECT market_hash_name,
               COALESCE(
                 MAX(CASE WHEN source = 'steam' THEN price_usd END),
                 MAX(price_usd)
               ) as best_price
        FROM current_prices
        WHERE price_usd > 0
          AND updated_at > NOW() - INTERVAL '48 hours'
        GROUP BY market_hash_name
      )`;

    // Total count + total value in one query
    const { rows: summaryRows } = await pool.query(
      `WITH ${bestPriceCTE}
       SELECT COUNT(*)::int as total,
              COALESCE(SUM(b.best_price), 0)::float as total_value
       FROM inventory_items i
       JOIN active_steam_accounts sa ON i.steam_account_id = sa.id
       LEFT JOIN best b ON b.market_hash_name = i.market_hash_name
       WHERE ${whereClause}`,
      params
    );
    const { total, total_value: totalValue } = summaryRows[0] ?? { total: 0, total_value: 0 };

    // Sort clause
    const orderBy = (() => {
      switch (sort) {
        case "price-asc":  return "COALESCE(b.best_price, 0) ASC, i.market_hash_name ASC";
        case "name":       return "i.market_hash_name ASC";
        case "rarity":     return "i.rarity DESC NULLS LAST, i.market_hash_name ASC";
        default:           return "COALESCE(b.best_price, 0) DESC, i.market_hash_name ASC";
      }
    })();

    // Paginated page query with best_price for sorting
    const pageParams = [...params, limit, offset];
    const { rows: items } = await pool.query(
      `WITH ${bestPriceCTE}
       SELECT i.asset_id, i.market_hash_name, i.icon_url, i.wear,
              i.float_value, i.rarity, i.rarity_color, i.tradable,
              i.trade_ban_until,
              i.inspect_link, i.paint_seed, i.paint_index, i.stickers, i.charms,
              sa.steam_id as account_steam_id,
              sa.id as account_id,
              sa.display_name as account_name,
              sa.avatar_url as account_avatar_url,
              COALESCE(b.best_price, 0)::float as best_price
       FROM inventory_items i
       JOIN active_steam_accounts sa ON i.steam_account_id = sa.id
       LEFT JOIN best b ON b.market_hash_name = i.market_hash_name
       WHERE ${whereClause}
       ORDER BY ${orderBy}
       LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
      pageParams
    );

    // Fetch per-source prices only for THIS page's items
    const names = [...new Set(items.map((i) => i.market_hash_name))];
    const priceMap = names.length > 0 ? await getLatestPrices(names) : new Map();

    const parseJSON = (val: any) => {
      if (!val) return [];
      if (typeof val === "string") {
        try { return JSON.parse(val); } catch { return []; }
      }
      return val;
    };

    // Collect all sticker names for batch price lookup
    const allStickerNames = new Set<string>();
    const parsedItems = items.map((item) => {
      const stickers = parseJSON(item.stickers);
      for (const s of stickers) {
        if (s.name) allStickerNames.add(`Sticker | ${s.name}`);
      }
      return { ...item, stickers, charms: parseJSON(item.charms) };
    });

    // Fetch sticker prices in one batch query
    const stickerPrices = allStickerNames.size > 0
      ? await getBestPrices([...allStickerNames])
      : new Map<string, number>();

    // Steam market depth (volume + order book) from iflow
    const depthMap = getSteamDepthBatch(names);

    // CSGO-API static data (collection, crate, float range)
    const csgoDataMap = await getSkinInfoBatch(names);

    const enriched = parsedItems.map((item) => {
      let prices = { ...(priceMap.get(item.market_hash_name) ?? {}) };

      // Doppler phase price overrides
      if (item.paint_index && isDopplerPaintIndex(item.paint_index)) {
        for (const source of Object.keys(prices)) {
          const phasePrice = getDopplerPrice(item.market_hash_name, source, item.paint_index);
          if (phasePrice !== null) {
            prices[source] = phasePrice;
          }
        }
      }

      // Sticker value — sum best prices of applied stickers
      let stickerValue: number | null = null;
      if (item.stickers.length > 0) {
        let total = 0;
        for (const s of item.stickers) {
          if (s.name) {
            const sp = stickerPrices.get(`Sticker | ${s.name}`);
            if (sp) total += sp;
          }
        }
        if (total > 0) stickerValue = Math.round(total * 100) / 100;
      }

      // Fade percentage
      const fadePercentage = item.paint_seed && item.market_hash_name.includes("Fade")
        ? getFadePercentage(item.market_hash_name, item.paint_seed)
        : null;

      // Marketplace links
      const links = getMarketplaceLinks(item.market_hash_name);

      // Steam market depth
      const depth = depthMap.get(item.market_hash_name);

      // CSGO-API static info (collection, crate, float range)
      const csgoInfo = csgoDataMap.get(item.market_hash_name);

      return {
        ...item,
        prices,
        sticker_value: stickerValue,
        fade_percentage: fadePercentage,
        links,
        steam_depth: depth ?? null,
        min_float: csgoInfo?.minFloat ?? null,
        max_float: csgoInfo?.maxFloat ?? null,
        collection: csgoInfo?.collection ?? null,
        crates: csgoInfo?.crates ?? null,
      };
    });

    // Session + freshness (run in parallel)
    const [activeAccountId, freshness] = await Promise.all([
      SteamSessionService.getActiveAccountId(req.userId!),
      total > 0
        ? pool.query(
            filterAccountId && !isNaN(filterAccountId)
              ? `SELECT MAX(i.updated_at) as last_update FROM inventory_items i
                 JOIN active_steam_accounts sa ON i.steam_account_id = sa.id
                 WHERE sa.user_id = $1 AND sa.id = $2`
              : `SELECT MAX(i.updated_at) as last_update FROM inventory_items i
                 JOIN active_steam_accounts sa ON i.steam_account_id = sa.id
                 WHERE sa.user_id = $1`,
            filterAccountId && !isNaN(filterAccountId) ? [req.userId, filterAccountId] : [req.userId])
        : null,
    ]);
    const session = activeAccountId ? await SteamSessionService.getSession(activeAccountId) : null;
    const lastUpdate = freshness?.rows[0]?.last_update;
    const stale = lastUpdate
      ? (Date.now() - new Date(lastUpdate).getTime()) > 15 * 60 * 1000
      : false;

    res.json({
      items: enriched,
      total,
      totalValue,
      limit,
      offset,
      hasMore: offset + limit < total,
      hasSession: !!session,
      stale,
    });
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
         JOIN active_steam_accounts sa ON i.steam_account_id = sa.id
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
  let stale = false;
  const privateAccounts: number[] = [];

  for (const account of accounts) {
    // Use session cookies to see trade-banned items not visible publicly —
    // but only when the JWT inside steamLoginSecure is still valid. Passing
    // expired cookies to Steam just yields 403s, which poisons the shared
    // proxy pool's cooldown state for everyone else.
    const sessionStatus = await SteamSessionService.getSessionStatus(account.id);
    const session = (sessionStatus === "valid" || sessionStatus === "expiring")
      ? await SteamSessionService.getSession(account.id)
      : null;
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
      // On 429/503: if we have existing DB items, mark stale instead of failing
      const status = err.response?.status ?? err.statusCode;
      if (status === 429 || status === 503) {
        const { rows: existing } = await pool.query(
          `SELECT COUNT(*)::int as cnt FROM inventory_items WHERE steam_account_id = $1`,
          [account.id]
        );
        if (existing[0]?.cnt > 0) {
          console.log(`[Inventory] Steam ${status} for account ${account.id}, returning stale data (${existing[0].cnt} items)`);
          totalItems += existing[0].cnt;
          stale = true;
          continue;
        }
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

  // Background: fill prices for any new items that have no price yet
  fillMissingPrices(userId).catch((err) =>
    console.error("Background price fill error:", err)
  );

  // Background: inspect items missing float values (only skins with wear)
  const { rows: uninspected } = await pool.query(
    `SELECT i.asset_id FROM inventory_items i
     JOIN active_steam_accounts sa ON i.steam_account_id = sa.id
     WHERE sa.user_id = $1 AND i.float_value IS NULL
       AND i.inspect_link IS NOT NULL AND i.wear IS NOT NULL
       AND i.inspect_link NOT LIKE '%propid%'
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

  return { totalItems, privateAccounts, stale };
});

// GET /api/inventory/sync-status/:jobId — check background sync status
router.get("/sync-status/:jobId", authMiddleware, (req: AuthRequest, res: Response) => {
  const job = inventoryQueue.getJob(req.params.jobId as string);
  if (!job) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  const result = job.result as { totalItems?: number; privateAccounts?: number[]; stale?: boolean } | undefined;
  res.json({
    status: job.status === 'active' ? 'syncing' : job.status === 'completed' ? 'done' : job.status,
    totalItems: result?.totalItems ?? job.progress,
    error: job.error,
    startedAt: job.createdAt,
    privateAccounts: result?.privateAccounts ?? [],
    stale: result?.stale ?? false,
  });
});

// POST /api/inventory/refresh?accountId=X — re-fetch from Steam and update DB
// Returns immediately with jobId, sync happens in background
router.post(
  "/refresh",
  authMiddleware,
  demoStubs.inventoryRefresh,
  async (req: AuthRequest, res: Response) => {
    try {
      const filterAccountId = parseInt(req.query.accountId as string);
      let accountQuery = `SELECT id, steam_id FROM active_steam_accounts WHERE user_id = $1`;
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
