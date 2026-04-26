/**
 * autoSell.test.ts — route-level tests for /api/auto-sell.
 *
 * Mocks the pool entirely (no Postgres). Covers premium gating, IDOR
 * protection, the 10-rule limit, soft-delete semantics, and the
 * pending-window cancel race.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createTestJwt } from "../../__tests__/helpers.js";

const mockQuery = vi.fn();
vi.mock("../../db/pool.js", () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
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
import { invalidatePremiumCache } from "../../middleware/auth.js";
import {
  _resetFeatureFlagsCacheForTests,
} from "../../services/featureFlags.js";

const app = createTestApp();
const jwt = createTestJwt(1);

const mockDemoCheck = () => mockQuery.mockResolvedValueOnce({ rows: [{ steam_id: "76561198000000001" }] });
const mockPremium = () => mockQuery.mockResolvedValueOnce({ rows: [{ is_premium: true }] });
const mockNotPremium = () => mockQuery.mockResolvedValueOnce({ rows: [{ is_premium: false }] });
// requireFeatureFlag('auto_sell') reads users.feature_flags. Default the
// stored map to {auto_sell: true} so the gate passes; tests that exercise
// the kill-switch path mock it explicitly.
const mockAutoSellFlagEnabled = () =>
  mockQuery.mockResolvedValueOnce({
    rows: [{ feature_flags: { auto_sell: true } }],
  });

const validRulePayload = {
  account_id: 7,
  market_hash_name: "AK-47 | Redline (Field-Tested)",
  trigger_type: "above" as const,
  trigger_price_usd: 15,
  sell_price_usd: 14.5,
  sell_strategy: "fixed" as const,
  mode: "notify_only" as const,
  cooldown_minutes: 360,
};

describe("Auto-sell routes", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    // requirePremium caches is_premium for 5min; bust between tests so the
    // 403/200 expectations in adjacent tests don't bleed into each other.
    invalidatePremiumCache(1);
    // requireFeatureFlag has its own 5-min cache — reset both to avoid
    // bleed across tests that flip the kill-switch.
    _resetFeatureFlagsCacheForTests();
  });

  describe("POST /api/auto-sell/rules", () => {
    it("returns 401 without token", async () => {
      const res = await request(app).post("/api/auto-sell/rules").send(validRulePayload);
      expect(res.status).toBe(401);
    });

    it("returns 403 for non-premium user", async () => {
      mockDemoCheck();
      mockNotPremium();

      const res = await request(app)
        .post("/api/auto-sell/rules")
        .set("Authorization", `Bearer ${jwt}`)
        .send(validRulePayload);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("PREMIUM_REQUIRED");
    });

    it("creates rule for premium user", async () => {
      mockDemoCheck();
      mockPremium();
      mockAutoSellFlagEnabled();
      // account_id ownership check
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 7 }] });
      // count check
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 0 }] });
      // INSERT
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 1,
            account_id: 7,
            market_hash_name: validRulePayload.market_hash_name,
            trigger_type: "above",
            trigger_price_usd: 15,
            sell_price_usd: 14.5,
            sell_strategy: "fixed",
            mode: "notify_only",
            enabled: true,
            cooldown_minutes: 360,
            created_at: "2026-04-24T00:00:00.000Z",
            last_fired_at: null,
            times_fired: 0,
          },
        ],
      });

      const res = await request(app)
        .post("/api/auto-sell/rules")
        .set("Authorization", `Bearer ${jwt}`)
        .send(validRulePayload);

      expect(res.status).toBe(201);
      expect(res.body.id).toBe(1);
      expect(res.body.market_hash_name).toBe(validRulePayload.market_hash_name);
    });

    it("returns 404 when account_id is not owned by user (IDOR guard)", async () => {
      mockDemoCheck();
      mockPremium();
      mockAutoSellFlagEnabled();
      // account ownership check returns empty
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const res = await request(app)
        .post("/api/auto-sell/rules")
        .set("Authorization", `Bearer ${jwt}`)
        .send(validRulePayload);

      expect(res.status).toBe(404);
    });

    it("returns 400 when limit of 10 rules is reached", async () => {
      mockDemoCheck();
      mockPremium();
      mockAutoSellFlagEnabled();
      // ownership ok
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 7 }] });
      // count = 10
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 10 }] });

      const res = await request(app)
        .post("/api/auto-sell/rules")
        .set("Authorization", `Bearer ${jwt}`)
        .send(validRulePayload);

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("Maximum 10");
    });

    it("returns 400 when sell_strategy=fixed but sell_price_usd missing", async () => {
      mockDemoCheck();
      mockPremium();
      mockAutoSellFlagEnabled();
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 7 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 0 }] });

      const res = await request(app)
        .post("/api/auto-sell/rules")
        .set("Authorization", `Bearer ${jwt}`)
        .send({ ...validRulePayload, sell_price_usd: undefined });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain("sell_price_usd required");
    });
  });

  describe("GET /api/auto-sell/rules", () => {
    it("returns 401 without token", async () => {
      const res = await request(app).get("/api/auto-sell/rules");
      expect(res.status).toBe(401);
    });

    it("excludes soft-deleted rules", async () => {
      mockDemoCheck();
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            account_id: 7,
            market_hash_name: "AK-47 | Redline (Field-Tested)",
            trigger_type: "above",
            trigger_price_usd: 15,
            sell_price_usd: 14.5,
            sell_strategy: "fixed",
            mode: "notify_only",
            enabled: true,
            cooldown_minutes: 360,
            created_at: "2026-04-24T00:00:00.000Z",
            last_fired_at: null,
            times_fired: 0,
          },
        ],
      });

      const res = await request(app)
        .get("/api/auto-sell/rules")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.rules).toHaveLength(1);
      // Verify SQL excludes cancelled
      const rulesQuery = mockQuery.mock.calls.find(
        (c) =>
          typeof c[0] === "string" &&
          (c[0] as string).includes("FROM auto_sell_rules")
      );
      expect((rulesQuery![0] as string)).toContain("cancelled_at IS NULL");
    });
  });

  describe("PATCH /api/auto-sell/rules/:id", () => {
    it("returns 403 for non-premium user", async () => {
      mockDemoCheck();
      mockNotPremium();

      const res = await request(app)
        .patch("/api/auto-sell/rules/1")
        .set("Authorization", `Bearer ${jwt}`)
        .send({ enabled: false });

      expect(res.status).toBe(403);
    });

    it("updates allowed columns only", async () => {
      mockDemoCheck();
      mockPremium();
      mockAutoSellFlagEnabled();
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            account_id: 7,
            market_hash_name: "AK-47 | Redline (Field-Tested)",
            trigger_type: "above",
            trigger_price_usd: 15,
            sell_price_usd: 14.5,
            sell_strategy: "fixed",
            mode: "auto_list",
            enabled: false,
            cooldown_minutes: 360,
            created_at: "2026-04-24T00:00:00.000Z",
            last_fired_at: null,
            times_fired: 0,
          },
        ],
        rowCount: 1,
      });

      const res = await request(app)
        .patch("/api/auto-sell/rules/1")
        .set("Authorization", `Bearer ${jwt}`)
        .send({ enabled: false, mode: "auto_list" });

      expect(res.status).toBe(200);
      expect(res.body.enabled).toBe(false);
      expect(res.body.mode).toBe("auto_list");

      // Inspect the UPDATE SQL to confirm allowlisted column names appear.
      const updateCall = mockQuery.mock.calls.find(
        (c) =>
          typeof c[0] === "string" &&
          (c[0] as string).startsWith("UPDATE auto_sell_rules")
      );
      expect((updateCall![0] as string)).toContain("enabled = $");
      expect((updateCall![0] as string)).toContain("mode = $");
    });

    it("returns 404 when rule not found / not owned", async () => {
      mockDemoCheck();
      mockPremium();
      mockAutoSellFlagEnabled();
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const res = await request(app)
        .patch("/api/auto-sell/rules/999")
        .set("Authorization", `Bearer ${jwt}`)
        .send({ enabled: false });

      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /api/auto-sell/rules/:id", () => {
    it("returns 401 without token", async () => {
      const res = await request(app).delete("/api/auto-sell/rules/1");
      expect(res.status).toBe(401);
    });

    it("soft-deletes (sets cancelled_at) without requiring premium", async () => {
      // Lapsed user should still be able to clean up — DELETE is intentionally
      // open (P3-PLAN §2 routes hardening).
      mockDemoCheck();
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const res = await request(app)
        .delete("/api/auto-sell/rules/1")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(204);
      const updateCall = mockQuery.mock.calls.find(
        (c) =>
          typeof c[0] === "string" &&
          (c[0] as string).includes("cancelled_at = NOW()")
      );
      expect(updateCall).toBeDefined();
    });
  });

  describe("POST /api/auto-sell/executions/:id/cancel", () => {
    it("returns 204 when cancel succeeds within window", async () => {
      mockDemoCheck();
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const res = await request(app)
        .post("/api/auto-sell/executions/55/cancel")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(204);
    });

    it("returns 409 when window has expired or row already terminal", async () => {
      mockDemoCheck();
      mockQuery.mockResolvedValueOnce({ rowCount: 0 });

      const res = await request(app)
        .post("/api/auto-sell/executions/55/cancel")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(409);
    });
  });

  // ─── HIGH-2 (D2): percent_of_market band validation ────────────────────
  describe("percent_of_market validation", () => {
    it("rejects create with percent_of_market and sell_price_usd=50 (below 70)", async () => {
      mockDemoCheck();
      mockPremium();
      mockAutoSellFlagEnabled();

      const res = await request(app)
        .post("/api/auto-sell/rules")
        .set("Authorization", `Bearer ${jwt}`)
        .send({
          ...validRulePayload,
          sell_strategy: "percent_of_market",
          sell_price_usd: 50,
        });

      expect(res.status).toBe(400);
      // Zod validation error surfaces through validateBody — message
      // mentions the band so the client can render it.
      expect(JSON.stringify(res.body)).toMatch(/70.*99/);
    });

    it("rejects create with percent_of_market and missing sell_price_usd", async () => {
      mockDemoCheck();
      mockPremium();
      mockAutoSellFlagEnabled();

      const res = await request(app)
        .post("/api/auto-sell/rules")
        .set("Authorization", `Bearer ${jwt}`)
        .send({
          ...validRulePayload,
          sell_strategy: "percent_of_market",
          sell_price_usd: undefined,
        });

      expect(res.status).toBe(400);
    });

    it("accepts create with percent_of_market and sell_price_usd=85", async () => {
      mockDemoCheck();
      mockPremium();
      mockAutoSellFlagEnabled();
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 7 }] });
      mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 0 }] });
      mockQuery.mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 1,
            account_id: 7,
            market_hash_name: validRulePayload.market_hash_name,
            trigger_type: "above",
            trigger_price_usd: 15,
            sell_price_usd: 85,
            sell_strategy: "percent_of_market",
            mode: "notify_only",
            enabled: true,
            cooldown_minutes: 360,
            created_at: "2026-04-24T00:00:00.000Z",
            last_fired_at: null,
            times_fired: 0,
          },
        ],
      });

      const res = await request(app)
        .post("/api/auto-sell/rules")
        .set("Authorization", `Bearer ${jwt}`)
        .send({
          ...validRulePayload,
          sell_strategy: "percent_of_market",
          sell_price_usd: 85,
        });

      expect(res.status).toBe(201);
    });

    it("PATCH rejects sell_price_usd=50 when sell_strategy=percent_of_market is supplied together", async () => {
      mockDemoCheck();
      mockPremium();
      mockAutoSellFlagEnabled();

      const res = await request(app)
        .patch("/api/auto-sell/rules/1")
        .set("Authorization", `Bearer ${jwt}`)
        .send({ sell_strategy: "percent_of_market", sell_price_usd: 50 });

      expect(res.status).toBe(400);
    });
  });

  // ─── P0-2 / FIX H: requireFeatureFlag('auto_sell') gating ──────────────
  describe("auto_sell feature flag gating", () => {
    const originalKill = process.env.KILL_AUTO_SELL;
    afterEach(() => {
      if (originalKill === undefined) delete process.env.KILL_AUTO_SELL;
      else process.env.KILL_AUTO_SELL = originalKill;
    });

    it("POST /rules → 403 FEATURE_DISABLED when kill-switch is on", async () => {
      process.env.KILL_AUTO_SELL = "1";
      mockDemoCheck();
      mockPremium();
      // featureFlags reads users.feature_flags but kill-switch short-
      // circuits before the canary check; still need a row to satisfy the
      // shape.
      mockQuery.mockResolvedValueOnce({ rows: [{ feature_flags: {} }] });

      const res = await request(app)
        .post("/api/auto-sell/rules")
        .set("Authorization", `Bearer ${jwt}`)
        .send(validRulePayload);

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FEATURE_DISABLED");
    });

    it("PATCH /rules/:id → 403 FEATURE_DISABLED when kill-switch is on", async () => {
      process.env.KILL_AUTO_SELL = "1";
      mockDemoCheck();
      mockPremium();
      mockQuery.mockResolvedValueOnce({ rows: [{ feature_flags: {} }] });

      const res = await request(app)
        .patch("/api/auto-sell/rules/1")
        .set("Authorization", `Bearer ${jwt}`)
        .send({ enabled: false });

      expect(res.status).toBe(403);
      expect(res.body.code).toBe("FEATURE_DISABLED");
    });

    it("DELETE /rules/:id → 204 even when kill-switch is on (cleanup must work)", async () => {
      process.env.KILL_AUTO_SELL = "1";
      mockDemoCheck();
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const res = await request(app)
        .delete("/api/auto-sell/rules/1")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(204);
    });

    it("POST /executions/:id/cancel → 204 even when kill-switch is on (in-flight safety)", async () => {
      process.env.KILL_AUTO_SELL = "1";
      mockDemoCheck();
      mockQuery.mockResolvedValueOnce({ rowCount: 1 });

      const res = await request(app)
        .post("/api/auto-sell/executions/55/cancel")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(204);
    });
  });
});
