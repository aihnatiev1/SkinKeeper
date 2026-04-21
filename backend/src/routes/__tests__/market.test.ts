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

vi.mock("../../services/market.js", () => ({
  sellItem: vi.fn().mockResolvedValue({ success: true }),
  quickSellPrice: vi.fn().mockResolvedValue(1000),
  bulkSell: vi.fn().mockResolvedValue([]),
  getMarketPrice: vi.fn().mockResolvedValue({ lowest: 1000 }),
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

vi.mock("../../services/sellOperations.js", () => ({
  createOperation: vi.fn().mockResolvedValue("op-uuid-123"),
  getOperation: vi.fn().mockResolvedValue(null),
  cancelOperation: vi.fn().mockResolvedValue(false),
  getDailyVolume: vi.fn().mockResolvedValue({ count: 0, limit: 200, warningAt: 150, remaining: 200 }),
}));

vi.mock("../../services/currency.js", () => ({
  getWalletInfo: vi.fn().mockResolvedValue({ currency: "USD", rate: 1.0, code: "USD", symbol: "$", currencyId: 1 }),
  getWalletCurrency: vi.fn().mockResolvedValue(1),
  detectWalletCurrency: vi.fn().mockResolvedValue(null),
  getExchangeRate: vi.fn().mockResolvedValue(1),
  getCurrencyInfo: vi.fn().mockResolvedValue({ code: "USD", symbol: "$" }),
  convertUsdToWallet: vi.fn().mockReturnValue(100),
}));

vi.mock("axios", () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: {} }),
    post: vi.fn().mockResolvedValue({ data: {} }),
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

vi.mock("../../services/steam.js", () => ({
  verifySteamOpenId: vi.fn().mockResolvedValue("76561198000000001"),
  getSteamProfile: vi.fn().mockResolvedValue({
    personaname: "TestUser",
    avatarfull: "https://avatars.steamstatic.com/test.jpg",
  }),
  fetchSteamInventory: vi.fn().mockResolvedValue([]),
  fetchSteamFriends: vi.fn().mockResolvedValue([]),
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

// IMPORTANT: app must be imported AFTER all vi.mock() calls
import { createTestApp } from "../../__tests__/app.js";
const app = createTestApp();
const jwt = createTestJwt(1);

// Auth middleware does a demo-check query: SELECT steam_id FROM users WHERE id = $1
const mockDemoCheck = () => mockQuery.mockResolvedValueOnce({ rows: [{ steam_id: "76561198000000001" }] });

// ─── POST /api/market/session (deprecated → 410) ────────────────────────

describe("POST /api/market/session", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns 401 without JWT", async () => {
    const res = await request(app)
      .post("/api/market/session")
      .send({ sessionId: "abc", steamLoginSecure: "def" });
    expect(res.status).toBe(401);
  });

  it("returns 410 (deprecated)", async () => {
    mockDemoCheck();
    const res = await request(app)
      .post("/api/market/session")
      .set("Authorization", `Bearer ${jwt}`)
      .send({ sessionId: "abc123", steamLoginSecure: "def456" });

    expect(res.status).toBe(410);
  });
});

// ─── GET /api/market/session/status (deprecated → 410) ──────────────────

describe("GET /api/market/session/status", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns 401 without JWT", async () => {
    const res = await request(app).get("/api/market/session/status");
    expect(res.status).toBe(401);
  });

  it("returns 410 (deprecated)", async () => {
    mockDemoCheck();
    const res = await request(app)
      .get("/api/market/session/status")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(410);
  });
});

// ─── GET /api/market/wallet-info ─────────────────────────────────────────

describe("GET /api/market/wallet-info", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns 401 without JWT", async () => {
    const res = await request(app).get("/api/market/wallet-info");
    expect(res.status).toBe(401);
  });

  it("returns 200 with wallet info when available", async () => {
    mockDemoCheck();
    const { getWalletInfo } = await import("../../services/currency.js");
    vi.mocked(getWalletInfo).mockResolvedValueOnce({
      currency: "USD",
      rate: 1.0,
      code: "USD",
      symbol: "$",
      currencyId: 1,
    } as any);

    const res = await request(app)
      .get("/api/market/wallet-info")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.detected).toBe(true);
  });

  it("returns default USD info when wallet info not available", async () => {
    mockDemoCheck();
    const { getWalletInfo } = await import("../../services/currency.js");
    vi.mocked(getWalletInfo).mockResolvedValueOnce(null);

    const { SteamSessionService } = await import("../../services/steamSession.js");
    vi.mocked(SteamSessionService.getSession).mockResolvedValueOnce(null as any);

    const res = await request(app)
      .get("/api/market/wallet-info")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.detected).toBe(false);
    expect(res.body.currencyId).toBe(1);
    expect(res.body.code).toBe("USD");
  });
});

// ─── SESSION_EXPIRED propagation ─────────────────────────────────────────

describe("SESSION_EXPIRED propagation", () => {
  it("POST /sell-operation returns 401 when ensureValidSession throws SessionExpiredError", async () => {
    mockDemoCheck();
    const { SteamSessionService } = await import("../../services/steamSession.js");
    vi.mocked(SteamSessionService.ensureValidSession).mockRejectedValueOnce(new SessionExpiredError());
    const jwt = createTestJwt(1);
    const res = await request(app)
      .post("/api/market/sell-operation")
      .set("Authorization", `Bearer ${jwt}`)
      .send({ items: [{ assetId: "a1", marketHashName: "AK-47 | Redline (Field-Tested)", priceCents: 500 }] });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("SESSION_EXPIRED");
  });

  // POST /sell is hardcoded-deprecated (returns 410) so session-propagation
  // no longer applies there — session tests live on /sell-operation above.
});
