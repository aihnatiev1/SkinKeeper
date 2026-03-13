import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createTestJwt } from "../../__tests__/helpers.js";
import { SessionExpiredError } from "../../utils/errors.js";

// Mock all dependencies before importing app
const mockQuery = vi.fn();
vi.mock("../../db/pool.js", () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  checkPoolHealth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/tradeOffers.js", () => ({
  createAndSendOffer: vi.fn(),
  acceptOffer: vi.fn(),
  declineOffer: vi.fn(),
  cancelOffer: vi.fn(),
  listOffers: vi.fn().mockResolvedValue({ offers: [], total: 0 }),
  getOffer: vi.fn(),
  analyzeTradeOffer: vi.fn(),
  fetchPartnerInventory: vi.fn().mockResolvedValue([]),
  fetchTradeToken: vi.fn(),
  syncTradeOffers: vi.fn().mockResolvedValue({ synced: 0 }),
}));

vi.mock("../../services/steam.js", () => ({
  fetchSteamFriends: vi.fn().mockResolvedValue([
    { steam_id: "76561198000000002", personaname: "Friend1" },
  ]),
  fetchSteamInventory: vi.fn().mockResolvedValue([]),
  verifySteamOpenId: vi.fn().mockResolvedValue("76561198000000001"),
  getSteamProfile: vi.fn().mockResolvedValue({
    personaname: "TestUser",
    avatarfull: "https://avatars.steamstatic.com/test.jpg",
  }),
}));

vi.mock("../../services/steamSession.js", () => ({
  SteamSessionService: {
    getActiveAccountId: vi.fn().mockResolvedValue(1),
    getSession: vi.fn().mockResolvedValue({ sessionId: "s", steamLoginSecure: "sl" }),
    saveSession: vi.fn().mockResolvedValue(undefined),
    ensureValidSession: vi.fn().mockResolvedValue({ sessionId: "s", steamLoginSecure: "sl" }),
    extractSessionId: vi.fn().mockResolvedValue("sess123"),
    getSessionStatus: vi.fn().mockResolvedValue("valid"),
    getSessionDetails: vi.fn().mockResolvedValue({ status: "valid", refreshTokenExpiresAt: null, refreshTokenExpired: false }),
    validateSession: vi.fn().mockResolvedValue(true),
    startQRSession: vi.fn().mockResolvedValue({ nonce: "abc123", qrUrl: "steam://..." }),
    pollQRSession: vi.fn().mockResolvedValue({ status: "pending" }),
    refreshSession: vi.fn().mockResolvedValue({ refreshed: false }),
    pendingSessions: new Map(),
  },
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

vi.mock("../../utils/cacheRegistry.js", () => ({
  registerCache: vi.fn(),
  getCacheStats: vi.fn().mockReturnValue([]),
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

vi.mock("../../services/sellOperations.js", () => ({
  createOperation: vi.fn(),
  getOperation: vi.fn(),
  cancelOperation: vi.fn(),
  getDailyVolume: vi.fn().mockResolvedValue({ count: 0, limit: 200, warningAt: 150, remaining: 200 }),
}));

vi.mock("../../services/currency.js", () => ({
  getWalletInfo: vi.fn().mockResolvedValue(null),
  getWalletCurrency: vi.fn().mockResolvedValue(1),
  detectWalletCurrency: vi.fn().mockResolvedValue(null),
  getExchangeRate: vi.fn().mockResolvedValue(1),
  getCurrencyInfo: vi.fn().mockResolvedValue({ code: "USD", symbol: "$" }),
  convertUsdToWallet: vi.fn().mockReturnValue(100),
}));

vi.mock("../../services/market.js", () => ({
  sellItem: vi.fn(),
  quickSellPrice: vi.fn(),
  bulkSell: vi.fn(),
  getMarketPrice: vi.fn(),
}));

// IMPORTANT: app must be imported AFTER all vi.mock() calls
import { createTestApp } from "../../__tests__/app.js";
const app = createTestApp();
const jwt = createTestJwt(1);

// ─── GET /api/trades/friends ─────────────────────────────────────────────

describe("GET /api/trades/friends", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns 401 without JWT", async () => {
    const res = await request(app).get("/api/trades/friends");
    expect(res.status).toBe(401);
  });

  it("returns 200 with friends list when successful", async () => {
    // getActiveAccountId → 1
    // pool.query to get steam_id from steam_accounts
    mockQuery.mockResolvedValueOnce({
      rows: [{ steam_id: "76561198000000001" }],
    });
    // fetchSteamFriends mock already returns [{ steam_id, personaname }]

    const res = await request(app)
      .get("/api/trades/friends")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.friends).toHaveLength(1);
    expect(res.body.friends[0].personaname).toBe("Friend1");
    expect(res.body.count).toBe(1);
  });

  it("returns 404 when no active account found", async () => {
    // pool.query returns empty (no steam account)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/trades/friends")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("No active account found");
  });

  it("returns 403 when friends list is private (Steam returns 401)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ steam_id: "76561198000000001" }],
    });

    const { fetchSteamFriends } = await import("../../services/steam.js");
    const error: any = new Error("Unauthorized");
    error.response = { status: 401 };
    vi.mocked(fetchSteamFriends).mockRejectedValueOnce(error);

    const res = await request(app)
      .get("/api/trades/friends")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("private");
  });
});

