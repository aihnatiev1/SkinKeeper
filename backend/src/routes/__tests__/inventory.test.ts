import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createTestJwt } from "../../__tests__/helpers.js";

// Mock all dependencies
const mockQuery = vi.fn();
vi.mock("../../db/pool.js", () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  checkPoolHealth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/steam.js", () => ({
  fetchSteamInventory: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../services/prices.js", () => ({
  getLatestPrices: vi.fn().mockResolvedValue(new Map()),
  fetchSkinportPrices: vi.fn().mockResolvedValue(new Map()),
  savePrices: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/inspect.js", () => ({
  inspectItem: vi.fn().mockResolvedValue(null),
  batchInspect: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../services/steamSession.js", () => ({
  SteamSessionService: {
    getActiveAccountId: vi.fn().mockResolvedValue(1),
    ensureValidSession: vi.fn().mockResolvedValue({
      sessionId: "test-session",
      steamLoginSecure: "test-secure",
    }),
  },
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

import { createTestApp } from "../../__tests__/app.js";

const app = createTestApp();
const jwt = createTestJwt(1);

describe("GET /api/inventory", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns 401 without JWT", async () => {
    const res = await request(app).get("/api/inventory");
    expect(res.status).toBe(401);
  });

  it("returns 401 with expired JWT", async () => {
    const { createExpiredJwt } = await import("../../__tests__/helpers.js");
    const expiredJwt = createExpiredJwt(1);

    const res = await request(app)
      .get("/api/inventory")
      .set("Authorization", `Bearer ${expiredJwt}`);

    expect(res.status).toBe(401);
    expect(res.body.code).toBe("TOKEN_EXPIRED");
  });

  it("returns empty inventory for user with no items", async () => {
    // inventory_items query
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/inventory")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.count).toBe(0);
  });

  it("returns items with prices attached", async () => {
    const { getLatestPrices } = await import("../../services/prices.js");
    vi.mocked(getLatestPrices).mockResolvedValueOnce(
      new Map([["AK-47 | Redline (Field-Tested)", { skinport: 12.34, steam: 13.0 }]])
    );

    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          asset_id: "111111",
          market_hash_name: "AK-47 | Redline (Field-Tested)",
          icon_url: "https://example.com/icon.png",
          wear: "Field-Tested",
          float_value: 0.25,
          rarity: "Classified",
          rarity_color: "D2D2D2",
          tradable: true,
          trade_ban_until: null,
          inspect_link: null,
          paint_seed: null,
          paint_index: null,
          stickers: null,
          charms: null,
          account_steam_id: "76561198000000001",
          account_id: 1,
          account_name: "TestAccount",
        },
      ],
    });

    const res = await request(app)
      .get("/api/inventory")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].market_hash_name).toBe("AK-47 | Redline (Field-Tested)");
    expect(res.body.items[0].prices).toEqual({ skinport: 12.34, steam: 13.0 });
  });

  it("filters by accountId when query param provided", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/inventory?accountId=2")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    // Verify the query was called with accountId filter
    const queryCall = mockQuery.mock.calls[0];
    expect(queryCall[1]).toContain(2); // accountId = 2 should be in params
  });
});
