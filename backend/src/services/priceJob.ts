import cron from "node-cron";
import { pool } from "../db/pool.js";
import { fetchSkinportPrices, savePrices, getUniqueInventoryNames, startSteamCrawlers, stopSteamCrawlers, runSteamBatchCrawl, pruneOldPrices, purgeStaleCurrentPrices, startHotSteamLoop, stopHotSteamLoop } from "./prices.js";
import { startCSFloatCrawler, stopCSFloatCrawler } from "./csfloat.js";
import { fetchDMarketPrices } from "./dmarket.js";
import { runCSGOTraderDailySeed } from "./csgoTrader.js";
import { refreshBuffIds } from "./buffIds.js";
import { initFadeData } from "./fadeData.js";
import { refreshSteamDepthData } from "./steamMarketDepth.js";
import { runDailyPLSnapshot } from "./profitLoss.js";
import { checkExpiredSubscriptions } from "./purchases.js";
import { recordFetchStart, recordSuccess, recordFailure } from "./priceStats.js";
import { checkPriceChanges } from "./priceChangeNotifier.js";
import { initProxyPool } from "./proxyPool.js";
import { runSessionRefreshSweep } from "./sessionRefreshJob.js";
import { runSessionExpiryNotifierSweep } from "./sessionExpiryNotifier.js";

// ─── Job Health Tracking ────────────────────────────────────────────────

interface JobHealth {
  lastRun: Date | null;
  lastSuccess: Date | null;
  consecutiveFailures: number;
  lastError: string | null;
}

const jobHealth: Record<string, JobHealth> = {
  skinport: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  csgotrader_seed: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  buff: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  buff_bid: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  bitskins: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  csmoney: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  youpin: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  lisskins: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  dmarket: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  steam: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  csfloat: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  plSnapshot: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  subscriptions: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  sessionRefresh: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
};

function recordJobRun(name: string, success: boolean, error?: string): void {
  const job = jobHealth[name];
  if (!job) return;
  job.lastRun = new Date();
  if (success) {
    job.lastSuccess = new Date();
    job.consecutiveFailures = 0;
    job.lastError = null;
  } else {
    job.consecutiveFailures++;
    job.lastError = error ?? "Unknown error";
    if (job.consecutiveFailures >= 3) {
      console.warn(`[CRON] ${name} has ${job.consecutiveFailures} consecutive failures — consider investigation`);
    }
  }
}

export function getJobHealth(): Record<string, JobHealth> {
  return { ...jobHealth };
}

async function fetchAndSaveSkinport(): Promise<void> {
  console.log("[CRON] Fetching Skinport prices...");
  const prices = await fetchSkinportPrices();
  // savePrices only for new data (fetchSkinportPrices already records stats internally)
  await savePrices(prices, "skinport");
  console.log(`[CRON] Saved ${prices.size} Skinport prices`);
}

async function fetchAndSaveDMarket(): Promise<void> {
  console.log("[CRON] Fetching DMarket prices...");
  const endLatency = recordFetchStart("dmarket");
  const names = await getUniqueInventoryNames();
  if (names.length === 0) {
    endLatency();
    console.log("[CRON] No inventory items, skipping DMarket fetch");
    return;
  }
  try {
    const prices = await fetchDMarketPrices(names);
    endLatency();
    if (prices.size > 0) {
      await savePrices(prices, "dmarket");
    }
    recordSuccess("dmarket", prices.size);
    console.log(`[CRON] Saved ${prices.size}/${names.length} DMarket prices`);
  } catch (err: any) {
    endLatency();
    recordFailure("dmarket", err.message || String(err));
    throw err;
  }
}

// Track scheduled tasks for graceful shutdown
const scheduledTasks: cron.ScheduledTask[] = [];

