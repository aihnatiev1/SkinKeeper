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
    getSession: vi.fn().mockResolvedValue(null),
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

// Helper: mock the 2 queries the paginated endpoint makes (summary + page)
function mockPaginatedQueries(items: any[], total?: number) {
  const count = total ?? items.length;
  // 1st call: summary query (total + totalValue)
  mockQuery.mockResolvedValueOnce({ rows: [{ total: count, total_value: 0 }] });
  // 2nd call: page query (items)
  mockQuery.mockResolvedValueOnce({ rows: items });
  // 3rd call: freshness query (optional, only when total > 0)
  if (count > 0) {
    mockQuery.mockResolvedValueOnce({ rows: [{ last_update: new Date().toISOString() }] });
  }
}

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
    mockPaginatedQueries([]);

    const res = await request(app)
      .get("/api/inventory")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toEqual([]);
    expect(res.body.total).toBe(0);
  });

  it("returns items with prices attached", async () => {
    const { getLatestPrices } = await import("../../services/prices.js");
    vi.mocked(getLatestPrices).mockResolvedValueOnce(
      new Map([["AK-47 | Redline (Field-Tested)", { skinport: 12.34, steam: 13.0 }]])
    );

    mockPaginatedQueries([
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
        best_price: 13.0,
      },
    ]);

    const res = await request(app)
      .get("/api/inventory")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].market_hash_name).toBe("AK-47 | Redline (Field-Tested)");
    expect(res.body.items[0].prices).toEqual({ skinport: 12.34, steam: 13.0 });
  });

  it("filters by accountId when query param provided", async () => {
    mockPaginatedQueries([]);

    const res = await request(app)
      .get("/api/inventory?accountId=2")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    // Verify the summary query was called with accountId filter
    const queryCall = mockQuery.mock.calls[0];
    expect(queryCall[1]).toContain(2);
  });

  it("returns pagination metadata", async () => {
    mockPaginatedQueries(
      [{ asset_id: "1", market_hash_name: "Test", best_price: 0 }],
      50 // total items = 50 but only returning 1
    );

    const res = await request(app)
      .get("/api/inventory?limit=20&offset=0")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(50);
    expect(res.body.hasMore).toBe(true);
    expect(res.body.limit).toBe(20);
    expect(res.body.offset).toBe(0);
  });
});

// ─── GET /api/inventory — avatar_url and multi-account tests ─────────────

describe("GET /api/inventory — account_avatar_url", () => {
  const mockItem = {
    asset_id: "abc",
    market_hash_name: "AK-47 | Redline (FT)",
    account_id: 1,
    account_steam_id: "76561198000000001",
    account_name: "TestUser",
    account_avatar_url: "https://avatars.steamstatic.com/abc_medium.jpg",
    tradable: true,
    best_price: 0,
  };

  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns all accounts items when no accountId filter", async () => {
    mockPaginatedQueries([mockItem]);

    const res = await request(app)
      .get("/api/inventory")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it("includes account_avatar_url in each item", async () => {
    mockPaginatedQueries([mockItem]);

    const res = await request(app)
      .get("/api/inventory")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.items[0].account_avatar_url).toBe(
      "https://avatars.steamstatic.com/abc_medium.jpg"
    );
  });

  it("filters by accountId when provided", async () => {
    mockPaginatedQueries([mockItem]);

    const res = await request(app)
      .get("/api/inventory?accountId=1")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.items[0].account_id).toBe(1);
  });
});
