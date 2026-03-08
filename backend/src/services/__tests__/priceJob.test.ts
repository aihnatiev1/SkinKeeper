import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock all dependencies before imports
vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn(),
  },
}));

vi.mock("../prices.js", () => ({
  fetchSkinportPrices: vi.fn().mockResolvedValue(new Map([["AK-47", 12.34]])),
  savePrices: vi.fn().mockResolvedValue(undefined),
  getUniqueInventoryNames: vi.fn().mockResolvedValue(["AK-47 | Redline (Field-Tested)", "AWP | Asiimov (Field-Tested)"]),
}));

vi.mock("../csfloat.js", () => ({
  fetchCSFloatPrices: vi.fn().mockResolvedValue(new Map([["AK-47 | Redline (Field-Tested)", 11.50]])),
}));

vi.mock("../dmarket.js", () => ({
  fetchDMarketPrices: vi.fn().mockResolvedValue(new Map([["AK-47 | Redline (Field-Tested)", 10.99]])),
}));

import cron from "node-cron";
import { fetchSkinportPrices, savePrices, getUniqueInventoryNames } from "../prices.js";
import { fetchCSFloatPrices } from "../csfloat.js";
import { fetchDMarketPrices } from "../dmarket.js";

const mockedCron = vi.mocked(cron);
const mockedSavePrices = vi.mocked(savePrices);
const mockedGetUniqueNames = vi.mocked(getUniqueInventoryNames);
const mockedFetchCSFloat = vi.mocked(fetchCSFloatPrices);
const mockedFetchDMarket = vi.mocked(fetchDMarketPrices);
const mockedFetchSkinport = vi.mocked(fetchSkinportPrices);

describe("priceJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("schedules 3 cron jobs (Skinport, CSFloat, DMarket)", async () => {
    const { startPriceJobs } = await import("../priceJob.js");
    startPriceJobs();

    // Wait for the initial async IIFE to complete
    await new Promise((r) => setTimeout(r, 50));

    expect(mockedCron.schedule).toHaveBeenCalledTimes(3);

    // Verify cron expressions
    const calls = (mockedCron.schedule as any).mock.calls;
    const schedules = calls.map((c: any[]) => c[0]);

    expect(schedules).toContain("*/5 * * * *"); // Skinport
    expect(schedules).toContain("2,12,22,32,42,52 * * * *"); // CSFloat
    expect(schedules).toContain("5,15,25,35,45,55 * * * *"); // DMarket
  });

  it("CSFloat cron fetches unique names then calls fetcher then savePrices", async () => {
    const { startPriceJobs } = await import("../priceJob.js");
    startPriceJobs();

    // Find the CSFloat cron callback
    const calls = (mockedCron.schedule as any).mock.calls;
    const csfloatCall = calls.find((c: any[]) => c[0] === "2,12,22,32,42,52 * * * *");
    expect(csfloatCall).toBeDefined();

    const callback = csfloatCall![1];
    await callback();

    expect(mockedGetUniqueNames).toHaveBeenCalled();
    expect(mockedFetchCSFloat).toHaveBeenCalledWith([
      "AK-47 | Redline (Field-Tested)",
      "AWP | Asiimov (Field-Tested)",
    ]);
    expect(mockedSavePrices).toHaveBeenCalledWith(
      new Map([["AK-47 | Redline (Field-Tested)", 11.50]]),
      "csfloat"
    );
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

  it("does NOT call savePrices when fetcher returns empty Map", async () => {
    mockedFetchCSFloat.mockResolvedValueOnce(new Map());

    const { startPriceJobs } = await import("../priceJob.js");
    startPriceJobs();

    const calls = (mockedCron.schedule as any).mock.calls;
    const csfloatCall = calls.find((c: any[]) => c[0] === "2,12,22,32,42,52 * * * *");
    const callback = csfloatCall![1];
    await callback();

    // savePrices should not be called with "csfloat" source when empty
    const saveCallsWithCSFloat = mockedSavePrices.mock.calls.filter(
      (c) => c[1] === "csfloat"
    );
    expect(saveCallsWithCSFloat).toHaveLength(0);
  });

  it("initial fetch on startup includes all 3 sources", async () => {
    const { startPriceJobs } = await import("../priceJob.js");
    startPriceJobs();

    // Wait for the initial async IIFE to complete
    await new Promise((r) => setTimeout(r, 100));

    // Skinport initial fetch
    expect(mockedFetchSkinport).toHaveBeenCalled();
    expect(mockedSavePrices).toHaveBeenCalledWith(
      new Map([["AK-47", 12.34]]),
      "skinport"
    );

    // CSFloat and DMarket initial fetch
    expect(mockedFetchCSFloat).toHaveBeenCalled();
    expect(mockedFetchDMarket).toHaveBeenCalled();
  });
});
