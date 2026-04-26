import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { _resetFeatureFlagsCacheForTests } from "../../services/featureFlags.js";

// userId 4 -> sha256 bucket = 7 (in 10% canary). userId 1 -> bucket 19 (out).
// Verified by precomputing in setup script; see featureFlags.ts userBucket().
const JWT_USER_IN_CANARY = createTestJwt(4);
const JWT_USER_OUT_CANARY = createTestJwt(1);

const mockDemoCheckFor = (uid: number) =>
  // authMiddleware demo lookup: SELECT steam_id FROM users WHERE id = $1
  mockQuery.mockResolvedValueOnce({
    rows: [{ steam_id: `7656119800000000${uid}` }],
  });

const ENV_KEYS = [
  "KILL_AUTO_SELL", "KILL_SMART_ALERTS", "KILL_TOUR",
  "CANARY_AUTO_SELL_PCT", "CANARY_SMART_ALERTS_PCT", "CANARY_TOUR_PCT",
];

describe("GET /api/users/feature-flags", () => {
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

  it("returns 401 without auth token", async () => {
    const app = createTestApp();
    const res = await request(app).get("/api/users/feature-flags");
    expect(res.status).toBe(401);
  });

  it("returns 200 with proper shape for authenticated user", async () => {
    const app = createTestApp();
    mockDemoCheckFor(1);
    // service queries SELECT feature_flags FROM users WHERE id = $1
    mockQuery.mockResolvedValueOnce({ rows: [{ feature_flags: {} }] });

    const res = await request(app)
      .get("/api/users/feature-flags")
      .set("Authorization", `Bearer ${JWT_USER_OUT_CANARY}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("flags");
    expect(res.body).toHaveProperty("version");
    expect(typeof res.body.version).toBe("string");
    expect(res.body.version.length).toBeGreaterThan(0);
    // All known flags present and boolean.
    for (const f of ["auto_sell", "smart_alerts", "tour"]) {
      expect(typeof res.body.flags[f]).toBe("boolean");
    }
    // Default-off when no overrides and no canary.
    expect(res.body.flags.auto_sell).toBe(false);
    // Admin-only fields must NOT leak.
    expect(res.body).not.toHaveProperty("bucket");
    expect(res.body).not.toHaveProperty("rawOverrides");
  });

  it("returns canary flag ON for user whose hash bucket is inside canary %", async () => {
    process.env.CANARY_AUTO_SELL_PCT = "10";
    const app = createTestApp();
    mockDemoCheckFor(4);
    mockQuery.mockResolvedValueOnce({ rows: [{ feature_flags: {} }] });

    const res = await request(app)
      .get("/api/users/feature-flags")
      .set("Authorization", `Bearer ${JWT_USER_IN_CANARY}`);

    expect(res.status).toBe(200);
    // userId=4 bucket=7, < 10 → canary ON.
    expect(res.body.flags.auto_sell).toBe(true);
    expect(res.body.flags.smart_alerts).toBe(false);
  });

  it("returns kill-switched flag OFF even when user override would enable it", async () => {
    process.env.KILL_AUTO_SELL = "1";
    const app = createTestApp();
    mockDemoCheckFor(1);
    mockQuery.mockResolvedValueOnce({
      rows: [{ feature_flags: { auto_sell: true } }],
    });

    const res = await request(app)
      .get("/api/users/feature-flags")
      .set("Authorization", `Bearer ${JWT_USER_OUT_CANARY}`);

    expect(res.status).toBe(200);
    expect(res.body.flags.auto_sell).toBe(false);
  });

  it("sends Cache-Control: private, max-age=300 header", async () => {
    const app = createTestApp();
    mockDemoCheckFor(1);
    mockQuery.mockResolvedValueOnce({ rows: [{ feature_flags: {} }] });

    const res = await request(app)
      .get("/api/users/feature-flags")
      .set("Authorization", `Bearer ${JWT_USER_OUT_CANARY}`);

    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("private, max-age=300");
  });
});
