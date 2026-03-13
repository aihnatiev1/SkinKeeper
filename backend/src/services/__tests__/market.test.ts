import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock axios
const mockAxiosGet = vi.fn();
const mockAxiosPost = vi.fn();
vi.mock("axios", () => ({
  default: {
    get: (...args: any[]) => mockAxiosGet(...args),
    post: (...args: any[]) => mockAxiosPost(...args),
  },
}));

// Mock pool (unused in sellItem but required for module import)
vi.mock("../../db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

// Mock steamSession
vi.mock("../steamSession.js", () => ({
  SteamSessionService: {},
}));

// Mock currency — no DB/network needed for sell tests
vi.mock("../currency.js", () => ({
  convertUsdToWallet: vi.fn().mockResolvedValue(null), // null = use USD directly
  getWalletCurrency: vi.fn().mockResolvedValue(null),
  getCurrencyInfo: vi.fn().mockReturnValue(null),
}));

// Mock prices — getLatestPrices should return empty map so quickSellPrice falls through
const mockGetLatestPrices = vi.fn().mockResolvedValue(new Map());
vi.mock("../prices.js", () => ({
  getLatestPrices: (...args: any[]) => mockGetLatestPrices(...args),
}));

import { sellItem, quickSellPrice, getMarketPrice } from "../market.js";
import type { SteamSession } from "../steamSession.js";

const makeSession = (overrides?: Partial<SteamSession>): SteamSession => ({
  sessionId: "abc123def456",
  steamLoginSecure: "76561198000000000%7C%7CeyAtoken",
  ...overrides,
});

describe("sellItem", () => {
  beforeEach(() => {
    mockAxiosGet.mockReset();
    mockAxiosPost.mockReset();
  });

  it("fetches fresh sessionId before selling and uses it in both Cookie and POST", async () => {
    const freshSessionId = "freshsid999";

    // GET /market/ returns fresh sessionid in Set-Cookie
    mockAxiosGet.mockResolvedValue({
      headers: {
        "set-cookie": [`sessionid=${freshSessionId}; Path=/; Secure`],
      },
    });

    // POST /market/sellitem/ succeeds
    mockAxiosPost.mockResolvedValue({
      data: { success: true, requires_confirmation: 0 },
    });

    const session = makeSession();
    const result = await sellItem(session, "12345", 100);

    expect(result.success).toBe(true);

    // Verify POST was called with fresh sessionId
    const postCall = mockAxiosPost.mock.calls[0];
    const postBody: string = postCall[1];
    const cookieHeader: string = postCall[2].headers.Cookie;

    // POST body should contain the fresh sessionid
    expect(postBody).toContain(`sessionid=${freshSessionId}`);
    // Cookie header should also contain the fresh sessionid
    expect(cookieHeader).toContain(`sessionid=${freshSessionId}`);
    // Both should match — no encoding mismatch
    expect(postBody).toContain(`sessionid=${freshSessionId}`);
  });

  it("falls back to stored sessionId when fresh fetch fails", async () => {
    // GET fails
    mockAxiosGet.mockRejectedValue(new Error("Network error"));

    // POST succeeds
    mockAxiosPost.mockResolvedValue({
      data: { success: true, requires_confirmation: 0 },
    });

    const session = makeSession({ sessionId: "stored_sid" });
    const result = await sellItem(session, "12345", 100);

    expect(result.success).toBe(true);

    const postBody: string = mockAxiosPost.mock.calls[0][1];
    expect(postBody).toContain("sessionid=stored_sid");
  });

  it("returns failure with message when Steam rejects the listing", async () => {
    mockAxiosGet.mockResolvedValue({
      headers: { "set-cookie": ["sessionid=sid1; Path=/"] },
    });

    mockAxiosPost.mockResolvedValue({
      data: { success: false, message: "You are not allowed to sell this item" },
    });

    const result = await sellItem(makeSession(), "12345", 100);

    expect(result.success).toBe(false);
    expect(result.message).toBe("You are not allowed to sell this item");
  });

  it("returns failure on network error", async () => {
    mockAxiosGet.mockResolvedValue({
      headers: { "set-cookie": ["sessionid=sid1; Path=/"] },
    });

    mockAxiosPost.mockRejectedValue({
      response: { data: { message: "Request timeout" } },
      message: "timeout",
    });

    const result = await sellItem(makeSession(), "12345", 100);

    expect(result.success).toBe(false);
    expect(result.message).toBe("Request timeout");
  });

  it("sets requiresConfirmation when Steam requires it", async () => {
    mockAxiosGet.mockResolvedValue({
      headers: { "set-cookie": ["sessionid=sid1; Path=/"] },
    });

    mockAxiosPost.mockResolvedValue({
      data: { success: true, requires_confirmation: 1 },
    });

    const result = await sellItem(makeSession(), "12345", 500);

    expect(result.success).toBe(true);
    expect(result.requiresConfirmation).toBe(true);
  });

  it("sessionId in Cookie and POST body always match (no encoding mismatch)", async () => {
    // Simulate a sessionid with special characters (edge case)
    const tricky = "abc%3Ddef";
    mockAxiosGet.mockResolvedValue({
      headers: { "set-cookie": [`sessionid=${tricky}; Path=/`] },
    });

    mockAxiosPost.mockResolvedValue({
      data: { success: true, requires_confirmation: 0 },
    });

    await sellItem(makeSession(), "12345", 100);

    const postBody: string = mockAxiosPost.mock.calls[0][1];
    const cookieHeader: string = mockAxiosPost.mock.calls[0][2].headers.Cookie;

    // The key point: the sessionid sent in Cookie must match the raw value
    expect(cookieHeader).toContain(`sessionid=${tricky}`);
    // URLSearchParams.get() decodes percent-encoding, so abc%3Ddef → abc=def
    // But both Cookie and POST body came from the same raw value — consistent
    const params = new URLSearchParams(postBody);
    // Decoded value should be the URL-decoded form of the raw value
    expect(params.get("sessionid")).toBe(decodeURIComponent(tricky));
  });
});

describe("getMarketPrice", () => {
  beforeEach(() => {
    mockAxiosGet.mockReset();
  });

  it("parses Steam price response correctly", async () => {
    mockAxiosGet.mockResolvedValue({
      data: {
        success: true,
        lowest_price: "$12.34",
        median_price: "$11.50",
        volume: "42",
      },
    });

    const price = await getMarketPrice("AK-47 | Redline (Field-Tested)");

    expect(price).toEqual({
      lowestPrice: 1234,
      medianPrice: 1150,
      volume: "42",
    });
  });

  it("returns nulls when Steam returns failure", async () => {
    mockAxiosGet.mockResolvedValue({ data: { success: false } });

    const price = await getMarketPrice("Nonexistent Item");

    expect(price).toEqual({
      lowestPrice: null,
      medianPrice: null,
      volume: null,
    });
  });

  it("returns nulls on network error", async () => {
    mockAxiosGet.mockRejectedValue(new Error("timeout"));

    const price = await getMarketPrice("Any Item");

    expect(price).toEqual({
      lowestPrice: null,
      medianPrice: null,
      volume: null,
    });
  });
});

describe("quickSellPrice", () => {
  beforeEach(() => {
    mockAxiosGet.mockReset();
  });

  it("calculates quick sell price as lowest minus fees minus 1 cent", async () => {
    // Lowest price = $10.00 (1000 cents) — buyer pays
    // Valve fee = floor(1000 * 0.05) = 50
    // CS2 fee = floor(1000 * 0.10) = 100
    // Seller receives = 1000 - 50 - 100 = 850
    // Quick sell = 850 - 1 = 849
    mockAxiosGet.mockResolvedValue({
      data: {
        success: true,
        lowest_price: "$10.00",
        median_price: "$9.50",
        volume: "100",
      },
    });

    const price = await quickSellPrice("AK-47 | Redline (Field-Tested)");
    expect(price).toBe(849);
  });

  it("returns null when no market price available", async () => {
    mockAxiosGet.mockResolvedValue({ data: { success: false } });

    const price = await quickSellPrice("Nonexistent");
    expect(price).toBeNull();
  });
});
