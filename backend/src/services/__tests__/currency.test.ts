import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock axios
vi.mock("axios");

// Mock pool
vi.mock("../../db/pool.js", () => ({
  pool: { query: vi.fn() },
}));

// Mock cacheRegistry to avoid side effects
vi.mock("../../utils/cacheRegistry.js", () => ({
  registerCache: vi.fn(),
}));

import axios from "axios";
import { pool } from "../../db/pool.js";

const mockedAxios = vi.mocked(axios);
const mockedPool = pool as unknown as { query: ReturnType<typeof vi.fn> };

describe("getCurrencyInfo", () => {
  it("returns USD info for ID 1", async () => {
    const { getCurrencyInfo } = await import("../currency.js");
    const info = getCurrencyInfo(1);
    expect(info?.code).toBe("USD");
    expect(info?.symbol).toBe("$");
    expect(info?.decimals).toBe(2);
  });

  it("returns EUR info for ID 3", async () => {
    const { getCurrencyInfo } = await import("../currency.js");
    const info = getCurrencyInfo(3);
    expect(info?.code).toBe("EUR");
    expect(info?.symbol).toBe("€");
  });

  it("returns UAH info for ID 18", async () => {
    const { getCurrencyInfo } = await import("../currency.js");
    const info = getCurrencyInfo(18);
    expect(info?.code).toBe("UAH");
  });

  it("returns null for unknown currency ID", async () => {
    const { getCurrencyInfo } = await import("../currency.js");
    expect(getCurrencyInfo(9999)).toBeNull();
  });
});

describe("getExchangeRate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 1 for USD (ID 1) without network call", async () => {
    const { getExchangeRate } = await import("../currency.js");
    const rate = await getExchangeRate(1);
    expect(rate).toBe(1);
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it("fetches rate from Steam API for non-USD currency", async () => {
    mockedAxios.get = vi.fn()
      .mockResolvedValueOnce({ data: { success: true, lowest_price: "$10.00" } }) // USD
      .mockResolvedValueOnce({ data: { success: true, lowest_price: "300.00₴" } }); // UAH

    const { getExchangeRate } = await import("../currency.js");
    const rate = await getExchangeRate(18); // UAH
    expect(typeof rate).toBe("number");
    expect(rate).toBeGreaterThan(0);
  });

  it("falls back to forex API when Steam fails", async () => {
    // All Steam probe attempts fail
    mockedAxios.get = vi.fn()
      .mockRejectedValueOnce(new Error("429"))
      .mockRejectedValueOnce(new Error("429"))
      .mockRejectedValueOnce(new Error("429"))
      // Forex API succeeds
      .mockResolvedValueOnce({ data: { rates: { UAH: 40.5 } } });

    const { getExchangeRate } = await import("../currency.js");
    const rate = await getExchangeRate(18);
    expect(rate).toBe(40.5);
  });

  it("returns null when both Steam and forex APIs fail", async () => {
    mockedAxios.get = vi.fn().mockRejectedValue(new Error("network error"));

    const { getExchangeRate } = await import("../currency.js");
    const rate = await getExchangeRate(18);
    expect(rate).toBeNull();
  });
});

describe("convertUsdToWallet", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns same value for USD (no conversion needed)", async () => {
    const { convertUsdToWallet } = await import("../currency.js");
    expect(await convertUsdToWallet(1000, 1)).toBe(1000);
  });

  it("returns same value for USD cents (walletCurrencyId=1)", async () => {
    const { convertUsdToWallet } = await import("../currency.js");
    // USD to USD is always 1:1
    const result = await convertUsdToWallet(100, 1);
    expect(result).toBe(100);
  });

  it("returns null when rate unavailable", async () => {
    mockedAxios.get = vi.fn().mockRejectedValue(new Error("fail"));

    const { convertUsdToWallet } = await import("../currency.js");
    const result = await convertUsdToWallet(1000, 18);
    expect(result).toBeNull();
  });
});

describe("getWalletCurrency", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("returns stored currency from DB", async () => {
    mockedPool.query = vi.fn().mockResolvedValue({ rows: [{ wallet_currency: 18 }] });

    const { getWalletCurrency } = await import("../currency.js");
    const currency = await getWalletCurrency(1);
    expect(currency).toBe(18);
  });

  it("returns null when no currency stored and no steamLoginSecure", async () => {
    mockedPool.query = vi.fn().mockResolvedValue({ rows: [{ wallet_currency: null }] });

    const { getWalletCurrency } = await import("../currency.js");
    const currency = await getWalletCurrency(1);
    expect(currency).toBeNull();
  });
});
