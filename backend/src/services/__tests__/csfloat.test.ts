import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";

vi.mock("axios");
const mockedAxios = vi.mocked(axios);

// Mock prices.js to avoid AdaptiveCrawler DB access
vi.mock("../prices.js", () => ({
  AdaptiveCrawler: class {
    constructor(_config: any, _source: string, _fetchFn: any) {}
    start(_interval: number) {}
    stop() {}
  },
  savePrices: vi.fn().mockResolvedValue(undefined),
}));

describe("csfloat", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, CSFLOAT_API_KEY: "test-api-key" };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("startCSFloatCrawler", () => {
    it("does not throw when API key is set", async () => {
      const { startCSFloatCrawler } = await import("../csfloat.js");
      expect(() => startCSFloatCrawler()).not.toThrow();
    });

    it("does not throw when API key is missing", async () => {
      delete process.env.CSFLOAT_API_KEY;
      const { startCSFloatCrawler } = await import("../csfloat.js");
      expect(() => startCSFloatCrawler()).not.toThrow();
    });
  });

  describe("stopCSFloatCrawler", () => {
    it("does not throw", async () => {
      const { stopCSFloatCrawler } = await import("../csfloat.js");
      expect(() => stopCSFloatCrawler()).not.toThrow();
    });
  });

  describe("fetchCSFloatPrices", () => {
    it("returns empty Map (backward-compat stub)", async () => {
      const { fetchCSFloatPrices } = await import("../csfloat.js");
      const result = await fetchCSFloatPrices([
        "AK-47 | Redline (Field-Tested)",
        "AWP | Asiimov (Field-Tested)",
      ]);
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });

    it("returns empty Map for empty input", async () => {
      const { fetchCSFloatPrices } = await import("../csfloat.js");
      const result = await fetchCSFloatPrices([]);
      expect(result).toBeInstanceOf(Map);
      expect(result.size).toBe(0);
    });
  });
});
