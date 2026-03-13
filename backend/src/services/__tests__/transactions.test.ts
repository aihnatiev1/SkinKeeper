import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock axios
vi.mock("axios");

// Mock pool
const mockQuery = vi.fn();
vi.mock("../../db/pool.js", () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
}));

// Mock currency
vi.mock("../currency.js", () => ({
  getExchangeRate: vi.fn().mockResolvedValue(1), // USD to USD = 1
}));

// Mock prices (not used in fetchSteamTransactions)
vi.mock("../prices.js", () => ({
  getLatestPrices: vi.fn().mockResolvedValue(new Map()),
}));

import axios from "axios";
const mockedAxios = vi.mocked(axios);

import { fetchSteamTransactions, saveTransactions } from "../transactions.js";
import type { SteamSession } from "../steamSession.js";

const mockSession: SteamSession = {
  sessionId: "test-session",
  steamLoginSecure: "76561198000000000%7C%7Ctoken",
};

function makeHistoryResponse(overrides: Partial<{
  success: boolean;
  total_count: number;
  events: any[];
  listings: Record<string, any>;
  purchases: Record<string, any>;
  assets: Record<string, any>;
}> = {}) {
  return {
    success: true,
    total_count: 0,
    events: [],
    listings: {},
    purchases: {},
    assets: { "730": { "2": {} } },
    ...overrides,
  };
}

describe("fetchSteamTransactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns empty transactions for empty history", async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: makeHistoryResponse(),
    });

    const result = await fetchSteamTransactions(mockSession);
    expect(result.transactions).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it("throws when Steam returns success=false", async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: { success: false },
    });

    await expect(fetchSteamTransactions(mockSession)).rejects.toThrow(
      "Failed to fetch transaction history"
    );
  });

  it("parses a buy event (event_type=4) correctly", async () => {
    const listingId = "111222333";
    const timeEvent = 1700000000;
    const assetId = "asset001";

    mockedAxios.get = vi.fn().mockResolvedValue({
      data: makeHistoryResponse({
        total_count: 1,
        events: [
          {
            listingid: listingId,
            purchaseid: "purch001",
            event_type: 4, // buy
            time_event: timeEvent,
            steamid_actor: "76561198000000002",
          },
        ],
        listings: {
          [listingId]: {
            listingid: listingId,
            price: 1000, // cents buyer pays
            fee: 50,
            publisher_fee: 100,
            publisher_fee_app: 730,
            currencyid: 1,
            original_price: 1000,
            asset: { appid: 730, contextid: "2", id: assetId, amount: "1" },
          },
        },
        purchases: {
          [`${listingId}_purch001`]: {
            listingid: listingId,
            purchaseid: "purch001",
            steamid_purchaser: "76561198000000001",
            paid_amount: 1000,
            paid_fee: 150,
            steam_fee: 50,
            publisher_fee: 100,
            received_amount: 850,
            received_currencyid: "1",
            currencyid: "1",
            asset: { appid: 730, contextid: "2", id: assetId, amount: "1" },
          },
        },
        assets: {
          "730": {
            "2": {
              [assetId]: {
                classid: "123",
                instanceid: "0",
                name: "AK-47 | Redline",
                market_hash_name: "AK-47 | Redline (Field-Tested)",
                icon_url: "https://example.com/icon.png",
              },
            },
          },
        },
      }),
    });

    const result = await fetchSteamTransactions(mockSession);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("buy");
    expect(tx.marketHashName).toBe("AK-47 | Redline (Field-Tested)");
    expect(tx.price).toBe(1150); // paid_amount + paid_fee = 1000 + 150
    expect(tx.id).toContain(listingId);
    expect(tx.date).toBe(new Date(timeEvent * 1000).toISOString());
  });

  it("parses a sell event (event_type=3) correctly", async () => {
    const listingId = "444555666";
    const timeEvent = 1700100000;
    const assetId = "asset002";

    mockedAxios.get = vi.fn().mockResolvedValue({
      data: makeHistoryResponse({
        total_count: 1,
        events: [
          {
            listingid: listingId,
            purchaseid: "purch002",
            event_type: 3, // sell
            time_event: timeEvent,
            steamid_actor: "76561198000000099",
          },
        ],
        listings: {
          [listingId]: {
            listingid: listingId,
            price: 0,
            fee: 50,
            publisher_fee: 100,
            publisher_fee_app: 730,
            currencyid: 1,
            original_price: 2000,
            asset: { appid: 730, contextid: "2", id: assetId, amount: "1" },
          },
        },
        purchases: {
          [`${listingId}_purch002`]: {
            listingid: listingId,
            purchaseid: "purch002",
            steamid_purchaser: "76561198000000099",
            paid_amount: 2000,
            paid_fee: 300,
            steam_fee: 100,
            publisher_fee: 200,
            received_amount: 1700, // what seller received
            received_currencyid: "1",
            currencyid: "1",
            asset: { appid: 730, contextid: "2", id: assetId, amount: "1" },
          },
        },
        assets: {
          "730": {
            "2": {
              [assetId]: {
                classid: "456",
                instanceid: "0",
                name: "AWP | Asiimov",
                market_hash_name: "AWP | Asiimov (Field-Tested)",
                icon_url: "https://example.com/icon2.png",
              },
            },
          },
        },
      }),
    });

    const result = await fetchSteamTransactions(mockSession);

    expect(result.transactions).toHaveLength(1);
    const tx = result.transactions[0];
    expect(tx.type).toBe("sell");
    expect(tx.price).toBe(1700); // received_amount
  });

  it("skips events with no matching asset", async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: makeHistoryResponse({
        total_count: 1,
        events: [
          {
            listingid: "999",
            event_type: 4,
            time_event: 1700000000,
            steamid_actor: "steam123",
          },
        ],
        listings: {},
        purchases: {},
      }),
    });

    const result = await fetchSteamTransactions(mockSession);
    expect(result.transactions).toHaveLength(0);
  });

  it("skips non-market events (event_type != 3 and != 4)", async () => {
    mockedAxios.get = vi.fn().mockResolvedValue({
      data: makeHistoryResponse({
        events: [
          { listingid: "111", event_type: 1, time_event: 1700000000, steamid_actor: "s" },
          { listingid: "222", event_type: 7, time_event: 1700000000, steamid_actor: "s" },
        ],
      }),
    });

    const result = await fetchSteamTransactions(mockSession);
    expect(result.transactions).toHaveLength(0);
  });
});

describe("saveTransactions", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns 0 for empty array", async () => {
    const saved = await saveTransactions(1, [], undefined);
    expect(saved).toBe(0);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("inserts transactions and returns new count", async () => {
    const tx = {
      id: "listing_123_1700000000",
      type: "buy" as const,
      marketHashName: "AK-47 | Redline (Field-Tested)",
      price: 1234,
      date: "2025-12-01T00:00:00.000Z",
    };

    mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // INSERT

    const saved = await saveTransactions(1, [tx], 1);
    expect(saved).toBe(1);
  });

  it("deduplicates on tx_id (upsert does nothing on conflict)", async () => {
    const tx = {
      id: "listing_dup_123",
      type: "sell" as const,
      marketHashName: "AWP | Asiimov (Field-Tested)",
      price: 5000,
      date: "2025-12-01T00:00:00.000Z",
    };

    mockQuery.mockResolvedValueOnce({ rowCount: 0 }); // no new rows (conflict)

    const saved = await saveTransactions(1, [tx]);
    expect(saved).toBe(0);
  });
});
