import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express from "express";
import { createTestJwt } from "../../__tests__/helpers.js";

const mockQuery = vi.fn();
vi.mock("../../db/pool.js", () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  checkPoolHealth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../utils/cacheRegistry.js", () => ({
  registerCache: vi.fn(),
  getCacheStats: vi.fn().mockReturnValue([]),
}));

vi.mock("../../services/priceJob.js", () => ({
  startPriceJobs: vi.fn(),
  stopAllJobs: vi.fn(),
  getJobHealth: vi.fn().mockReturnValue({}),
}));

vi.mock("../../services/priceStats.js", () => ({
  getAllStats: vi.fn().mockReturnValue({ sources: [] }),
  recordFetchStart: vi.fn(() => vi.fn()),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
  record429: vi.fn(),
  updateCrawlerState: vi.fn(),
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
import { authMiddleware, requireFeatureFlag } from "../../middleware/auth.js";
import { _resetFeatureFlagsCacheForTests } from "../../services/featureFlags.js";

const ADMIN_SECRET = "test-admin-secret"; // matches setup.ts
const jwt = createTestJwt(1);
const mockDemoCheck = () =>
  mockQuery.mockResolvedValueOnce({ rows: [{ steam_id: "76561198000000001" }] });

const ENV_KEYS = [
  "KILL_AUTO_SELL", "KILL_SMART_ALERTS", "KILL_TOUR",
  "CANARY_AUTO_SELL_PCT", "CANARY_SMART_ALERTS_PCT", "CANARY_TOUR_PCT",
];

describe("Feature flags routes & middleware", () => {
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

  describe("Admin GET /api/admin/feature-flags/:userId", () => {
    it("returns 403 without admin secret", async () => {
      const app = createTestApp();
      const res = await request(app).get("/api/admin/feature-flags/1");
      expect(res.status).toBe(403);
    });

    it("returns 404 if user does not exist", async () => {
      const app = createTestApp();
      mockQuery.mockResolvedValueOnce({ rows: [] }); // user lookup
      const res = await request(app)
        .get("/api/admin/feature-flags/999")
        .set("x-admin-secret", ADMIN_SECRET);
      expect(res.status).toBe(404);
    });

    it("returns resolved flags + raw overrides + bucket", async () => {
      const app = createTestApp();
      // First: SELECT id, feature_flags FROM users  (route-level)
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, feature_flags: { auto_sell: true } }],
      });
      // Then service's getFeatureFlagsForUser does another SELECT feature_flags
      mockQuery.mockResolvedValueOnce({
        rows: [{ feature_flags: { auto_sell: true } }],
      });
      const res = await request(app)
        .get("/api/admin/feature-flags/1")
        .set("x-admin-secret", ADMIN_SECRET);
      expect(res.status).toBe(200);
      expect(res.body.userId).toBe(1);
      expect(res.body.resolved.auto_sell).toBe(true);
      expect(res.body.rawOverrides.auto_sell).toBe(true);
      expect(typeof res.body.bucket).toBe("number");
    });
  });

  describe("Admin POST /api/admin/feature-flags/:userId", () => {
    it("returns 400 for invalid flag name", async () => {
      const app = createTestApp();
      const res = await request(app)
        .post("/api/admin/feature-flags/1")
        .set("x-admin-secret", ADMIN_SECRET)
        .send({ flag: "Bad-Flag", value: true });
      expect(res.status).toBe(400);
    });

    it("returns 400 for non-boolean value", async () => {
      const app = createTestApp();
      const res = await request(app)
        .post("/api/admin/feature-flags/1")
        .set("x-admin-secret", ADMIN_SECRET)
        .send({ flag: "auto_sell", value: "yes" });
      expect(res.status).toBe(400);
    });

    it("sets a flag and returns updated resolved flags", async () => {
      const app = createTestApp();
      // user existence check
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
      // setFeatureFlag UPDATE
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });
      // re-read inside getFeatureFlagsForUser
      mockQuery.mockResolvedValueOnce({
        rows: [{ feature_flags: { auto_sell: true } }],
      });

      const res = await request(app)
        .post("/api/admin/feature-flags/1")
        .set("x-admin-secret", ADMIN_SECRET)
        .send({ flag: "auto_sell", value: true });
      expect(res.status).toBe(200);
      expect(res.body.flag).toBe("auto_sell");
      expect(res.body.value).toBe(true);
      expect(res.body.resolved.auto_sell).toBe(true);
    });

    it("clears a flag when value is null", async () => {
      const app = createTestApp();
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] }); // user exists
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // UPDATE
      mockQuery.mockResolvedValueOnce({ rows: [{ feature_flags: {} }] }); // re-read
      const res = await request(app)
        .post("/api/admin/feature-flags/1")
        .set("x-admin-secret", ADMIN_SECRET)
        .send({ flag: "auto_sell", value: null });
      expect(res.status).toBe(200);
      expect(res.body.value).toBe(null);
    });
  });

  describe("Admin GET /api/admin/feature-flags/canary-stats", () => {
    it("returns canary configuration with estimates", async () => {
      const app = createTestApp();
      process.env.CANARY_AUTO_SELL_PCT = "10";
      mockQuery.mockResolvedValueOnce({ rows: [{ total: 1000 }] });
      const res = await request(app)
        .get("/api/admin/feature-flags/canary-stats")
        .set("x-admin-secret", ADMIN_SECRET);
      expect(res.status).toBe(200);
      expect(res.body.totalUsers).toBe(1000);
      const autoSell = res.body.flags.find((f: any) => f.flag === "auto_sell");
      expect(autoSell.percentage).toBe(10);
      expect(autoSell.estimatedUsersInCanary).toBe(100);
    });
  });

  describe("requireFeatureFlag middleware", () => {
    function buildMiniApp() {
      const app = express();
      app.use(express.json());
      app.get(
        "/test/auto-sell",
        authMiddleware,
        requireFeatureFlag("auto_sell"),
        (_req, res) => {
          res.json({ ok: true });
        }
      );
      return app;
    }

    it("returns 401 without token", async () => {
      const app = buildMiniApp();
      const res = await request(app).get("/test/auto-sell");
      expect(res.status).toBe(401);
    });

    it("returns 403 with FEATURE_DISABLED when flag off", async () => {
      const app = buildMiniApp();
      mockDemoCheck(); // auth demo lookup
      mockQuery.mockResolvedValueOnce({ rows: [{ feature_flags: {} }] }); // flags lookup
      const res = await request(app)
        .get("/test/auto-sell")
        .set("Authorization", `Bearer ${jwt}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FEATURE_DISABLED");
      expect(res.body.flag).toBe("auto_sell");
    });

    it("returns 200 when user flag is true", async () => {
      const app = buildMiniApp();
      mockDemoCheck();
      mockQuery.mockResolvedValueOnce({
        rows: [{ feature_flags: { auto_sell: true } }],
      });
      const res = await request(app)
        .get("/test/auto-sell")
        .set("Authorization", `Bearer ${jwt}`);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it("returns 403 when kill switch is set even if user flag is true", async () => {
      process.env.KILL_AUTO_SELL = "1";
      const app = buildMiniApp();
      mockDemoCheck();
      mockQuery.mockResolvedValueOnce({
        rows: [{ feature_flags: { auto_sell: true } }],
      });
      const res = await request(app)
        .get("/test/auto-sell")
        .set("Authorization", `Bearer ${jwt}`);
      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FEATURE_DISABLED");
    });

    it("uses cache: 2nd request within TTL hits no extra feature_flags query", async () => {
      const app = buildMiniApp();
      // 1st request: demo check + flags lookup
      mockDemoCheck();
      mockQuery.mockResolvedValueOnce({
        rows: [{ feature_flags: { auto_sell: true } }],
      });
      let res = await request(app)
        .get("/test/auto-sell")
        .set("Authorization", `Bearer ${jwt}`);
      expect(res.status).toBe(200);

      // Count flags-table queries (auth demo lookup uses 'steam_id', flags uses 'feature_flags').
      const flagsQueries = (sql: string) => sql.includes("feature_flags");
      const flagQ1 = mockQuery.mock.calls.filter(c => flagsQueries(String(c[0]))).length;
      expect(flagQ1).toBe(1);

      // 2nd request: feed another demo check (auth's in-Set demo cache may
      // re-query if user wasn't classified as demo; that's a separate concern).
      mockDemoCheck();
      res = await request(app)
        .get("/test/auto-sell")
        .set("Authorization", `Bearer ${jwt}`);
      expect(res.status).toBe(200);

      const flagQ2 = mockQuery.mock.calls.filter(c => flagsQueries(String(c[0]))).length;
      // Flags cache should still be 1 — no new feature_flags SELECT.
      expect(flagQ2).toBe(1);
    });
  });
});
