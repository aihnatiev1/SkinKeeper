import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createTestJwt } from "../../__tests__/helpers.js";

// Mock all dependencies before importing app
const mockQuery = vi.fn();
vi.mock("../../db/pool.js", () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  checkPoolHealth: vi.fn().mockResolvedValue(undefined),
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
    startCredentialLogin: vi.fn().mockResolvedValue({ nonce: "cred123" }),
    submitGuardCode: vi.fn().mockResolvedValue(null),
    handleClientToken: vi.fn().mockResolvedValue(null),
    refreshSession: vi.fn().mockResolvedValue({ refreshed: false }),
    linkNewAccount: vi.fn(),
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

// ─── POST /api/session/qr/start ──────────────────────────────────────────

describe("POST /api/session/qr/start", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns 401 without JWT", async () => {
    const res = await request(app).post("/api/session/qr/start");
    expect(res.status).toBe(401);
  });

  it("returns 200 with nonce and qrUrl when session starts", async () => {
    // getActiveAccountId is mocked → returns 1
    // startQRSession is mocked → returns { nonce, qrUrl }
    const res = await request(app)
      .post("/api/session/qr/start")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.nonce).toBe("abc123");
    expect(res.body.qrUrl).toBe("steam://...");
  });
});

// ─── GET /api/session/qr/poll/:nonce ─────────────────────────────────────

describe("GET /api/session/qr/poll/:nonce", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns 401 without JWT", async () => {
    const res = await request(app).get("/api/session/qr/poll/testNonce");
    expect(res.status).toBe(401);
  });

  it("returns 200 with pending status when nonce not in pendingSessions (normal poll mode)", async () => {
    // pendingSessions is empty Map → .get(nonce) returns undefined
    // Route goes to normal mode: resolveAccountId → pollQRSession
    // pollQRSession mock returns { status: "pending" }
    const { SteamSessionService } = await import("../../services/steamSession.js");
    vi.mocked(SteamSessionService.pollQRSession).mockResolvedValueOnce({ status: "pending" } as any);

    const res = await request(app)
      .get("/api/session/qr/poll/unknown-nonce")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
  });

  it("returns polling result from pollQRSession in normal mode", async () => {
    // Normal mode calls pollQRSession which we mock to return { status: "pending" }
    const { SteamSessionService } = await import("../../services/steamSession.js");
    vi.mocked(SteamSessionService.pollQRSession).mockResolvedValueOnce({ status: "pending" } as any);

    const res = await request(app)
      .get("/api/session/qr/poll/abc123")
      .set("Authorization", `Bearer ${jwt}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBeDefined();
  });
});
