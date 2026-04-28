import { Router, Request, Response } from "express";
import axios from "axios";
import { timingSafeEqual } from "crypto";
import { getAllStats } from "../services/priceStats.js";
import { getJobHealth } from "../services/priceJob.js";
import { pool, getPoolStats as getDbPoolStats } from "../db/pool.js";
import { SteamSessionService } from "../services/steamSession.js";
import { fetchSteamInventory } from "../services/steam.js";
import { getCacheStats } from "../utils/cacheRegistry.js";
import { getInspectCircuitState } from "../services/inspect.js";
import { getPoolStats } from "../services/proxyPool.js";
import { getAllQueueStats } from "../infra/JobQueue.js";
import { SteamGateway } from "../infra/SteamGateway.js";
import { responseCache } from "../infra/ResponseCache.js";

const router = Router();

/**
 * MED-4: constant-time compare for the admin shared secret.
 *
 * Short-circuit string equality (===) leaks length and partial-match
 * progress through CPU timing. timingSafeEqual avoids both, but requires
 * equal-length Buffers — so we length-check first. The length check itself
 * leaks the secret length, which is fine: ADMIN_SECRET is published once
 * to ops + CI and rotated as a unit, the length is not the secret.
 *
 * Buffer.from(str, "utf8") is explicit so two strings that differ only in
 * encoding don't accidentally compare equal (defensive).
 */
