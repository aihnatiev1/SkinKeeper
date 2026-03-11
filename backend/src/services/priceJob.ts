import cron from "node-cron";
import { fetchSkinportPrices, savePrices, getUniqueInventoryNames, startSteamCrawler, stopSteamCrawler } from "./prices.js";
import { startCSFloatCrawler, stopCSFloatCrawler } from "./csfloat.js";
import { fetchDMarketPrices } from "./dmarket.js";
import { runDailyPLSnapshot } from "./profitLoss.js";
import { checkExpiredSubscriptions } from "./purchases.js";
import { recordFetchStart, recordSuccess, recordFailure } from "./priceStats.js";

// ─── Job Health Tracking ────────────────────────────────────────────────

interface JobHealth {
  lastRun: Date | null;
  lastSuccess: Date | null;
  consecutiveFailures: number;
  lastError: string | null;
}

const jobHealth: Record<string, JobHealth> = {
  skinport: { lastRun: null, lastSuccess: null, consecutiveFailures: 0, lastError: null },
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
  // Skinport: every 5 minutes (bulk endpoint, no per-item needed)
  scheduledTasks.push(cron.schedule("*/5 * * * *", async () => {
    try {
      await fetchAndSaveSkinport();
      recordJobRun("skinport", true);
    } catch (err) {
      recordJobRun("skinport", false, err instanceof Error ? err.message : String(err));
      console.error("[CRON] Skinport price fetch failed:", err);
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

  // Steam Market: background crawler (1 item per 3.5s, no API key needed)
  startSteamCrawler();

  // CSFloat: background crawler (1 item per 5s, respects 429)
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

  // Initial fetch on startup (bulk sources only)
  (async () => {
    try {
      await fetchAndSaveSkinport();
    } catch (err) {
      console.error("[INIT] Initial Skinport fetch failed:", err);
    }

    try {
      await fetchAndSaveDMarket();
    } catch (err) {
      console.error("[INIT] Initial DMarket fetch failed:", err);
    }
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
  stopSteamCrawler();
  stopCSFloatCrawler();

  console.log("[CRON] All jobs stopped");
}
