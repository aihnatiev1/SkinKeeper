import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const mockQuery = vi.fn();
vi.mock("../../db/pool.js", () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
}));
vi.mock("../../utils/cacheRegistry.js", () => ({
  registerCache: vi.fn(),
}));

import {
  getFeatureFlagsForUser,
  isFeatureEnabled,
  setFeatureFlag,
  invalidateFeatureFlagsCache,
  userBucket,
  getCanaryConfig,
  _resetFeatureFlagsCacheForTests,
} from "../featureFlags.js";

const ENV_KEYS = [
  "KILL_AUTO_SELL", "KILL_SMART_ALERTS", "KILL_TOUR",
  "CANARY_AUTO_SELL_PCT", "CANARY_SMART_ALERTS_PCT", "CANARY_TOUR_PCT",
];

describe("featureFlags service", () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    mockQuery.mockReset();
    _resetFeatureFlagsCacheForTests();
    for (const k of ENV_KEYS) {
      originalEnv[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (originalEnv[k] === undefined) delete process.env[k];
      else process.env[k] = originalEnv[k];
    }
  });

  describe("userBucket", () => {
    it("is deterministic for the same userId", () => {
      const b1 = userBucket(42);
      const b2 = userBucket(42);
      expect(b1).toBe(b2);
    });

    it("returns 0..99", () => {
      for (const id of [1, 2, 100, 999_999, 12345678]) {
        const b = userBucket(id);
        expect(b).toBeGreaterThanOrEqual(0);
        expect(b).toBeLessThan(100);
      }
    });
  });

  describe("getFeatureFlagsForUser", () => {
    it("returns user flags from DB when set", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ feature_flags: { auto_sell: true, tour: false } }],
      });
      const flags = await getFeatureFlagsForUser(1);
      expect(flags.auto_sell).toBe(true);
      expect(flags.tour).toBe(false);
    });

    it("defaults to false when no override and no canary", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ feature_flags: {} }] });
      const flags = await getFeatureFlagsForUser(2);
      expect(flags.auto_sell).toBe(false);
      expect(flags.smart_alerts).toBe(false);
      expect(flags.tour).toBe(false);
    });

    it("kill switch overrides user flag set to true", async () => {
      process.env.KILL_AUTO_SELL = "1";
      mockQuery.mockResolvedValueOnce({
        rows: [{ feature_flags: { auto_sell: true } }],
      });
      const flags = await getFeatureFlagsForUser(3);
      expect(flags.auto_sell).toBe(false);
    });

    it("kill switch overrides canary", async () => {
      process.env.KILL_TOUR = "true";
      process.env.CANARY_TOUR_PCT = "100";
      mockQuery.mockResolvedValueOnce({ rows: [{ feature_flags: {} }] });
      const flags = await getFeatureFlagsForUser(4);
      expect(flags.tour).toBe(false);
    });

    it("canary 0% — all users get false", async () => {
      process.env.CANARY_AUTO_SELL_PCT = "0";
      // Test 50 sequential users.
      let trueCount = 0;
      for (let id = 1; id <= 50; id++) {
        _resetFeatureFlagsCacheForTests();
        mockQuery.mockResolvedValueOnce({ rows: [{ feature_flags: {} }] });
        const flags = await getFeatureFlagsForUser(id);
        if (flags.auto_sell) trueCount++;
      }
      expect(trueCount).toBe(0);
    });

    it("canary 100% — all users get true", async () => {
      process.env.CANARY_AUTO_SELL_PCT = "100";
      let trueCount = 0;
      for (let id = 1; id <= 50; id++) {
        _resetFeatureFlagsCacheForTests();
        mockQuery.mockResolvedValueOnce({ rows: [{ feature_flags: {} }] });
        const flags = await getFeatureFlagsForUser(id);
        if (flags.auto_sell) trueCount++;
      }
      expect(trueCount).toBe(50);
    });

    it("canary 10% — distribution within tolerance for 1000 users", async () => {
      process.env.CANARY_AUTO_SELL_PCT = "10";
      let trueCount = 0;
      for (let id = 1; id <= 1000; id++) {
        _resetFeatureFlagsCacheForTests();
        mockQuery.mockResolvedValueOnce({ rows: [{ feature_flags: {} }] });
        const flags = await getFeatureFlagsForUser(id);
        if (flags.auto_sell) trueCount++;
      }
      // ~10% with tolerance 8-12% (modular hash on small ID range can drift slightly).
      expect(trueCount).toBeGreaterThanOrEqual(80);
      expect(trueCount).toBeLessThanOrEqual(120);
    });

    it("explicit user override true bypasses canary 0%", async () => {
      process.env.CANARY_AUTO_SELL_PCT = "0";
      mockQuery.mockResolvedValueOnce({
        rows: [{ feature_flags: { auto_sell: true } }],
      });
      const flags = await getFeatureFlagsForUser(7);
      expect(flags.auto_sell).toBe(true);
    });

    it("explicit user override false bypasses canary 100%", async () => {
      process.env.CANARY_AUTO_SELL_PCT = "100";
      mockQuery.mockResolvedValueOnce({
        rows: [{ feature_flags: { auto_sell: false } }],
      });
      const flags = await getFeatureFlagsForUser(8);
      expect(flags.auto_sell).toBe(false);
    });

    it("caches result — second call within TTL hits no DB", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ feature_flags: { auto_sell: true } }],
      });
      const a = await getFeatureFlagsForUser(99);
      const b = await getFeatureFlagsForUser(99);
      expect(a).toEqual(b);
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it("invalidateFeatureFlagsCache forces a re-read", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ feature_flags: { auto_sell: true } }],
      });
      await getFeatureFlagsForUser(11);
      invalidateFeatureFlagsCache(11);
      mockQuery.mockResolvedValueOnce({
        rows: [{ feature_flags: { auto_sell: false } }],
      });
      const after = await getFeatureFlagsForUser(11);
      expect(after.auto_sell).toBe(false);
      expect(mockQuery).toHaveBeenCalledTimes(2);
    });
  });

  describe("isFeatureEnabled", () => {
    it("returns true when user flag is true", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ feature_flags: { auto_sell: true } }],
      });
      expect(await isFeatureEnabled(1, "auto_sell")).toBe(true);
    });

    it("returns false when flag missing and default false", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ feature_flags: {} }] });
      expect(await isFeatureEnabled(1, "auto_sell", false)).toBe(false);
    });

    it("returns defaultValue for unknown flag not in FLAG_NAMES", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ feature_flags: {} }] });
      expect(await isFeatureEnabled(1, "totally_unknown_flag", true)).toBe(true);
    });
  });

  describe("setFeatureFlag", () => {
    it("issues UPDATE with jsonb_set when value is boolean", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE
      mockQuery.mockResolvedValueOnce({
        rows: [{ feature_flags: { auto_sell: true } }],
      }); // re-read for cache
      const result = await setFeatureFlag(5, "auto_sell", true);
      expect(result.auto_sell).toBe(true);
      const updateCall = mockQuery.mock.calls[0][0] as string;
      expect(updateCall).toContain("jsonb_set");
    });

    it("issues UPDATE with - operator when value is null (clears override)", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      mockQuery.mockResolvedValueOnce({ rows: [{ feature_flags: {} }] });
      await setFeatureFlag(5, "auto_sell", null);
      const updateCall = mockQuery.mock.calls[0][0] as string;
      expect(updateCall).toContain("feature_flags - $2");
    });

    it("invalidates the cache", async () => {
      // prime cache
      mockQuery.mockResolvedValueOnce({
        rows: [{ feature_flags: { auto_sell: false } }],
      });
      await getFeatureFlagsForUser(20);
      expect(mockQuery).toHaveBeenCalledTimes(1);

      // setFeatureFlag: 1 UPDATE + 1 SELECT (re-read after invalidate)
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      mockQuery.mockResolvedValueOnce({
        rows: [{ feature_flags: { auto_sell: true } }],
      });
      const fresh = await setFeatureFlag(20, "auto_sell", true);
      expect(fresh.auto_sell).toBe(true);
    });
  });

  describe("getCanaryConfig", () => {
    it("returns 0% percentage when no env set", () => {
      const cfg = getCanaryConfig();
      const autoSell = cfg.find(c => c.flag === "auto_sell");
      expect(autoSell?.percentage).toBe(0);
      expect(autoSell?.killed).toBe(false);
    });

    it("clamps percentage to 0..100", () => {
      process.env.CANARY_AUTO_SELL_PCT = "150";
      const cfg = getCanaryConfig();
      expect(cfg.find(c => c.flag === "auto_sell")?.percentage).toBe(100);
    });

    it("reflects kill switch", () => {
      process.env.KILL_TOUR = "1";
      const cfg = getCanaryConfig();
      expect(cfg.find(c => c.flag === "tour")?.killed).toBe(true);
    });
  });
});
