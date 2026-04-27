/**
 * Tests for the server-side alert snooze flow (#15) and the
 * invalidateFeaturePreviews wiring on alert/watchlist mutations (#17).
 *
 * Engine snooze behaviour (skip + auto-clear) is covered in
 * services/__tests__/alertEngine.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
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

const mockInvalidate = vi.fn();
vi.mock("../../services/featurePreviews.js", () => ({
  invalidateFeaturePreviews: (uid: number) => mockInvalidate(uid),
}));

import { createTestApp } from "../../__tests__/app.js";

const app = createTestApp();
const jwt = createTestJwt(1);

const mockDemoCheck = () =>
  mockQuery.mockResolvedValueOnce({ rows: [{ steam_id: "76561198000000001" }] });

describe("Alert snooze routes", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockInvalidate.mockReset();
  });

  describe("POST /api/alerts/:id/snooze", () => {
    it("returns 401 without token", async () => {
      const res = await request(app).post("/api/alerts/1/snooze").send({});
      expect(res.status).toBe(401);
    });

    it("snoozes the alert with default 24h, sets is_active=false", async () => {
      mockDemoCheck();
      // The UPDATE returns the row with snooze_until ≈ NOW()+24h, is_active=false.
      const fakeRow = {
        id: 7,
        market_hash_name: "AK-47 | Redline (Field-Tested)",
        condition: "above",
        threshold: 12.0,
        source: "any",
        is_active: false,
        cooldown_minutes: 60,
        last_triggered_at: null,
        snooze_until: new Date(Date.now() + 24 * 3600_000).toISOString(),
        created_at: "2026-04-24T00:00:00.000Z",
      };
      mockQuery.mockResolvedValueOnce({ rows: [fakeRow] });

      const res = await request(app)
        .post("/api/alerts/7/snooze")
        .set("Authorization", `Bearer ${jwt}`)
        .send({});

      expect(res.status).toBe(200);
      expect(res.body.is_active).toBe(false);
      expect(res.body.snooze_until).toBeTruthy();

      // Verify the UPDATE used the right hours value and was scoped by user_id
      const updateCall = mockQuery.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("snooze_until = NOW()")
      );
      expect(updateCall).toBeDefined();
      expect(updateCall![1]).toEqual(["24", "7", 1]);

      // Feature-preview cache must be busted
      expect(mockInvalidate).toHaveBeenCalledWith(1);
    });

    it("accepts a custom hours value", async () => {
      mockDemoCheck();
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, snooze_until: "x", is_active: false }],
      });

      const res = await request(app)
        .post("/api/alerts/1/snooze")
        .set("Authorization", `Bearer ${jwt}`)
        .send({ hours: 48 });

      expect(res.status).toBe(200);
      const updateCall = mockQuery.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("snooze_until = NOW()")
      );
      expect(updateCall![1][0]).toBe("48");
    });

    it("rejects hours > 168 (7 days)", async () => {
      mockDemoCheck();
      const res = await request(app)
        .post("/api/alerts/1/snooze")
        .set("Authorization", `Bearer ${jwt}`)
        .send({ hours: 200 });

      expect(res.status).toBe(400);
      expect(mockInvalidate).not.toHaveBeenCalled();
    });

    it("returns 404 when alert does not belong to user (IDOR guard)", async () => {
      mockDemoCheck();
      // UPDATE returns no rows because user_id mismatch in WHERE
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/api/alerts/999/snooze")
        .set("Authorization", `Bearer ${jwt}`)
        .send({});

      expect(res.status).toBe(404);
      expect(mockInvalidate).not.toHaveBeenCalled();
    });
  });

  describe("POST /api/alerts/:id/unsnooze", () => {
    it("returns 401 without token", async () => {
      const res = await request(app).post("/api/alerts/1/unsnooze");
      expect(res.status).toBe(401);
    });

    it("clears snooze_until and re-enables the alert", async () => {
      mockDemoCheck();
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 7,
            market_hash_name: "AK-47 | Redline (Field-Tested)",
            condition: "above",
            threshold: 12.0,
            source: "any",
            is_active: true,
            cooldown_minutes: 60,
            last_triggered_at: null,
            snooze_until: null,
            created_at: "2026-04-24T00:00:00.000Z",
          },
        ],
      });

      const res = await request(app)
        .post("/api/alerts/7/unsnooze")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.is_active).toBe(true);
      expect(res.body.snooze_until).toBeNull();
      expect(mockInvalidate).toHaveBeenCalledWith(1);
    });

    it("returns 404 when not owned (IDOR guard)", async () => {
      mockDemoCheck();
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/api/alerts/999/unsnooze")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(404);
      expect(mockInvalidate).not.toHaveBeenCalled();
    });
  });

  describe("GET /api/alerts includes snooze_until", () => {
    it("snooze_until is selected and surfaced to the client", async () => {
      mockDemoCheck();
      const wakeAt = new Date(Date.now() + 12 * 3600_000).toISOString();
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            market_hash_name: "AK-47 | Redline (Field-Tested)",
            condition: "above",
            threshold: 15.0,
            source: "any",
            is_active: false,
            cooldown_minutes: 60,
            last_triggered_at: null,
            snooze_until: wakeAt,
            created_at: "2025-12-01T00:00:00.000Z",
          },
        ],
      });

      const res = await request(app)
        .get("/api/alerts")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.alerts[0].snooze_until).toBe(wakeAt);

      // The SELECT must include snooze_until
      const selectCall = mockQuery.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes("FROM price_alerts")
      );
      expect(selectCall![0]).toContain("snooze_until");
    });
  });
});

describe("invalidateFeaturePreviews wiring", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockInvalidate.mockReset();
  });

  it("POST /api/alerts invalidates after create", async () => {
    mockDemoCheck();
    mockQuery.mockResolvedValueOnce({ rows: [{ is_premium: true }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 0 }] });
    mockQuery.mockResolvedValueOnce({ rows: [] }); // dup check
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 11,
          market_hash_name: "AWP | Asiimov (Field-Tested)",
          condition: "above",
          threshold: 50,
          source: "any",
          is_active: true,
          cooldown_minutes: 60,
        },
      ],
    });

    const res = await request(app)
      .post("/api/alerts")
      .set("Authorization", `Bearer ${jwt}`)
      .send({
        market_hash_name: "AWP | Asiimov (Field-Tested)",
        condition: "above",
        threshold: 50,
      });

    expect(res.status).toBe(201);
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
    expect(mockInvalidate).toHaveBeenCalledWith(1);
  });

  it("DELETE /api/alerts/:id invalidates on success", async () => {
    mockDemoCheck();
    mockQuery.mockResolvedValueOnce({ rowCount: 0 }); // alert_history delete
    mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // price_alerts delete

    const res = await request(app)
      .delete("/api/alerts/5")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(mockInvalidate).toHaveBeenCalledWith(1);
  });

  it("DELETE /api/alerts/:id does NOT invalidate on 404", async () => {
    mockDemoCheck();
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });

    const res = await request(app)
      .delete("/api/alerts/999")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(404);
    expect(mockInvalidate).not.toHaveBeenCalled();
  });

  it("PATCH /api/alerts/:id invalidates on toggle", async () => {
    mockDemoCheck();
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 5,
          market_hash_name: "x",
          condition: "above",
          threshold: 1,
          source: "any",
          is_active: false,
        },
      ],
    });

    const res = await request(app)
      .patch("/api/alerts/5")
      .set("Authorization", `Bearer ${jwt}`)
      .send({ is_active: false });

    expect(res.status).toBe(200);
    expect(mockInvalidate).toHaveBeenCalledWith(1);
  });

  it("POST /api/alerts/watchlist invalidates after add", async () => {
    mockDemoCheck();
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 99 }] });

    const res = await request(app)
      .post("/api/alerts/watchlist")
      .set("Authorization", `Bearer ${jwt}`)
      .send({
        marketHashName: "AK-47 | Redline (Field-Tested)",
        targetPrice: 10,
      });

    expect(res.status).toBe(200);
    expect(mockInvalidate).toHaveBeenCalledWith(1);
  });

  it("DELETE /api/alerts/watchlist/:id invalidates after remove", async () => {
    mockDemoCheck();
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    const res = await request(app)
      .delete("/api/alerts/watchlist/12")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(mockInvalidate).toHaveBeenCalledWith(1);
  });
});
