/**
 * purchases.test.ts — route-level tests for /api/purchases/feature-previews.
 *
 * Covers the auth gate, the response shape (top item + stats + counts),
 * the 5-min in-memory cache, and the no-active-account branch.
 *
 * Pool is fully mocked. The cache lives in featurePreviews.ts module state
 * so we reset it via the test escape hatch in beforeEach.
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

const mockGetActiveAccountId = vi.fn().mockResolvedValue(1);
vi.mock("../../services/steamSession.js", () => ({
  SteamSessionService: {
    getActiveAccountId: (userId: number) => mockGetActiveAccountId(userId),
    ensureValidSession: vi.fn().mockResolvedValue(null),
  },
}));

import { createTestApp } from "../../__tests__/app.js";
import { _resetFeaturePreviewCache } from "../../services/featurePreviews.js";

const app = createTestApp();
const jwt = createTestJwt(1);

// Auth middleware does a demo-check query: SELECT steam_id FROM users WHERE id = $1
const mockDemoCheck = () =>
  mockQuery.mockResolvedValueOnce({ rows: [{ steam_id: "76561198000000001" }] });

// Default "happy" payload returned by the single feature-previews query.
function makePreviewRow(overrides: Partial<{
  top: unknown;
  stats: { total_items: number; unique_items: number; total_value: number };
  counts: { tracked: number; alerts_active: number };
  autosell_candidates: number;
}> = {}) {
  return {
    top: overrides.top !== undefined ? overrides.top : {
      market_hash_name: "AK-47 | Redline (Field-Tested)",
      icon_url: "https://community.cloudflare.steamstatic.com/economy/image/test",
      price_usd: 15.42,
      price_7d_ago: 14.25,
    },
    stats: overrides.stats ?? {
      total_items: 47,
      unique_items: 31,
      total_value: 342.15,
    },
    counts: overrides.counts ?? { tracked: 12, alerts_active: 3 },
    autosell_candidates: overrides.autosell_candidates ?? 5,
  };
}

describe("GET /api/purchases/feature-previews", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockGetActiveAccountId.mockReset();
    mockGetActiveAccountId.mockResolvedValue(1);
    _resetFeaturePreviewCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 401 without JWT", async () => {
    const res = await request(app).get("/api/purchases/feature-previews");
    expect(res.status).toBe(401);
  });

  it("returns full shape for a user with inventory", async () => {
    mockDemoCheck();
    mockQuery.mockResolvedValueOnce({ rows: [makePreviewRow()] });

    const res = await request(app)
      .get("/api/purchases/feature-previews")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      topItem: {
        marketHashName: "AK-47 | Redline (Field-Tested)",
        iconUrl: "https://community.cloudflare.steamstatic.com/economy/image/test",
        currentPriceUsd: 15.42,
        // (15.42 - 14.25) / 14.25 * 100 ≈ 8.2%
        trend7d: "+8.2%",
      },
      inventoryStats: {
        totalItems: 47,
        totalValueUsd: 342.15,
        uniqueItems: 31,
      },
      trackedItemsCount: 12,
      alertsActive: 3,
      potentialAutoSellCandidates: 5,
    });
  });

  it("formats negative 7d trends with a leading minus", async () => {
    mockDemoCheck();
    mockQuery.mockResolvedValueOnce({
      rows: [
        makePreviewRow({
          top: {
            market_hash_name: "AWP | Asiimov (Field-Tested)",
            icon_url: null,
            price_usd: 100,
            price_7d_ago: 110,
          },
        }),
      ],
    });

    const res = await request(app)
      .get("/api/purchases/feature-previews")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    // (100-110)/110 * 100 = -9.09... → "-9.1%"
    expect(res.body.topItem.trend7d).toBe("-9.1%");
    expect(res.body.topItem.iconUrl).toBeNull();
  });

  it("returns null trend7d when 7d-ago price is missing", async () => {
    mockDemoCheck();
    mockQuery.mockResolvedValueOnce({
      rows: [
        makePreviewRow({
          top: {
            market_hash_name: "AK-47 | Redline (Field-Tested)",
            icon_url: null,
            price_usd: 15.42,
            price_7d_ago: null,
          },
        }),
      ],
    });

    const res = await request(app)
      .get("/api/purchases/feature-previews")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.topItem.trend7d).toBeNull();
  });

  it("returns null topItem and zero stats for empty inventory", async () => {
    mockDemoCheck();
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          top: null,
          stats: { total_items: 0, unique_items: 0, total_value: 0 },
          counts: { tracked: 0, alerts_active: 0 },
          autosell_candidates: 0,
        },
      ],
    });

    const res = await request(app)
      .get("/api/purchases/feature-previews")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      topItem: null,
      inventoryStats: { totalItems: 0, totalValueUsd: 0, uniqueItems: 0 },
      trackedItemsCount: 0,
      alertsActive: 0,
      potentialAutoSellCandidates: 0,
    });
  });

  it("returns 401 SESSION_EXPIRED when user has no linked Steam account", async () => {
    mockDemoCheck();
    mockGetActiveAccountId.mockRejectedValueOnce(new Error("No linked Steam accounts"));

    const res = await request(app)
      .get("/api/purchases/feature-previews")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_EXPIRED");
  });

  it("returns 500 on unexpected DB failure", async () => {
    mockDemoCheck();
    mockQuery.mockRejectedValueOnce(new Error("connection refused"));

    const res = await request(app)
      .get("/api/purchases/feature-previews")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });

  it("serves a cache hit on the 2nd call within the TTL (no extra preview query)", async () => {
    // 1st call: demo-check + preview query
    mockDemoCheck();
    mockQuery.mockResolvedValueOnce({ rows: [makePreviewRow()] });

    const first = await request(app)
      .get("/api/purchases/feature-previews")
      .set("Authorization", `Bearer ${jwt}`);
    expect(first.status).toBe(200);

    // 2nd call: ONLY the demo-check should run; preview query MUST NOT.
    mockDemoCheck();
    const callsBefore = mockQuery.mock.calls.length;

    const second = await request(app)
      .get("/api/purchases/feature-previews")
      .set("Authorization", `Bearer ${jwt}`);

    expect(second.status).toBe(200);
    expect(second.body).toEqual(first.body);
    // Exactly one extra call (the demo-check), no preview query.
    expect(mockQuery.mock.calls.length).toBe(callsBefore + 1);
  });

  it("re-queries the DB after the 5-min TTL elapses", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-24T12:00:00Z"));

    // 1st call: cache miss → 1 preview query
    mockDemoCheck();
    mockQuery.mockResolvedValueOnce({ rows: [makePreviewRow()] });
    const first = await request(app)
      .get("/api/purchases/feature-previews")
      .set("Authorization", `Bearer ${jwt}`);
    expect(first.status).toBe(200);

    // Advance past 5-min TTL.
    vi.setSystemTime(new Date("2026-04-24T12:06:00Z"));

    // 2nd call: cache expired → demo-check + preview query.
    mockDemoCheck();
    mockQuery.mockResolvedValueOnce({
      rows: [
        makePreviewRow({
          stats: { total_items: 50, unique_items: 32, total_value: 400 },
        }),
      ],
    });

    const second = await request(app)
      .get("/api/purchases/feature-previews")
      .set("Authorization", `Bearer ${jwt}`);

    expect(second.status).toBe(200);
    expect(second.body.inventoryStats.totalItems).toBe(50);
    expect(second.body.inventoryStats.totalValueUsd).toBe(400);
  });
});