// ─── GET /api/trades/accounts ────────────────────────────────────────────

describe("GET /api/trades/accounts", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns 401 without JWT", async () => {
    const res = await request(app).get("/api/trades/accounts");
    expect(res.status).toBe(401);
  });

  it("returns 200 with accounts array", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          steam_id: "76561198000000001",
          display_name: "Main",
          avatar_url: "https://avatars.steamstatic.com/test.jpg",
          has_trade_token: false,
        },
      ],
    });

    const res = await request(app)
      .get("/api/trades/accounts")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.accounts)).toBe(true);
    expect(res.body.accounts).toHaveLength(1);
    expect(res.body.accounts[0].steam_id).toBe("76561198000000001");
  });
});

// ─── PUT /api/trades/accounts/:id/trade-token ────────────────────────────

describe("PUT /api/trades/accounts/:id/trade-token", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns 401 without JWT", async () => {
    const res = await request(app)
      .put("/api/trades/accounts/1/trade-token")
      .send({ tradeToken: "abc123" });
    expect(res.status).toBe(401);
  });

  it("returns 200 with success true when trade token set", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .put("/api/trades/accounts/1/trade-token")
      .set("Authorization", `Bearer ${jwt}`)
      .send({ tradeToken: "mytoken123" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 404 when account not found (rowCount 0)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .put("/api/trades/accounts/99/trade-token")
      .set("Authorization", `Bearer ${jwt}`)
      .send({ tradeToken: "mytoken123" });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Account not found");
  });

  it("returns 400 when tradeToken is missing from body", async () => {
    const res = await request(app)
      .put("/api/trades/accounts/1/trade-token")
      .set("Authorization", `Bearer ${jwt}`)
      .send({});

    expect(res.status).toBe(400);
  });
});

// ─── SESSION_EXPIRED propagation ─────────────────────────────────────────

describe("SESSION_EXPIRED propagation", () => {
  it("POST /send returns 401 SESSION_EXPIRED when service throws SessionExpiredError", async () => {
    const { createAndSendOffer } = await import("../../services/tradeOffers.js");
    vi.mocked(createAndSendOffer).mockRejectedValueOnce(new SessionExpiredError());
    const jwt = createTestJwt(1);
    const res = await request(app)
      .post("/api/trades/send")
      .set("Authorization", `Bearer ${jwt}`)
      .send({ partnerSteamId: "76561198000000001", itemsToGive: [{ assetId: "a1" }], itemsToReceive: [] });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_EXPIRED");
  });

  it("POST /:id/accept returns 401 SESSION_EXPIRED", async () => {
    const { acceptOffer } = await import("../../services/tradeOffers.js");
    vi.mocked(acceptOffer).mockRejectedValueOnce(new SessionExpiredError());
    const jwt = createTestJwt(1);
    const res = await request(app)
      .post("/api/trades/999/accept")
      .set("Authorization", `Bearer ${jwt}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_EXPIRED");
  });

  it("POST /:id/decline returns 401 SESSION_EXPIRED", async () => {
    const { declineOffer } = await import("../../services/tradeOffers.js");
    vi.mocked(declineOffer).mockRejectedValueOnce(new SessionExpiredError());
    const jwt = createTestJwt(1);
    const res = await request(app)
      .post("/api/trades/999/decline")
      .set("Authorization", `Bearer ${jwt}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_EXPIRED");
  });

  it("POST /:id/cancel returns 401 SESSION_EXPIRED", async () => {
    const { cancelOffer } = await import("../../services/tradeOffers.js");
    vi.mocked(cancelOffer).mockRejectedValueOnce(new SessionExpiredError());
    const jwt = createTestJwt(1);
    const res = await request(app)
      .post("/api/trades/999/cancel")
      .set("Authorization", `Bearer ${jwt}`);
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_EXPIRED");
  });
});
