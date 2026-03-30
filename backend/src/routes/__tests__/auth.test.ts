import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createTestJwt, mockUser } from "../../__tests__/helpers.js";

// Mock all dependencies before importing app
const mockQuery = vi.fn();
vi.mock("../../db/pool.js", () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  checkPoolHealth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/steam.js", () => ({
  verifySteamOpenId: vi.fn().mockResolvedValue("76561198000000001"),
  getSteamProfile: vi.fn().mockResolvedValue({
    personaname: "TestUser",
    avatarfull: "https://avatars.steamstatic.com/test.jpg",
  }),
  fetchSteamInventory: vi.fn().mockResolvedValue([]),
  fetchSteamFriends: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../services/steamSession.js", () => ({
  SteamSessionService: {
    getActiveAccountId: vi.fn().mockResolvedValue(1),
    getSession: vi.fn().mockResolvedValue({ sessionId: "s", steamLoginSecure: "sl" }),
    saveSession: vi.fn().mockResolvedValue(undefined),
    ensureValidSession: vi.fn().mockResolvedValue({ sessionId: "s", steamLoginSecure: "sl" }),
    extractSessionId: vi.fn().mockResolvedValue("sess123"),
    getSessionStatus: vi.fn().mockResolvedValue("valid"),
    validateSession: vi.fn().mockResolvedValue(true),
    startQRSession: vi.fn().mockResolvedValue({ nonce: "abc123", qrUrl: "steam://..." }),
    extractSteamIdFromCookie: vi.fn().mockReturnValue(null),
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

// Auth middleware does a demo-check query: SELECT steam_id FROM users WHERE id = $1
const mockDemoCheck = () => mockQuery.mockResolvedValueOnce({ rows: [{ steam_id: "76561198000000001" }] });

// ─── POST /api/auth/steam/verify ─────────────────────────────────────────

describe("POST /api/auth/steam/verify", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns 401 without required OpenID params (verifySteamOpenId throws)", async () => {
    const { verifySteamOpenId } = await import("../../services/steam.js");
    vi.mocked(verifySteamOpenId).mockRejectedValueOnce(new Error("Invalid OpenID"));

    const res = await request(app)
      .post("/api/auth/steam/verify")
      .send({});

    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  it("returns 200 with token and user on valid OpenID params", async () => {
    // upsert users → return user row
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, steam_id: "76561198000000001", display_name: "TestUser", avatar_url: "https://avatars.steamstatic.com/test.jpg", is_premium: false, premium_until: null }],
    });
    // insert steam_accounts
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // update users active_account_id
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/auth/steam/verify")
      .send({ "openid.mode": "id_res", "openid.ns": "http://specs.openid.net/auth/2.0" });

    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe("string");
    expect(res.body.user.steam_id).toBe("76561198000000001");
    expect(res.body.user.display_name).toBe("TestUser");
  });
});

// ─── GET /api/auth/me ────────────────────────────────────────────────────

describe("GET /api/auth/me", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns 401 without JWT", async () => {
    const res = await request(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("returns 200 with profile fields when user exists", async () => {
    mockDemoCheck();
    mockQuery.mockResolvedValueOnce({
      rows: [mockUser({ account_count: 1, active_account_id: 1 })],
    });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.steam_id).toBe("76561198000000001");
    expect(res.body.display_name).toBe("TestUser");
    expect(res.body.is_premium).toBe(false);
  });

  it("returns 404 when user not found in DB", async () => {
    mockDemoCheck();
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get("/api/auth/me")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("User not found");
  });
});

// ─── GET /api/auth/accounts ──────────────────────────────────────────────

describe("GET /api/auth/accounts", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns 401 without JWT", async () => {
    const res = await request(app).get("/api/auth/accounts");
    expect(res.status).toBe(401);
  });

  it("returns 200 with accounts list and active account info", async () => {
    mockDemoCheck();
    // accounts query
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          steam_id: "76561198000000001",
          display_name: "Main Account",
          avatar_url: "https://avatars.steamstatic.com/test.jpg",
          added_at: new Date().toISOString(),
          has_session: true,
          session_updated_at: new Date(Date.now() - 1000 * 60 * 60).toISOString(), // 1 hour ago
        },
      ],
    });
    // user active_account_id + is_premium query
    mockQuery.mockResolvedValueOnce({
      rows: [{ active_account_id: 1, is_premium: false }],
    });

    const res = await request(app)
      .get("/api/auth/accounts")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.accounts)).toBe(true);
    expect(res.body.accounts).toHaveLength(1);
    expect(res.body.accounts[0].steamId).toBe("76561198000000001");
    expect(res.body.accounts[0].isActive).toBe(true);
  });
});

// ─── DELETE /api/auth/accounts/:accountId ──────────────────────────────

describe("DELETE /api/auth/accounts/:accountId", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns 401 without JWT", async () => {
    const res = await request(app).delete("/api/auth/accounts/1");
    expect(res.status).toBe(401);
  });

  it("returns 404 when account not found", async () => {
    mockDemoCheck();
    // list accounts query — returns empty (account 99 not in user's accounts)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .delete("/api/auth/accounts/99")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe("Account not found");
  });

  it("returns 200 with success true when account deleted (multiple accounts)", async () => {
    mockDemoCheck();
    // list accounts — returns 2 accounts, target is first one (id=1)
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1 }, { id: 2 }],
    });
    // DELETE query
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // check if deleted was active account
    mockQuery.mockResolvedValueOnce({ rows: [{ active_account_id: 2 }] });

    const res = await request(app)
      .delete("/api/auth/accounts/1")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 200 with lastAccountRemoved when deleting only account", async () => {
    mockDemoCheck();
    // list accounts — returns only 1 account (the one being deleted)
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }] });
    // DELETE query
    mockQuery.mockResolvedValueOnce({ rows: [] });
    // UPDATE users SET active_account_id = NULL
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .delete("/api/auth/accounts/1")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.lastAccountRemoved).toBe(true);
  });
});

// ─── POST /api/auth/accounts/link — premium gate ─────────────────────────

describe("POST /api/auth/accounts/link — premium gate", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns 403 premium_required for free user who already has 2 accounts", async () => {
    mockDemoCheck();
    mockQuery.mockResolvedValueOnce({ rows: [{ is_premium: false }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 2 }] });

    const res = await request(app)
      .post("/api/auth/accounts/link")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe("premium_required");
  });

  it("returns 200 for free user with no accounts yet", async () => {
    mockDemoCheck();
    mockQuery.mockResolvedValueOnce({ rows: [{ is_premium: false }] });
    mockQuery.mockResolvedValueOnce({ rows: [{ cnt: 0 }] });

    const res = await request(app)
      .post("/api/auth/accounts/link")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.url).toBe("string");
  });

  it("returns 200 for premium user regardless of account count", async () => {
    mockDemoCheck();
    mockQuery.mockResolvedValueOnce({ rows: [{ is_premium: true }] });

    const res = await request(app)
      .post("/api/auth/accounts/link")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(typeof res.body.url).toBe("string");
  });
});
