import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock all dependencies before imports
vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn(() => ({ stop: vi.fn() })),
  },
}));

vi.mock("../prices.js", () => ({
  fetchSkinportPrices: vi.fn().mockResolvedValue(new Map([["AK-47", 12.34]])),
  savePrices: vi.fn().mockResolvedValue(undefined),
  getUniqueInventoryNames: vi.fn().mockResolvedValue(["AK-47 | Redline (Field-Tested)", "AWP | Asiimov (Field-Tested)"]),
  startSteamCrawlers: vi.fn(),
  stopSteamCrawlers: vi.fn(),
  startSteamCrawler: vi.fn(),
  stopSteamCrawler: vi.fn(),
  runSteamBatchCrawl: vi.fn().mockResolvedValue(undefined),
  pruneOldPrices: vi.fn().mockResolvedValue(undefined),
  purgeStaleCurrentPrices: vi.fn().mockResolvedValue(undefined),
  startHotSteamLoop: vi.fn(),
  stopHotSteamLoop: vi.fn(),
}));

vi.mock("../csfloat.js", () => ({
  fetchCSFloatPrices: vi.fn().mockResolvedValue(new Map([["AK-47 | Redline (Field-Tested)", 11.50]])),
  startCSFloatCrawler: vi.fn(),
  stopCSFloatCrawler: vi.fn(),
}));

vi.mock("../dmarket.js", () => ({
  fetchDMarketPrices: vi.fn().mockResolvedValue(new Map([["AK-47 | Redline (Field-Tested)", 10.99]])),
}));

vi.mock("../profitLoss.js", () => ({
  runDailyPLSnapshot: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../purchases.js", () => ({
  checkExpiredSubscriptions: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../priceStats.js", () => ({
  recordFetchStart: vi.fn(() => vi.fn()),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("../steamAnalyst.js", () => ({
  fetchSteamAnalystPrices: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../csgoTrader.js", () => ({
  fetchCSGOTraderPrices: vi.fn().mockResolvedValue(25000),
  runCSGOTraderDailySeed: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../buffIds.js", () => ({
  refreshBuffIds: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../fadeData.js", () => ({
  initFadeData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../steamMarketDepth.js", () => ({
  refreshSteamDepthData: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../proxyPool.js", () => ({
  initProxyPool: vi.fn(),
}));

vi.mock("../priceChangeNotifier.js", () => ({
  checkPriceChanges: vi.fn().mockResolvedValue(undefined),
}));

import cron from "node-cron";
import { fetchSkinportPrices, savePrices, getUniqueInventoryNames, startSteamCrawlers } from "../prices.js";
import { startCSFloatCrawler } from "../csfloat.js";
import { fetchDMarketPrices } from "../dmarket.js";
import { fetchCSGOTraderPrices, runCSGOTraderDailySeed } from "../csgoTrader.js";

const mockedCron = vi.mocked(cron);
const mockedSavePrices = vi.mocked(savePrices);
const mockedGetUniqueNames = vi.mocked(getUniqueInventoryNames);
const mockedFetchDMarket = vi.mocked(fetchDMarketPrices);
const mockedFetchSkinport = vi.mocked(fetchSkinportPrices);

describe("priceJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("schedules cron jobs + starts crawlers", async () => {
    const { startPriceJobs } = await import("../priceJob.js");
    startPriceJobs();

    // Wait for the initial async IIFE to complete
    await new Promise((r) => setTimeout(r, 50));

    // 11 cron jobs: Skinport, CSGOTrader, DMarket, P/L, priceChangeNotify,
    //   subscriptions, sessionRefresh, sessionExpiryNotify,
    //   SteamDepth, steamBatchFull, pruning
    expect(mockedCron.schedule).toHaveBeenCalledTimes(11);

    // Background crawlers started. CSFloat crawler is currently disabled
    // in priceJob.ts (commented out), so only the Steam crawler is asserted.
    expect(startSteamCrawlers).toHaveBeenCalled();

    // Verify cron expressions
    const calls = (mockedCron.schedule as any).mock.calls;
    const schedules = calls.map((c: any[]) => c[0]);

    expect(schedules).toContain("*/10 * * * *"); // Skinport (was */5)
    expect(schedules).toContain("0 0 * * *"); // CSGOTrader daily seed
    expect(schedules).toContain("5,15,25,35,45,55 * * * *"); // DMarket
    expect(schedules).toContain("5 0 * * *"); // P/L daily snapshot
    expect(schedules).toContain("0 * * * *"); // Subscriptions
  });

  it("DMarket cron fetches unique names then calls fetcher then savePrices", async () => {
    const { startPriceJobs } = await import("../priceJob.js");
    startPriceJobs();

    const calls = (mockedCron.schedule as any).mock.calls;
    const dmarketCall = calls.find((c: any[]) => c[0] === "5,15,25,35,45,55 * * * *");
    expect(dmarketCall).toBeDefined();

    const callback = dmarketCall![1];
    await callback();

    expect(mockedGetUniqueNames).toHaveBeenCalled();
    expect(mockedFetchDMarket).toHaveBeenCalledWith([
      "AK-47 | Redline (Field-Tested)",
      "AWP | Asiimov (Field-Tested)",
    ]);
    expect(mockedSavePrices).toHaveBeenCalledWith(
      new Map([["AK-47 | Redline (Field-Tested)", 10.99]]),
      "dmarket"
    );
  });

  it("initial fetch on startup seeds CSGOTrader first, then others", async () => {
    const { startPriceJobs } = await import("../priceJob.js");
    startPriceJobs();

    // Wait for the initial async IIFE to complete
    await new Promise((r) => setTimeout(r, 100));

    // CSGOTrader daily seed runs first (phase 1 — all sources)
    expect(runCSGOTraderDailySeed).toHaveBeenCalled();

    // Skinport initial fetch (phase 2)
    expect(mockedFetchSkinport).toHaveBeenCalled();
    expect(mockedSavePrices).toHaveBeenCalledWith(
      new Map([["AK-47", 12.34]]),
      "skinport"
    );

    // DMarket initial fetch (phase 2)
    expect(mockedFetchDMarket).toHaveBeenCalled();
  });

  it("stopAllJobs stops crawlers and cron tasks", async () => {
    const { startPriceJobs, stopAllJobs } = await import("../priceJob.js");
    startPriceJobs();

    await new Promise((r) => setTimeout(r, 50));

    stopAllJobs();

    // Each cron.schedule returns an object with stop()
    const taskStops = (mockedCron.schedule as any).mock.results.map(
      (r: any) => r.value.stop
    );
    for (const stopFn of taskStops) {
      expect(stopFn).toHaveBeenCalled();
    }
  });

  it("getJobHealth returns health status for all jobs", async () => {
    const { getJobHealth } = await import("../priceJob.js");
    const health = getJobHealth();

    expect(health).toHaveProperty("skinport");
    expect(health).toHaveProperty("csgotrader_seed");
    expect(health).toHaveProperty("buff");
    expect(health).toHaveProperty("buff_bid");
    expect(health).toHaveProperty("bitskins");
    expect(health).toHaveProperty("csmoney");
    expect(health).toHaveProperty("youpin");
    expect(health).toHaveProperty("lisskins");
    expect(health).toHaveProperty("dmarket");
    expect(health).toHaveProperty("steam");
    expect(health).toHaveProperty("csfloat");
    expect(health).toHaveProperty("plSnapshot");
    expect(health).toHaveProperty("subscriptions");

    expect(health.skinport).toHaveProperty("lastRun");
    expect(health.skinport).toHaveProperty("consecutiveFailures");
  });
});
