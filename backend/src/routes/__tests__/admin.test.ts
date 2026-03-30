import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// Mock all heavy dependencies before app import
const mockQuery = vi.fn();
vi.mock("../../db/pool.js", () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  checkPoolHealth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/priceJob.js", () => ({
  startPriceJobs: vi.fn(),
  stopAllJobs: vi.fn(),
  getJobHealth: vi.fn().mockReturnValue({
    skinport: { lastRun: null, consecutiveFailures: 0 },
    dmarket: { lastRun: null, consecutiveFailures: 0 },
    steam: { lastRun: null, consecutiveFailures: 0 },
    csfloat: { lastRun: null, consecutiveFailures: 0 },
    plSnapshot: { lastRun: null, consecutiveFailures: 0 },
    subscriptions: { lastRun: null, consecutiveFailures: 0 },
  }),
}));

vi.mock("../../services/priceStats.js", () => ({
  getAllStats: vi.fn().mockReturnValue({
    sources: [
      {
        source: "skinport",
        totalFetches: 10,
        successCount: 9,
        failureCount: 1,
        total429s: 0,
        lastSuccessAt: new Date().toISOString(),
        crawlerPausedUntil: null,
      },
    ],
  }),
  recordFetchStart: vi.fn(() => vi.fn()),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
  record429: vi.fn(),
  updateCrawlerState: vi.fn(),
}));

vi.mock("../../utils/cacheRegistry.js", () => ({
  registerCache: vi.fn(),
  getCacheStats: vi.fn().mockReturnValue([
    { name: "premiumStatus", size: 0, hits: 0, misses: 0, hitRate: "N/A" },
  ]),
}));

vi.mock("../../services/firebase.js", () => ({
  initFirebase: vi.fn(),
  isFirebaseReady: vi.fn().mockReturnValue(false),
  sendPush: vi.fn().mockResolvedValue({ successCount: 0, failedTokens: [] }),
}));

vi.mock("../../services/steamSession.js", () => ({
  SteamSessionService: {
    getActiveAccountId: vi.fn().mockResolvedValue(1),
    ensureValidSession: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("../../services/steam.js", () => ({
  fetchSteamInventory: vi.fn().mockResolvedValue([]),
}));

import { createTestApp } from "../../__tests__/app.js";

const app = createTestApp();
const ADMIN_SECRET = "test-admin-secret"; // matches setup.ts

describe("Admin routes", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe("GET /api/admin/price-stats", () => {
    it("returns price stats with valid admin secret header", async () => {
      const res = await request(app)
        .get("/api/admin/price-stats")
        .set("x-admin-secret", ADMIN_SECRET);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("sources");
    });

    it("returns 403 without admin secret", async () => {
      const res = await request(app).get("/api/admin/price-stats");
      expect(res.status).toBe(403);
    });

    it("returns 403 with wrong admin secret", async () => {
      const res = await request(app)
        .get("/api/admin/price-stats")
        .set("x-admin-secret", "wrong-secret");
      expect(res.status).toBe(403);
    });

    it("accepts secret as header", async () => {
      const res = await request(app)
        .get("/api/admin/price-stats")
        .set("x-admin-secret", ADMIN_SECRET);
      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/admin/price-health", () => {
    it("returns health check with valid secret", async () => {
      // DB query for price freshness
      mockQuery.mockResolvedValueOnce({
        rows: [{ source: "skinport", last_at: new Date().toISOString(), items: 1000 }],
      });

      const res = await request(app)
        .get("/api/admin/price-health")
        .set("x-admin-secret", ADMIN_SECRET);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("healthy");
    });

    it("returns 403 without secret", async () => {
      const res = await request(app).get("/api/admin/price-health");
      expect(res.status).toBe(403);
    });
  });

  describe("GET /api/admin/cache-stats", () => {
    it("returns cache statistics", async () => {
      const res = await request(app)
        .get("/api/admin/cache-stats")
        .set("x-admin-secret", ADMIN_SECRET);

      expect(res.status).toBe(200);
    });
  });
});
