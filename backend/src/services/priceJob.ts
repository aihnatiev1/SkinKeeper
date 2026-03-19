import cron from "node-cron";
import { fetchSkinportPrices, savePrices, getUniqueInventoryNames, startSteamCrawlers, stopSteamCrawlers, pruneOldPrices } from "./prices.js";
import { startCSFloatCrawler, stopCSFloatCrawler } from "./csfloat.js";
import { fetchDMarketPrices } from "./dmarket.js";
import { fetchSteamAnalystPrices } from "./steamAnalyst.js";
import { fetchCSGOTraderPrices, runCSGOTraderDailySeed } from "./csgoTrader.js";
import { refreshBuffIds } from "./buffIds.js";
import { initFadeData } from "./fadeData.js";
import { runDailyPLSnapshot } from "./profitLoss.js";
import { checkExpiredSubscriptions } from "./purchases.js";
import { recordFetchStart, recordSuccess, recordFailure } from "./priceStats.js";
import { initProxyPool } from "./proxyPool.js";

// ─── Job Health Tracking ────────────────────────────────────────────────

interface JobHealth {
  lastRun: Date | null;
  lastSuccess: Date | null;
  consecutiveFailures: number;
  lastError: string | null;
}

const jobHealth: Record<string, JobHealth> = {
  skinport: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  csgotrader: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  buff: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  buff_bid: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  bitskins: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  csmoney: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  youpin: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  lisskins: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  steam_analyst: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  dmarket: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  steam: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  csfloat: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  plSnapshot: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
  subscriptions: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
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
      recordJobRun("csgotrader", true);
    } catch (err) {
      recordJobRun("csgotrader", false, err instanceof Error ? err.message : String(err));
      console.error("[CRON] CSGOTrader daily seed failed:", err);
    }
  }));

  // SteamAnalyst: every 15 minutes (bulk — all items in 1 call)
  scheduledTasks.push(cron.schedule("*/15 * * * *", async () => {
    try {
      await fetchSteamAnalystPrices();
      recordJobRun("steam_analyst", true);
    } catch (err) {
      recordJobRun("steam_analyst", false, err instanceof Error ? err.message : String(err));
      console.error("[CRON] SteamAnalyst price fetch failed:", err);
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

  // Steam Market: parallel crawlers (one per proxy slot)
  startSteamCrawlers();

  // CSFloat: parallel crawlers (one per proxy slot)
  startCSFloatCrawler();

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

  // Prune old price_history at 02:00 UTC daily
  // Strategy: keep 7 days detailed, aggregate 7-90d to daily, delete >90d
  scheduledTasks.push(cron.schedule("0 2 * * *", async () => {
    try {
      await pruneOldPrices();
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

    // Phase 1.5: Static data (buff IDs + fade percentages) in parallel
    await Promise.allSettled([
      refreshBuffIds().catch((err) =>
        console.error("[INIT] BuffIds fetch failed:", err)
      ),
      initFadeData().catch((err) =>
        console.error("[INIT] FadeData init failed:", err)
      ),
    ]);

    // Phase 2: Live sources in parallel (they won't conflict)
    await Promise.allSettled([
      fetchAndSaveSkinport().catch((err) =>
        console.error("[INIT] Initial Skinport fetch failed:", err)
      ),
      fetchSteamAnalystPrices().catch((err) =>
        console.error("[INIT] Initial SteamAnalyst fetch failed:", err)
      ),
      fetchAndSaveDMarket().catch((err) =>
        console.error("[INIT] Initial DMarket fetch failed:", err)
      ),
    ]);
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
  stopSteamCrawlers();
  stopCSFloatCrawler();

  console.log("[CRON] All jobs stopped");
}
