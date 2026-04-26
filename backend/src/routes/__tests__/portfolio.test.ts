import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createTestJwt } from "../../__tests__/helpers.js";

const mockQuery = vi.fn();
vi.mock("../../db/pool.js", () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  checkPoolHealth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/prices.js", () => ({
  getLatestPrices: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("../../services/profitLoss.js", () => ({
  getPortfolioPL: vi.fn().mockResolvedValue({
    totalInvestedCents: 10000,
    totalEarnedCents: 0,
    realizedProfitCents: 0,
    unrealizedProfitCents: 500,
    totalProfitCents: 500,
    totalProfitPct: 5,
    holdingCount: 2,
    totalCurrentValueCents: 10500,
  }),
  getPortfolioPLByAccount: vi.fn().mockResolvedValue([]),
  getItemsPL: vi.fn().mockResolvedValue({ items: [], total: 0 }),
  getPLHistory: vi.fn().mockResolvedValue([]),
  recalculateCostBasis: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../utils/cacheRegistry.js", () => ({
  registerCache: vi.fn(),
  getCacheStats: vi.fn().mockReturnValue([]),
}));

vi.mock("../../services/firebase.js", () => ({
  initFirebase: vi.fn(),
  isFirebaseReady: vi.fn().mockReturnValue(false),
  sendPush: vi.fn().mockResolvedValue({ successCount: 0, failedTokens: [] }),
}));

vi.mock("../../services/priceStats.js", () => ({
  getAllStats: vi.fn().mockReturnValue({ sources: [] }),
  recordFetchStart: vi.fn(() => vi.fn()),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
  record429: vi.fn(),
  updateCrawlerState: vi.fn(),
}));

vi.mock("../../services/priceJob.js", () => ({
  startPriceJobs: vi.fn(),
  stopAllJobs: vi.fn(),
  getJobHealth: vi.fn().mockReturnValue({}),
}));

vi.mock("../../services/steam.js", () => ({
  fetchSteamInventory: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../services/steamSession.js", () => ({
  SteamSessionService: {
    getActiveAccountId: vi.fn().mockResolvedValue(1),
    ensureValidSession: vi.fn().mockResolvedValue(null),
  },
}));

import { createTestApp } from "../../__tests__/app.js";

const app = createTestApp();
const jwt = createTestJwt(1);

// Auth middleware does a demo-check query: SELECT steam_id FROM users WHERE id = $1
const mockDemoCheck = () => mockQuery.mockResolvedValueOnce({ rows: [{ steam_id: "76561198000000001" }] });

describe("Portfolio routes", () => {
  beforeEach(async () => {
    mockQuery.mockReset();
    // requirePremium has a 5min in-memory cache keyed by userId.
    // Without invalidation, cached negatives from earlier tests cause
    // false 403s on subsequent tests using the same userId.
    const { invalidatePremiumCache } = await import("../../middleware/auth.js");
    invalidatePremiumCache(1);
  });

  describe("GET /api/portfolio/summary", () => {
    it("returns 401 without token", async () => {
      const res = await request(app).get("/api/portfolio/summary");
      expect(res.status).toBe(401);
    });

    it("returns portfolio summary with 0 value for empty inventory", async () => {
      // items query, 24h history query, 7d history query, snapshot history query
      mockQuery.mockResolvedValue({ rows: [] });

      const res = await request(app)
        .get("/api/portfolio/summary")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      expect(typeof res.body.total_value).toBe("number"); // route returns total_value
      expect(res.body.total_value).toBe(0);
    });

    it("returns total value calculated from prices", async () => {
      mockDemoCheck();
      const { getLatestPrices } = await import("../../services/prices.js");
      vi.mocked(getLatestPrices).mockResolvedValueOnce(
        new Map([["AK-47 | Redline (Field-Tested)", { skinport: 12.34 }]])
      );

      // inventory items
      mockQuery.mockResolvedValueOnce({
        rows: [{ market_hash_name: "AK-47 | Redline (Field-Tested)" }],
      });
      // 24h history query
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // 7d history query
      mockQuery.mockResolvedValueOnce({ rows: [] });
      // snapshot history
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/portfolio/summary")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.total_value).toBeCloseTo(12.34, 2);
    });
  });

  describe("GET /api/portfolio/pl/by-account", () => {
    // Regression: requirePremium was commented out (b0fde416, 2026-03-10) and
    // never restored alongside /pl/items in eec494c3. Restored in P9.T4.
    it("returns 401 without token", async () => {
      const res = await request(app).get("/api/portfolio/pl/by-account");
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-premium user", async () => {
      mockDemoCheck();
      // requirePremium queries is_premium
      mockQuery.mockResolvedValueOnce({ rows: [{ is_premium: false }] });
      const res = await request(app)
        .get("/api/portfolio/pl/by-account")
        .set("Authorization", `Bearer ${jwt}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("PREMIUM_REQUIRED");
    });

    it("returns 200 for premium user", async () => {
      mockDemoCheck();
      mockQuery.mockResolvedValueOnce({ rows: [{ is_premium: true }] });
      const { getPortfolioPLByAccount } = await import("../../services/profitLoss.js");
      vi.mocked(getPortfolioPLByAccount).mockResolvedValueOnce([]);
      const res = await request(app)
        .get("/api/portfolio/pl/by-account")
        .set("Authorization", `Bearer ${jwt}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("accounts");
    });
  });

  describe("GET /api/portfolio/pl/history", () => {
    it("returns 401 without token", async () => {
      const res = await request(app).get("/api/portfolio/pl/history");
      expect(res.status).toBe(401);
    });

    it("returns P/L history snapshots", async () => {
      mockDemoCheck(); // auth middleware demo check
      const { getPLHistory } = await import("../../services/profitLoss.js");
      vi.mocked(getPLHistory).mockResolvedValueOnce([
        {
          date: "2025-12-01",
          totalInvestedCents: 10000,
          totalCurrentValueCents: 11000,
          cumulativeProfitCents: 1000,
          realizedProfitCents: 0,
          unrealizedProfitCents: 1000,
        },
      ]);

      // requirePremium queries is_premium — mock a premium user
      mockQuery.mockResolvedValueOnce({ rows: [{ is_premium: true }] });

      const res = await request(app)
        .get("/api/portfolio/pl/history?days=7")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.history).toHaveLength(1);
      expect(res.body.history[0].date).toBe("2025-12-01");
    });
  });
});