export function startPriceJobs() {
  // Initialize proxy pool before starting any jobs
  initProxyPool();

  // Skinport: every 10 minutes (was 5 — reduced to stay well within 8 req/5min limit)
  scheduledTasks.push(cron.schedule("*/10 * * * *", async () => {
    try {
      await fetchAndSaveSkinport();
      recordJobRun("skinport", true);
    } catch (err) {
      recordJobRun("skinport", false, err instanceof Error ? err.message : String(err));
      console.error("[CRON] Skinport price fetch failed:", err);
    }
  }));

  // CSGOTrader daily seed: midnight UTC — bulk fetch ALL sources
  // (steam, buff163, skinport, csfloat, bitskins) in one go
  scheduledTasks.push(cron.schedule("0 0 * * *", async () => {
    try {
      await runCSGOTraderDailySeed();
      recordJobRun("csgotrader_seed", true);
    } catch (err) {
      recordJobRun("csgotrader_seed", false, err instanceof Error ? err.message : String(err));
      console.error("[CRON] CSGOTrader daily seed failed:", err);
    }
  }));


  // DMarket: every 10 minutes, offset +5 (bulk per-item)
  scheduledTasks.push(cron.schedule("5,15,25,35,45,55 * * * *", async () => {
    try {
      await fetchAndSaveDMarket();
      recordJobRun("dmarket", true);
    } catch (err) {
      recordJobRun("dmarket", false, err instanceof Error ? err.message : String(err));
      console.error("[CRON] DMarket price fetch failed:", err);
    }
  }));

  // ── PRIMARY: Hot Steam Loop (inventory items) ──────────────────────────
  // Continuous loop — always-fresh Steam prices for items users actually have.
  // Parallel workers (one per proxy slot), oldest-first priority queue.
  // 500 items ≈ 3 min cycle, 5K items ≈ 28 min cycle.
  startHotSteamLoop();

  // ── SECONDARY: Steam Batch Crawler (full market) ──────────────────────
  // Background scan of ALL 33K items for analytics, charts, price comparison.
  // Lower priority — runs every 2.5h, parallel per slot.
  startSteamCrawlers();

  // CSFloat crawler disabled — CSFloat aggressively 429s our IPs.
  // Prices still come via CSGOTrader daily seed (midnight UTC).
  // startCSFloatCrawler();

  // Daily P/L snapshots at 00:05 UTC
  scheduledTasks.push(cron.schedule("5 0 * * *", async () => {
    try {
      await runDailyPLSnapshot();
      recordJobRun("plSnapshot", true);
    } catch (err) {
      recordJobRun("plSnapshot", false, err instanceof Error ? err.message : String(err));
      console.error("[CRON] Daily P/L snapshot failed:", err);
    }
  }));

  // Price change push notifications every 4 hours (06:15, 10:15, 14:15, 18:15, 22:15)
  scheduledTasks.push(cron.schedule("15 6,10,14,18,22 * * *", async () => {
    try {
      await checkPriceChanges();
    } catch (err) {
      console.error("[CRON] Price change notifications failed:", err);
    }
  }));

  // Check expired subscriptions every hour
  scheduledTasks.push(cron.schedule("0 * * * *", async () => {
    try {
      await checkExpiredSubscriptions();
      recordJobRun("subscriptions", true);
    } catch (err) {
      recordJobRun("subscriptions", false, err instanceof Error ? err.message : String(err));
      console.error("[CRON] Subscription check failed:", err);
    }
  }));

  // Pre-emptive Steam session refresh: every 30 min.
  // Refreshes any account whose 24h access-token has <4h life left using the
  // long-lived refresh token. Keeps users logged in "forever" the same way
  // a browser silently rotates the token in the background.
  scheduledTasks.push(cron.schedule("*/30 * * * *", async () => {
    try {
      const { scanned, attempted } = await runSessionRefreshSweep();
      if (scanned > 0) {
        console.log(`[CRON] Session refresh sweep: scanned=${scanned} attempted=${attempted}`);
      }
      recordJobRun("sessionRefresh", true);
    } catch (err) {
      recordJobRun("sessionRefresh", false, err instanceof Error ? err.message : String(err));
      console.error("[CRON] Session refresh sweep failed:", err);
    }
  }));

  // Session-expiry warning push: daily at 09:00 UTC.
  // Warns users when their Steam refresh-token (~30d lifetime) has <=48h
  // left — past that point we can no longer auto-refresh and they'd lose
  // trading capability mid-day. Idempotent: skips accounts already warned
  // for the current refresh-token.
  scheduledTasks.push(cron.schedule("0 9 * * *", async () => {
    try {
      const { scanned, notified } = await runSessionExpiryNotifierSweep();
      if (notified > 0 || scanned > 0) {
        console.log(`[CRON] Session expiry notifier: scanned=${scanned} notified=${notified}`);
      }
      recordJobRun("sessionExpiryNotify", true);
    } catch (err) {
      recordJobRun("sessionExpiryNotify", false, err instanceof Error ? err.message : String(err));
      console.error("[CRON] Session expiry notifier failed:", err);
    }
  }));

  // Steam Market Depth: every 12 hours (after iflow dumps at 00:15/12:15)
  scheduledTasks.push(cron.schedule("30 0,12 * * *", async () => {
    try {
      await refreshSteamDepthData();
    } catch (err) {
      console.error("[CRON] Steam depth fetch failed:", err);
    }
  }));

  // Full Steam batch crawl (all pages) at 03:00 UTC daily — cheap items included
  scheduledTasks.push(cron.schedule("0 3 * * *", async () => {
    try {
      await runSteamBatchCrawl("full");
      recordJobRun("steamBatchFull", true);
    } catch (err) {
      recordJobRun("steamBatchFull", false, err instanceof Error ? err.message : String(err));
      console.error("[CRON] Full Steam batch failed:", err);
    }
  }));

  // Prune old price_history at 02:00 UTC daily
  scheduledTasks.push(cron.schedule("0 2 * * *", async () => {
    try {
      await pruneOldPrices();
      await purgeStaleCurrentPrices();
      // Cleanup push tokens older than 90 days
      await pool.query(`DELETE FROM user_devices WHERE updated_at < NOW() - INTERVAL '90 days'`);
      recordJobRun("pricePruning", true);
    } catch (err) {
      recordJobRun("pricePruning", false, err instanceof Error ? err.message : String(err));
      console.error("[CRON] Price pruning failed:", err);
    }
  }));

  // Initial fetch on startup — seed prices so first user always sees values.
  // Phase 1: CSGOTrader daily seed (all sources: steam, buff, skinport, csfloat, bitskins)
  // Phase 2: Live API sources in parallel for freshest prices
  (async () => {
    // Phase 1: CSGOTrader bulk seed — ~8 files, ~38K items each, zero 429 risk
    // Also loads exchange rates, doppler phase prices, buff IDs, fade data
    try {
      await runCSGOTraderDailySeed();
    } catch (err) {
      console.error("[INIT] CSGOTrader daily seed failed:", err);
    }

    // Phase 1.5: Static data (buff IDs + fade percentages + steam depth) in parallel
    await Promise.allSettled([
      refreshBuffIds().catch((err) =>
        console.error("[INIT] BuffIds fetch failed:", err)
      ),
      initFadeData().catch((err) =>
        console.error("[INIT] FadeData init failed:", err)
      ),
      refreshSteamDepthData().catch((err) =>
        console.error("[INIT] SteamDepth fetch failed:", err)
      ),
    ]);

    // Phase 2: Live sources in parallel (they won't conflict)
    await Promise.allSettled([
      fetchAndSaveSkinport().catch((err) =>
        console.error("[INIT] Initial Skinport fetch failed:", err)
      ),
      fetchAndSaveDMarket().catch((err) =>
        console.error("[INIT] Initial DMarket fetch failed:", err)
      ),
    ]);

    // Phase 3: Hot Steam Loop is already running (started above).
    // It will pick up all inventory items automatically, oldest-first.
  })();
}

/** Stop all background jobs for graceful shutdown. */
export function stopAllJobs(): void {
  // Stop cron scheduled tasks
  for (const task of scheduledTasks) {
    task.stop();
  }
  scheduledTasks.length = 0;

  // Stop crawlers
  stopHotSteamLoop();
  stopSteamCrawlers();
  stopCSFloatCrawler();

  console.log("[CRON] All jobs stopped");
}