export function safeCompareSecret(
  provided: unknown,
  secret: string
): boolean {
  if (typeof provided !== "string") return false;
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(secret, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// Admin auth via header-only shared secret (never accept in query string — leaks to logs/caches)
function requireAdminSecret(req: Request, res: Response, next: Function) {
  const secret = process.env.ADMIN_SECRET;
  if (!secret) {
    return res.status(503).json({ error: "Admin endpoint not configured" });
  }
  const provided = req.headers["x-admin-secret"];
  if (!safeCompareSecret(provided, secret)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
}

// GET /api/admin/price-stats — all price source stats
router.get("/price-stats", requireAdminSecret, (_req: Request, res: Response) => {
  res.json(getAllStats());
});

// GET /api/admin/price-health — quick health check for alerting
router.get("/price-health", requireAdminSecret, async (_req: Request, res: Response) => {
  const stats = getAllStats();
  const issues: string[] = [];

  for (const src of stats.sources) {
    // No successful fetch in last 15 min = stale
    if (src.lastSuccessAt) {
      const age = Date.now() - new Date(src.lastSuccessAt).getTime();
      if (age > 15 * 60 * 1000) {
        issues.push(`${src.source}: last success ${Math.round(age / 60000)}m ago`);
      }
    } else {
      issues.push(`${src.source}: never succeeded`);
    }

    // High 429 rate (>20% of total fetches)
    if (src.totalFetches > 10 && src.total429s / src.totalFetches > 0.2) {
      issues.push(`${src.source}: ${src.total429s}/${src.totalFetches} fetches are 429 (${Math.round(src.total429s / src.totalFetches * 100)}%)`);
    }

    // Currently rate-limited
    if (src.crawlerPausedUntil && new Date(src.crawlerPausedUntil).getTime() > Date.now()) {
      issues.push(`${src.source}: paused until ${src.crawlerPausedUntil}`);
    }
  }

  // Check DB for price freshness
  try {
    const { rows } = await pool.query(
      `SELECT source, MAX(updated_at) AS last_at, COUNT(DISTINCT market_hash_name) AS items
       FROM current_prices
       WHERE updated_at > NOW() - INTERVAL '1 hour'
       GROUP BY source`
    );
    const dbSources: Record<string, { lastAt: string; items: number }> = {};
    for (const row of rows) {
      dbSources[row.source] = { lastAt: row.last_at, items: parseInt(row.items) };
    }

    for (const expected of ["skinport", "steam", "csfloat", "dmarket"]) {
      if (!dbSources[expected]) {
        issues.push(`${expected}: no prices written to DB in last hour`);
      }
    }

    res.json({
      healthy: issues.length === 0,
      issues,
      uptime: stats.uptime,
      dbLastHour: dbSources,
    });
  } catch (err: any) {
    res.json({
      healthy: false,
      issues: [...issues, `DB query failed: ${err.message}`],
      uptime: stats.uptime,
    });
  }
});

// GET /api/admin/price-freshness — per-source staleness report
router.get("/price-freshness", requireAdminSecret, async (_req: Request, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT source,
              COUNT(DISTINCT market_hash_name) AS total_items,
              MIN(updated_at) AS oldest_price,
              MAX(updated_at) AS newest_price,
              AVG(EXTRACT(EPOCH FROM (NOW() - updated_at))) AS avg_age_seconds
       FROM current_prices
       WHERE price_usd > 0
       GROUP BY source
       ORDER BY source`
    );

    res.json(rows.map(r => ({
      source: r.source,
      totalItems: parseInt(r.total_items),
      oldestPrice: r.oldest_price,
      newestPrice: r.newest_price,
      avgAgeMins: Math.round(parseFloat(r.avg_age_seconds) / 60),
    })));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Trade Diagnostics ─────────────────────────────────────────────────

const STEAM_API = "https://api.steampowered.com";
const STEAM_COMMUNITY = "https://steamcommunity.com";

/**
 * GET /api/admin/trade-diag/:accountId
 * Full trade diagnostics for an account:
 * - Session validity (live check against Steam)
 * - Refresh token expiry
 * - Web API key status
 * - Raw Steam trade offers (active + historical)
 * - What's in our DB vs what Steam has
 */
router.get("/trade-diag/:accountId", requireAdminSecret, async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId as string);
  if (!accountId) {
    res.status(400).json({ error: "Invalid accountId" });
    return;
  }

  const diag: Record<string, any> = { accountId, timestamp: new Date().toISOString() };

  // 1. Account info
  const { rows: accRows } = await pool.query(
    `SELECT id, user_id, steam_id, display_name, web_api_key IS NOT NULL AS has_api_key,
            trade_token, session_method, session_updated_at
     FROM steam_accounts WHERE id = $1`,
    [accountId]
  );
  if (accRows.length === 0) {
    res.status(404).json({ error: "Account not found" });
    return;
  }
  diag.account = accRows[0];

  // 2. Session details (refresh token expiry, etc.)
  try {
    diag.sessionDetails = await SteamSessionService.getSessionDetails(accountId);
  } catch (err: any) {
    diag.sessionDetails = { error: err.message };
  }

  // 3. Live session validation
  const session = await SteamSessionService.getSession(accountId);
  if (!session) {
    diag.sessionLive = { valid: false, reason: "no_session_stored" };
  } else {
    try {
      const valid = await SteamSessionService.validateSession(session);
      diag.sessionLive = { valid, steamLoginSecurePrefix: session.steamLoginSecure.substring(0, 30) + "..." };
    } catch (err: any) {
      diag.sessionLive = { valid: false, error: err.message };
    }
  }

  // 4. Web API key check + raw Steam trade offers
  const { rows: keyRows } = await pool.query(
    `SELECT web_api_key FROM steam_accounts WHERE id = $1`,
    [accountId]
  );
  const apiKey = keyRows[0]?.web_api_key;
  diag.webApiKey = apiKey ? { present: true, prefix: apiKey.substring(0, 8) + "..." } : { present: false };

  if (apiKey) {
    // Fetch active offers
    try {
      const { data: activeResp } = await axios.get(
        `${STEAM_API}/IEconService/GetTradeOffers/v1/`,
        {
          params: {
            key: apiKey,
            get_sent_offers: 1,
            get_received_offers: 1,
            get_descriptions: 0,
            active_only: 1,
            language: "english",
          },
          timeout: 15000,
        }
      );
      const active = activeResp?.response;
      diag.steamActiveOffers = {
        sent: (active?.trade_offers_sent ?? []).map(summarizeOffer),
        received: (active?.trade_offers_received ?? []).map(summarizeOffer),
      };
    } catch (err: any) {
      diag.steamActiveOffers = { error: err.message, status: err.response?.status };
    }

    // Fetch historical offers (last 30 days)
    try {
      const cutoff = Math.floor(Date.now() / 1000) - 30 * 24 * 3600;
      const { data: histResp } = await axios.get(
        `${STEAM_API}/IEconService/GetTradeOffers/v1/`,
        {
          params: {
            key: apiKey,
            get_sent_offers: 1,
            get_received_offers: 1,
            get_descriptions: 0,
            active_only: 0,
            historical_only: 1,
            time_historical_cutoff: cutoff,
            language: "english",
          },
          timeout: 15000,
        }
      );
      const hist = histResp?.response;
      diag.steamHistoricalOffers = {
        sent: (hist?.trade_offers_sent ?? []).map(summarizeOffer),
        received: (hist?.trade_offers_received ?? []).map(summarizeOffer),
      };
    } catch (err: any) {
      diag.steamHistoricalOffers = { error: err.message, status: err.response?.status };
    }
  }

  // 5. What's in our DB
  const userId = accRows[0].user_id;
  try {
    const { rows: dbOffers } = await pool.query(
      `SELECT id, steam_offer_id, direction, partner_steam_id, status,
              is_internal, account_id_from, account_id_to,
              value_give_cents, value_recv_cents, created_at
       FROM trade_offers
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 30`,
      [userId]
    );
    diag.dbOffers = dbOffers;
  } catch (err: any) {
    diag.dbOffers = { error: err.message };
  }

  // 6. Test accept capability: try a CSRF-protected request (without actually accepting)
  if (session) {
    try {
      // Hit the trade offers page to see if session works for web actions
      const { status, headers } = await axios.get(
        `${STEAM_COMMUNITY}/my/tradeoffers/`,
        {
          headers: {
            Cookie: `steamLoginSecure=${session.steamLoginSecure}; sessionid=${session.sessionId}`,
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          },
          maxRedirects: 0,
          validateStatus: () => true,
          timeout: 10000,
        }
      );
      const location = (headers["location"] || "") as string;
      diag.tradePageAccess = {
        status,
        redirectsToLogin: location.includes("/login"),
        location: location || null,
      };
    } catch (err: any) {
      diag.tradePageAccess = { error: err.message };
    }
  }

  res.json(diag);
});

/**
 * POST /api/admin/trade-test-accept/:accountId/:steamOfferId
 * Dry-run test: builds the exact same request as acceptSteamTradeOffer
 * but POSTs to Steam and returns the raw response (for debugging).
 * Query param: ?partner=STEAM64_ID (required)
 */
router.post("/trade-test-accept/:accountId/:steamOfferId", requireAdminSecret, async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId as string);
  const steamOfferId = req.params.steamOfferId as string;
  const partnerSteamId = req.query.partner as string;

  if (!accountId || !steamOfferId || !partnerSteamId) {
    res.status(400).json({ error: "accountId, steamOfferId, partner query param required" });
    return;
  }

  const session = await SteamSessionService.getSession(accountId);
  if (!session) {
    res.status(400).json({ error: "No session for this account" });
    return;
  }

  // Convert to 32-bit for the partner param
  const partnerId32 = (BigInt(partnerSteamId) - BigInt("76561197960265728")).toString();

  // Use the stored sessionId (not random!) to match what Steam expects
  const sessionId = session.sessionId;

  const body = new URLSearchParams({
    sessionid: sessionId,
    serverid: "1",
    tradeofferid: steamOfferId,
    partner: partnerId32,
    captcha: "",
  }).toString();

  const headers = {
    "Content-Type": "application/x-www-form-urlencoded",
    Cookie: `steamLoginSecure=${session.steamLoginSecure}; sessionid=${sessionId}`,
    Referer: `${STEAM_COMMUNITY}/tradeoffer/${steamOfferId}/`,
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  };

  try {
    const resp = await axios.post(
      `${STEAM_COMMUNITY}/tradeoffer/${steamOfferId}/accept`,
      body,
      {
        headers,
        maxRedirects: 0,
        validateStatus: () => true, // capture ALL statuses
        timeout: 15000,
      }
    );

    res.json({
      httpStatus: resp.status,
      responseHeaders: {
        location: resp.headers["location"],
        "set-cookie": resp.headers["set-cookie"],
      },
      responseBody: typeof resp.data === "string" ? resp.data.substring(0, 2000) : resp.data,
      requestInfo: {
        sessionIdUsed: sessionId.substring(0, 10) + "...",
        partnerId32,
        partnerSteamId,
        steamOfferId,
      },
    });
  } catch (err: any) {
    res.json({
      error: err.message,
      httpStatus: err.response?.status,
      responseBody: err.response?.data,
    });
  }
});

function summarizeOffer(offer: any) {
  return {
    tradeofferid: offer.tradeofferid,
    partner_accountid: offer.accountid_other,
    partner_steam64: offer.accountid_other
      ? (BigInt(offer.accountid_other) + BigInt("76561197960265728")).toString()
      : null,
    state: offer.trade_offer_state,
    stateName: OFFER_STATE_NAMES[offer.trade_offer_state] ?? `unknown(${offer.trade_offer_state})`,
    items_to_give: (offer.items_to_give ?? []).length,
    items_to_receive: (offer.items_to_receive ?? []).length,
    message: offer.message || null,
    time_created: offer.time_created ? new Date(offer.time_created * 1000).toISOString() : null,
    time_updated: offer.time_updated ? new Date(offer.time_updated * 1000).toISOString() : null,
  };
}

// GET /api/admin/trade-history-html/:accountId — raw HTML of tradehistory page for debugging parser
router.get("/trade-history-html/:accountId", requireAdminSecret, async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId as string);
  if (!accountId) { res.status(400).json({ error: "Invalid accountId" }); return; }

  const session = await SteamSessionService.getSession(accountId);
  if (!session) { res.status(400).json({ error: "No session" }); return; }

  const cookies = `steamLoginSecure=${session.steamLoginSecure}; sessionid=${session.sessionId}`;
  const ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

  try {
    const resp = await axios.get(
      `${STEAM_COMMUNITY}/my/tradehistory/`,
      {
        headers: { Cookie: cookies, "User-Agent": ua },
        maxRedirects: 5,
        timeout: 15000,
        validateStatus: () => true,
      }
    );
    const html = typeof resp.data === "string" ? resp.data : "";

    // Extract just the trade history section
    const tradeRows = html.match(/class="tradehistoryrow[\s\S]*?(?=class="tradehistoryrow|<\/div>\s*<div id="tradehistory_content_more"|$)/g) ?? [];

    res.json({
      httpStatus: resp.status,
      htmlLength: html.length,
      sampleTradeRows: tradeRows.slice(0, 3).map((r: string) => r.substring(0, 2000)),
      hasMoreButton: html.includes("tradehistory_content_more"),
      totalRowsFound: tradeRows.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/inventory-debug/:accountId — test fetchSteamInventory with both contexts
router.get("/inventory-debug/:accountId", requireAdminSecret, async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId as string);
  if (!accountId) { res.status(400).json({ error: "Invalid accountId" }); return; }

  const { rows: accRows } = await pool.query(
    `SELECT steam_id FROM steam_accounts WHERE id = $1`, [accountId]
  );
  if (accRows.length === 0) { res.status(404).json({ error: "Account not found" }); return; }

  const steamId = accRows[0].steam_id;
  const session = await SteamSessionService.getSession(accountId);
  const searchName = (req.query.search as string || "").toLowerCase();

  try {
    const items = await fetchSteamInventory(
      steamId,
      session ? { steamLoginSecure: session.steamLoginSecure, sessionId: session.sessionId } : undefined
    );

    const tradeBanned = items.filter(i => !i.tradable);
    const searchResults = searchName
      ? items.filter(i => i.market_hash_name.toLowerCase().includes(searchName))
      : [];

    res.json({
      steamId,
      hasSession: !!session,
      totalItems: items.length,
      tradeBannedCount: tradeBanned.length,
      tradeBannedItems: tradeBanned.map(i => ({
        name: i.market_hash_name,
        assetId: i.asset_id,
        tradeBanUntil: i.trade_ban_until,
      })),
      ...(searchName ? { searchResults } : {}),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/inventory-ctx16/:accountId — fetch context_type 16 (trade-banned items)
router.get("/inventory-ctx16/:accountId", requireAdminSecret, async (req: Request, res: Response) => {
  const accountId = parseInt(req.params.accountId as string);
  if (!accountId) { res.status(400).json({ error: "Invalid accountId" }); return; }

  const { rows: accRows } = await pool.query(
    `SELECT steam_id FROM steam_accounts WHERE id = $1`, [accountId]
  );
  if (accRows.length === 0) { res.status(404).json({ error: "Account not found" }); return; }

  const steamId = accRows[0].steam_id;
  const session = await SteamSessionService.getSession(accountId);
  if (!session) { res.status(400).json({ error: "No session" }); return; }

  const searchName = (req.query.search as string || "").toLowerCase();

  try {
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      Cookie: `steamLoginSecure=${session.steamLoginSecure}; sessionid=${session.sessionId}`,
    };

    const allAssets: any[] = [];
    const allDescs: any[] = [];
    let lastAssetId: string | undefined;
    let steamTotal = 0;

    for (let page = 0; page < 20; page++) {
      const params: Record<string, string> = { l: "english", count: "2000", raw_asset_properties: "1", preserve_bbcode: "1" };
      if (lastAssetId) params.start_assetid = lastAssetId;

      const resp = await axios.get(
        `https://steamcommunity.com/inventory/${steamId}/730/16`,
        { params, headers, timeout: 15000 }
      );
      const data = resp.data;
      if (!data?.success || !data?.assets) break;

      if (page === 0) steamTotal = data.total_inventory_count ?? 0;
      allAssets.push(...data.assets);
      allDescs.push(...data.descriptions);

      if (!data.more_items) break;
      lastAssetId = data.last_assetid ?? data.assets[data.assets.length - 1].assetid;
      await new Promise(r => setTimeout(r, 1000));
    }

    const descMap = new Map<string, any>();
    for (const d of allDescs) descMap.set(`${d.classid}_${d.instanceid}`, d);

    const items = allAssets.map(a => {
      const d = descMap.get(`${a.classid}_${a.instanceid}`);
      return {
        assetId: a.assetid,
        name: d?.market_hash_name ?? "unknown",
        tradable: d?.tradable,
        marketable: d?.marketable,
        ownerDescriptions: d?.owner_descriptions?.map((o: any) => o.value),
        tags: d?.tags,
        descriptions: d?.descriptions?.map((dd: any) => dd.value),
      };
    });

    const filtered = searchName ? items.filter(i => i.name.toLowerCase().includes(searchName)) : items.slice(0, 50);

    res.json({
      steamTotal,
      assetCount: allAssets.length,
      items: filtered,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const OFFER_STATE_NAMES: Record<number, string> = {
  1: "Invalid",
  2: "Active",
  3: "Accepted",
  4: "Countered",
  5: "Expired",
  6: "Canceled",
  7: "Declined",
  8: "InvalidItems",
  9: "CreatedNeedsConfirmation",
  10: "CanceledBySecondFactor",
  11: "InEscrow",
};

// GET /api/admin/cache-stats — cache sizes and hit rates
router.get("/cache-stats", requireAdminSecret, (_req: Request, res: Response) => {
  res.json(getCacheStats());
});

// GET /api/admin/health-dashboard — aggregated infra metrics in one endpoint
router.get("/health-dashboard", requireAdminSecret, (_req: Request, res: Response) => {
  const queueStats = getAllQueueStats();
  const gatewayMetrics = SteamGateway.getMetrics();
  const circuitState = SteamGateway.getCircuitState();
  const cacheStats = getCacheStats();
  const responseCacheStats = responseCache.getStats();
  const dbPoolStats = getDbPoolStats();
  const jobHealth = getJobHealth();

  res.json({
    timestamp: new Date().toISOString(),
    queues: queueStats,
    steamGateway: { ...gatewayMetrics, circuits: circuitState },
    caches: { ...cacheStats, responseCache: responseCacheStats },
    database: dbPoolStats,
    cronJobs: jobHealth,
  });
});

// GET /api/admin/job-health — cron job health status + proxy pool + hot loop
router.get("/job-health", requireAdminSecret, async (_req: Request, res: Response) => {
  const { getHotLoopStats } = await import("../services/prices.js");
  res.json({ ...getJobHealth(), hotSteamLoop: getHotLoopStats(), inspectCircuit: getInspectCircuitState(), proxyPool: getPoolStats() });
});

// POST /api/admin/prune-prices — manually trigger price history pruning
router.post("/prune-prices", requireAdminSecret, async (_req: Request, res: Response) => {
  try {
    const { pruneOldPrices } = await import("../services/prices.js");
    await pruneOldPrices();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/auto-sell-stats — auto-sell engine activity (P3)
// Quick dashboard for monitoring fire/failure rates without scanning logs.
router.get("/auto-sell-stats", requireAdminSecret, async (_req: Request, res: Response) => {
  try {
    const [activeRules, fires24h, failures24h, refusals24h] = await Promise.all([
      pool.query(
        `SELECT COUNT(*)::int AS cnt FROM auto_sell_rules
          WHERE enabled = TRUE AND cancelled_at IS NULL`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS cnt FROM auto_sell_executions
          WHERE fired_at > NOW() - INTERVAL '24 hours'`
      ),
      pool.query(
        `SELECT COUNT(*)::int AS cnt FROM auto_sell_executions
          WHERE fired_at > NOW() - INTERVAL '24 hours' AND action = 'failed'`
      ),
      // MIN-guard refusals are recorded as 'notified' rows with a non-null
      // error_message that mentions "refusing to auto-list".
      pool.query(
        `SELECT COUNT(*)::int AS cnt FROM auto_sell_executions
          WHERE fired_at > NOW() - INTERVAL '24 hours'
            AND action = 'notified'
            AND error_message ILIKE '%refusing to auto-list%'`
      ),
    ]);

    const jobs = getJobHealth();
    res.json({
      activeRules: activeRules.rows[0]?.cnt ?? 0,
      fires24h: fires24h.rows[0]?.cnt ?? 0,
      failures24h: failures24h.rows[0]?.cnt ?? 0,
      minGuardRefusals24h: refusals24h.rows[0]?.cnt ?? 0,
      cron: jobs.autoSell ?? null,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Feature Flags (P9) ──────────────────────────────────────────────────
// Per-user flag overrides + canary rollout introspection. See
// backend/docs/feature-flags.md.

// GET /api/admin/feature-flags/canary-stats — current rollout config + estimates
router.get("/feature-flags/canary-stats", requireAdminSecret, async (_req: Request, res: Response) => {
  try {
    const { getCanaryConfig, FLAG_NAMES } = await import("../services/featureFlags.js");
    const cfg = getCanaryConfig();
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS total FROM users`);
    const totalUsers = rows[0]?.total ?? 0;

    res.json({
      totalUsers,
      flags: cfg.map(c => ({
        flag: c.flag,
        percentage: c.percentage,
        killed: c.killed,
        // Estimate. Actual canary count is exact via deterministic hash, but
        // we don't iterate every userId here — pct of total is good enough.
        estimatedUsersInCanary: c.killed ? 0 : Math.round((totalUsers * c.percentage) / 100),
      })),
      knownFlags: FLAG_NAMES,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/feature-flags/:userId — resolved flags (post env+canary merge)
router.get("/feature-flags/:userId", requireAdminSecret, async (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId as string, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }
  try {
    const { getFeatureFlagsForUser, userBucket } = await import("../services/featureFlags.js");
    const { rows } = await pool.query(
      `SELECT id, feature_flags FROM users WHERE id = $1`,
      [userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const resolved = await getFeatureFlagsForUser(userId);
    res.json({
      userId,
      bucket: userBucket(userId),
      rawOverrides: rows[0].feature_flags ?? {},
      resolved,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/feature-flags/:userId — set/clear a flag override
// Body: { flag: string, value: boolean | null }
//   value=null removes the override (user falls back to canary/env logic).
router.post("/feature-flags/:userId", requireAdminSecret, async (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId as string, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }
  const flag = req.body?.flag;
  const value = req.body?.value;
  if (typeof flag !== "string" || !/^[a-z][a-z0-9_]*$/.test(flag)) {
    res.status(400).json({ error: "Invalid flag name (must be lowercase snake_case)" });
    return;
  }
  if (value !== null && typeof value !== "boolean") {
    res.status(400).json({ error: "value must be boolean or null" });
    return;
  }

  try {
    const { rows } = await pool.query(`SELECT id FROM users WHERE id = $1`, [userId]);
    if (rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    const { setFeatureFlag } = await import("../services/featureFlags.js");
    const resolved = await setFeatureFlag(userId, flag, value);
    console.log(`[Admin] Feature flag ${flag}=${value} set for user ${userId}`);
    res.json({ userId, flag, value, resolved });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/set-premium/:userId — manually set premium (for testing release builds)
// Body: { premium: true/false, days?: number }
router.post("/set-premium/:userId", requireAdminSecret, async (req: Request, res: Response) => {
  const userId = parseInt(req.params.userId as string, 10);
  if (isNaN(userId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  const premium = req.body.premium !== false; // default true
  const days = parseInt(req.body.days, 10) || 365;

  if (premium) {
    const until = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    await pool.query(
      `UPDATE users SET is_premium = TRUE, premium_until = $2 WHERE id = $1`,
      [userId, until]
    );
    console.log(`[Admin] User ${userId} set to premium for ${days} days`);
    res.json({ success: true, userId, isPremium: true, premiumUntil: until });
  } else {
    await pool.query(
      `UPDATE users SET is_premium = FALSE, premium_until = NULL WHERE id = $1`,
      [userId]
    );
    console.log(`[Admin] User ${userId} premium revoked`);
    res.json({ success: true, userId, isPremium: false });
  }
});

export default router;
