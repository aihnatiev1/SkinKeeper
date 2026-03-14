import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createTestJwt } from "../../__tests__/helpers.js";

// Mock all dependencies
const mockQuery = vi.fn();
vi.mock("../../db/pool.js", () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  checkPoolHealth: vi.fn().mockResolvedValue(undefined),
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

describe("Alerts routes", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe("GET /api/alerts", () => {
    it("returns 401 without token", async () => {
      const res = await request(app).get("/api/alerts");
      expect(res.status).toBe(401);
    });

    it("returns empty alerts list", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .get("/api/alerts")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.alerts).toEqual([]);
    });

    it("returns user's alerts", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            market_hash_name: "AK-47 | Redline (Field-Tested)",
            condition: "above",
            threshold: 15.0,
            source: "any",
            is_active: true,
            cooldown_minutes: 60,
            last_triggered_at: null,
            created_at: "2025-12-01T00:00:00.000Z",
          },
        ],
      });

      const res = await request(app)
        .get("/api/alerts")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.alerts).toHaveLength(1);
      expect(res.body.alerts[0].condition).toBe("above");
    });
  });

  describe("POST /api/alerts", () => {
    it("returns 401 without token", async () => {
      const res = await request(app)
        .post("/api/alerts")
        .send({ market_hash_name: "AK-47", condition: "above", threshold: 10 });
      expect(res.status).toBe(401);
    });

    it("returns 400 for invalid condition", async () => {
      const res = await request(app)
        .post("/api/alerts")
        .set("Authorization", `Bearer ${jwt}`)
        .send({
          market_hash_name: "AK-47 | Redline (Field-Tested)",
          condition: "invalid-condition",
          threshold: 10,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe("Validation failed");
    });

    it("returns 400 when threshold is not positive", async () => {
      const res = await request(app)
        .post("/api/alerts")
        .set("Authorization", `Bearer ${jwt}`)
        .send({
          market_hash_name: "AK-47 | Redline (Field-Tested)",
          condition: "above",
          threshold: -5,
        });

      expect(res.status).toBe(400);
    });

    it("returns 400 for missing market_hash_name", async () => {
      const res = await request(app)
        .post("/api/alerts")
        .set("Authorization", `Bearer ${jwt}`)
        .send({ condition: "above", threshold: 10 });

      expect(res.status).toBe(400);
    });

    it("creates alert successfully", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ is_premium: true }] }); // premium check
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 0 }] }); // count check
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 1,
          market_hash_name: "AK-47 | Redline (Field-Tested)",
          condition: "above",
          threshold: 10,
          source: "any",
          cooldown_minutes: 60,
        }],
      }); // insert

      const res = await request(app)
        .post("/api/alerts")
        .set("Authorization", `Bearer ${jwt}`)
        .send({
          market_hash_name: "AK-47 | Redline (Field-Tested)",
          condition: "above",
          threshold: 10.0,
        });

      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined(); // route returns rows[0] directly (not { alert: ... })
    });

    it("returns 400 when premium user hits 20 alert limit", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ is_premium: true }] }); // premium check
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 20 }] }); // count check

      const res = await request(app)
        .post("/api/alerts")
        .set("Authorization", `Bearer ${jwt}`)
        .send({
          market_hash_name: "AK-47 | Redline (Field-Tested)",
          condition: "above",
          threshold: 10,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Maximum 20");
    });

    it("returns 403 when free user hits 5 alert limit", async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ is_premium: false }] }); // premium check
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 5 }] }); // count check

      const res = await request(app)
        .post("/api/alerts")
        .set("Authorization", `Bearer ${jwt}`)
        .send({
          market_hash_name: "AK-47 | Redline (Field-Tested)",
          condition: "above",
          threshold: 10,
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe("premium_required");
    });
  });

  describe("DELETE /api/alerts/:id", () => {
    it("returns 401 without token", async () => {
      const res = await request(app).delete("/api/alerts/1");
      expect(res.status).toBe(401);
    });

    it("deletes alert belonging to user", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const res = await request(app)
        .delete("/api/alerts/1")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(200);
    });

    it("returns 404 when alert not found or belongs to different user", async () => {
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const res = await request(app)
        .delete("/api/alerts/999")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(404);
    });
  });
});
