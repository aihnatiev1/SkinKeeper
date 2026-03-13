import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf-8");

// Mock axios before importing modules that use it
const mockAxiosGet = vi.fn();
vi.mock("axios", () => ({
  default: {
    get: (...args: any[]) => mockAxiosGet(...args),
    post: vi.fn().mockResolvedValue({ data: {} }),
    create: vi.fn().mockReturnValue({
      get: (...args: any[]) => mockAxiosGet(...args),
      post: vi.fn().mockResolvedValue({ data: {} }),
    }),
  },
}));

const mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
vi.mock("../../db/pool.js", () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
}));

const mockGetSession = vi.fn();
vi.mock("../steamSession.js", () => ({
  SteamSessionService: {
    getActiveAccountId: vi.fn().mockResolvedValue(1),
    ensureValidSession: vi.fn().mockResolvedValue({
      sessionId: "test-session-id",
      steamLoginSecure: "test-login-secure",
    }),
    getSession: (...args: any[]) => mockGetSession(...args),
    refreshSession: vi.fn().mockResolvedValue({ refreshed: false }),
  },
}));

vi.mock("../firebase.js", () => ({
  isFirebaseReady: vi.fn().mockReturnValue(false),
  sendPush: vi.fn().mockResolvedValue({ successCount: 0, failedTokens: [] }),
}));

vi.mock("../prices.js", () => ({
  getLatestPrices: vi.fn().mockResolvedValue(new Map()),
}));

vi.mock("../../utils/cacheRegistry.js", () => ({
  registerCache: vi.fn(),
  getCacheStats: vi.fn().mockReturnValue([]),
}));

import { fetchTradeToken, syncTradeOffers } from "../tradeOffers.js";

const testSession = { sessionId: "sid123", steamLoginSecure: "secure123" };

describe("fetchTradeToken — cheerio path", () => {
  beforeEach(() => {
    mockAxiosGet.mockReset();
  });

  it("extracts token from trade_offer_access_url input (cheerio)", async () => {
    mockAxiosGet.mockResolvedValue({ data: fixture("trade_token_page.html") });
    const token = await fetchTradeToken(testSession);
    expect(token).toBe("ABCDE1234");
  });

  it("returns null when token input is missing", async () => {
    mockAxiosGet.mockResolvedValue({ data: "<html><body>No token here</body></html>" });
    const token = await fetchTradeToken(testSession);
    expect(token).toBeNull();
  });

  it("returns null when network request fails", async () => {
    mockAxiosGet.mockRejectedValue(new Error("Network error"));
    const token = await fetchTradeToken(testSession);
    expect(token).toBeNull();
  });
});

describe("syncTradeOffers — exercises parseTradeOffersHtml internally", () => {
  beforeEach(() => {
    mockAxiosGet.mockReset();
    mockQuery.mockReset().mockResolvedValue({ rows: [], rowCount: 0 });
    mockGetSession.mockReset();
  });

  it("completes without throwing when Steam returns incoming offers HTML", async () => {
    // 1. pool.query: SELECT id FROM steam_accounts WHERE user_id = $1
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });
    // 2. pool.query: getWebApiKey -> SELECT web_api_key FROM steam_accounts WHERE id = $1
    mockQuery.mockResolvedValueOnce({ rows: [{ web_api_key: "test-api-key" }], rowCount: 1 });
    // 3. axios.get: Steam GetTradeOffers API -> empty (no active offers)
    mockAxiosGet.mockResolvedValueOnce({ data: { response: {} } });
    // 4. scrapeTradeOffersHtml: SteamSessionService.getSession
    mockGetSession.mockResolvedValue(testSession);
    // 5. axios.get: eligibility cookie (returns no set-cookie header)
    mockAxiosGet.mockResolvedValueOnce({ data: "", headers: {} });
    // 6. pool.query: SELECT user_id, steam_id FROM steam_accounts WHERE id = $1
    mockQuery.mockResolvedValueOnce({
      rows: [{ user_id: 1, steam_id: "76561198000000001" }],
      rowCount: 1,
    });
    // 7. pool.query: SELECT id, steam_id FROM steam_accounts WHERE user_id = $1
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, steam_id: "76561198000000001" }],
      rowCount: 1,
    });
    // 8. axios.get: incoming offers page -> fixture with one offer
    mockAxiosGet.mockResolvedValueOnce({
      status: 200,
      data: fixture("trade_offers_incoming.html"),
    });
    // 9. axios.get: outgoing offers page -> empty
    mockAxiosGet.mockResolvedValueOnce({
      status: 200,
      data: fixture("trade_offers_empty.html"),
    });
    // Remaining pool.query calls (upsert, stale offers check, history check) return empty
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(syncTradeOffers(1)).resolves.not.toThrow();
  });

  it("completes without throwing when Steam returns empty offers HTML", async () => {
    // 1. pool.query: SELECT id FROM steam_accounts WHERE user_id = $1
    mockQuery.mockResolvedValueOnce({ rows: [{ id: 1 }], rowCount: 1 });
    // 2. pool.query: getWebApiKey -> return api key
    mockQuery.mockResolvedValueOnce({ rows: [{ web_api_key: "test-api-key" }], rowCount: 1 });
    // 3. axios.get: Steam GetTradeOffers API -> empty
    mockAxiosGet.mockResolvedValueOnce({ data: { response: {} } });
    // 4. SteamSessionService.getSession
    mockGetSession.mockResolvedValue(testSession);
    // 5. axios.get: eligibility cookie
    mockAxiosGet.mockResolvedValueOnce({ data: "", headers: {} });
    // 6. pool.query: SELECT user_id, steam_id FROM steam_accounts WHERE id = $1
    mockQuery.mockResolvedValueOnce({
      rows: [{ user_id: 1, steam_id: "76561198000000001" }],
      rowCount: 1,
    });
    // 7. pool.query: SELECT id, steam_id FROM steam_accounts WHERE user_id = $1
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 1, steam_id: "76561198000000001" }],
      rowCount: 1,
    });
    // 8 & 9. Both HTML pages return empty
    mockAxiosGet.mockResolvedValue({ status: 200, data: fixture("trade_offers_empty.html") });
    // Remaining pool.query calls return empty
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(syncTradeOffers(1)).resolves.not.toThrow();
  });

  it("returns early when no steam accounts found for user", async () => {
    // pool.query: no accounts
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const result = await syncTradeOffers(1);
    expect(result).toEqual({ synced: 0 });
  });
});
