import cron from "node-cron";
import { fetchSkinportPrices, savePrices, getUniqueInventoryNames, startSteamCrawler } from "./prices.js";
import { startCSFloatCrawler } from "./csfloat.js";
import { fetchDMarketPrices } from "./dmarket.js";
import { runDailyPLSnapshot } from "./profitLoss.js";
import { checkExpiredSubscriptions } from "./purchases.js";
import { recordFetchStart, recordSuccess, recordFailure } from "./priceStats.js";

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

export function startPriceJobs() {
  // Skinport: every 5 minutes (bulk endpoint, no per-item needed)
  cron.schedule("*/5 * * * *", async () => {
    try {
      await fetchAndSaveSkinport();
    } catch (err) {
      console.error("[CRON] Skinport price fetch failed:", err);
    }
  });

  // DMarket: every 10 minutes, offset +5 (bulk per-item)
  cron.schedule("5,15,25,35,45,55 * * * *", async () => {
    try {
      await fetchAndSaveDMarket();
    } catch (err) {
      console.error("[CRON] DMarket price fetch failed:", err);
    }
  });

  // Steam Market: background crawler (1 item per 3.5s, no API key needed)
  startSteamCrawler();

  // CSFloat: background crawler (1 item per 5s, respects 429)
  startCSFloatCrawler();

  // Daily P/L snapshots at 00:05 UTC
  cron.schedule("5 0 * * *", async () => {
    try {
      await runDailyPLSnapshot();
    } catch (err) {
      console.error("[CRON] Daily P/L snapshot failed:", err);
    }
  });

  // Check expired subscriptions every hour
  cron.schedule("0 * * * *", async () => {
    try {
      await checkExpiredSubscriptions();
    } catch (err) {
      console.error("[CRON] Subscription check failed:", err);
    }
  });

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
