import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import { createTestJwt } from "../../__tests__/helpers.js";

const mockQuery = vi.fn();
vi.mock("../../db/pool.js", () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  checkPoolHealth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/transactions.js", () => ({
  fetchSteamTransactions: vi.fn().mockResolvedValue({ transactions: [], totalCount: 0 }),
  saveTransactions: vi.fn().mockResolvedValue(0),
  getTransactions: vi.fn().mockResolvedValue([]),
  getTransactionItems: vi.fn().mockResolvedValue([]),
  getTransactionStats: vi.fn().mockResolvedValue({
    totalBuys: 0,
    totalSells: 0,
    totalBoughtCents: 0,
    totalSoldCents: 0,
    realizedProfitCents: 0,
  }),
  getLatestTxDate: vi.fn().mockResolvedValue(null),
  countExistingTxIds: vi.fn().mockResolvedValue(0),
}));

vi.mock("../../services/steamSession.js", () => ({
  SteamSessionService: {
    getActiveAccountId: vi.fn().mockResolvedValue(1),
    getSession: vi.fn().mockResolvedValue({
      sessionId: "test-session",
      steamLoginSecure: "test-secure",
    }),
  },
}));

vi.mock("../../services/profitLoss.js", () => ({
  recalculateCostBasis: vi.fn().mockResolvedValue(undefined),
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

import { createTestApp } from "../../__tests__/app.js";

const app = createTestApp();
const jwt = createTestJwt(1);

// Auth middleware does a demo-check query: SELECT steam_id FROM users WHERE id = $1
const mockDemoCheck = () => mockQuery.mockResolvedValueOnce({ rows: [{ steam_id: "76561198000000001" }] });

describe("Transactions routes", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe("GET /api/transactions", () => {
    it("returns 401 without token", async () => {
      const res = await request(app).get("/api/transactions");
      expect(res.status).toBe(401);
    });

    it("returns empty transactions list", async () => {
      mockDemoCheck();
      const { getTransactions } = await import("../../services/transactions.js");
      vi.mocked(getTransactions).mockResolvedValueOnce({ transactions: [], total: 0 } as any);

      const res = await request(app)
        .get("/api/transactions")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.transactions).toEqual([]);
      expect(res.body.total).toBe(0);
    });

    it("returns transactions with pagination", async () => {
      mockDemoCheck();
      const { getTransactions } = await import("../../services/transactions.js");
      vi.mocked(getTransactions).mockResolvedValueOnce({
        transactions: [
          {
            tx_id: "tx_001",
            type: "buy",
            market_hash_name: "AK-47 | Redline (Field-Tested)",
            price_cents: 1234,
            tx_date: "2025-12-01T00:00:00.000Z",
            source: "steam",
          },
        ],
        total: 1,
      } as any);

      const res = await request(app)
        .get("/api/transactions?limit=20&offset=0")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      expect(res.body.transactions).toHaveLength(1);
      expect(res.body.transactions[0].type).toBe("buy");
    });

    it("filters by type when provided", async () => {
      mockDemoCheck();
      const { getTransactions } = await import("../../services/transactions.js");
      vi.mocked(getTransactions).mockResolvedValueOnce({ transactions: [], total: 0 } as any);

      const res = await request(app)
        .get("/api/transactions?type=sell")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(200);
    });
  });

  describe("GET /api/transactions/stats", () => {
    it("returns 401 without token", async () => {
      const res = await request(app).get("/api/transactions/stats");
      expect(res.status).toBe(401);
    });

    it("returns transaction statistics", async () => {
      mockDemoCheck();
      const { getTransactionStats } = await import("../../services/transactions.js");
      vi.mocked(getTransactionStats).mockResolvedValueOnce({
        totalBuys: 10,
        totalSells: 5,
        totalBoughtCents: 50000,
        totalSoldCents: 30000,
        realizedProfitCents: -5000,
      } as any);

      const res = await request(app)
        .get("/api/transactions/stats")
        .set("Authorization", `Bearer ${jwt}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("totalBuys");
    });
  });
});
