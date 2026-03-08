import cron from "node-cron";
import { fetchSkinportPrices, savePrices, getUniqueInventoryNames } from "./prices.js";
import { fetchCSFloatPrices } from "./csfloat.js";
import { fetchDMarketPrices } from "./dmarket.js";

async function fetchAndSaveSkinport(): Promise<void> {
  console.log("[CRON] Fetching Skinport prices...");
  const prices = await fetchSkinportPrices();
  await savePrices(prices, "skinport");
  console.log(`[CRON] Saved ${prices.size} Skinport prices`);
}

async function fetchAndSaveCSFloat(): Promise<void> {
  console.log("[CRON] Fetching CSFloat prices...");
  const names = await getUniqueInventoryNames();
  if (names.length === 0) {
    console.log("[CRON] No inventory items, skipping CSFloat fetch");
    return;
  }
  const prices = await fetchCSFloatPrices(names);
  if (prices.size > 0) {
    await savePrices(prices, "csfloat");
  }
  console.log(`[CRON] Saved ${prices.size} CSFloat prices`);
}

async function fetchAndSaveDMarket(): Promise<void> {
  console.log("[CRON] Fetching DMarket prices...");
  const names = await getUniqueInventoryNames();
  if (names.length === 0) {
    console.log("[CRON] No inventory items, skipping DMarket fetch");
    return;
  }
  const prices = await fetchDMarketPrices(names);
  if (prices.size > 0) {
    await savePrices(prices, "dmarket");
  }
  console.log(`[CRON] Saved ${prices.size} DMarket prices`);
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

  // CSFloat: every 10 minutes, offset +2 (per-item, rate limited)
  cron.schedule("2,12,22,32,42,52 * * * *", async () => {
    try {
      await fetchAndSaveCSFloat();
    } catch (err) {
      console.error("[CRON] CSFloat price fetch failed:", err);
    }
  });

  // DMarket: every 10 minutes, offset +5 (per-item, rate limited)
  cron.schedule("5,15,25,35,45,55 * * * *", async () => {
    try {
      await fetchAndSaveDMarket();
    } catch (err) {
      console.error("[CRON] DMarket price fetch failed:", err);
    }
  });

  // Initial fetch on startup (all 3 sources, non-blocking)
  (async () => {
    try {
      await fetchAndSaveSkinport();
    } catch (err) {
      console.error("[INIT] Initial Skinport fetch failed:", err);
    }

    try {
      await fetchAndSaveCSFloat();
    } catch (err) {
      console.error("[INIT] Initial CSFloat fetch failed:", err);
    }

    try {
      await fetchAndSaveDMarket();
    } catch (err) {
      console.error("[INIT] Initial DMarket fetch failed:", err);
    }
  })();
}
