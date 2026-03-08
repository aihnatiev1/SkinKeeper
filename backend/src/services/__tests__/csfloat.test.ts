import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";

vi.mock("axios");
const mockedAxios = vi.mocked(axios);

describe("csfloat", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, CSFLOAT_API_KEY: "test-api-key" };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("fetchCSFloatItemPrice", () => {
    it("returns price in USD (cents divided by 100)", async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({
        data: [
          {
            id: "listing-1",
            price: 1234, // cents
            item: {
              market_hash_name: "AK-47 | Redline (Field-Tested)",
              float_value: 0.25,
            },
          },
        ],
      });

      const { fetchCSFloatItemPrice } = await import("../csfloat.js");
      const price = await fetchCSFloatItemPrice(
        "AK-47 | Redline (Field-Tested)",
        "test-api-key"
      );
      expect(price).toBe(12.34);
    });

    it("returns null when API returns no listings", async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({ data: [] });

      const { fetchCSFloatItemPrice } = await import("../csfloat.js");
      const price = await fetchCSFloatItemPrice(
        "Nonexistent Skin",
        "test-api-key"
      );
      expect(price).toBeNull();
    });

    it("returns null on network error", async () => {
      mockedAxios.get = vi.fn().mockRejectedValue(new Error("Network Error"));

      const { fetchCSFloatItemPrice } = await import("../csfloat.js");
      const price = await fetchCSFloatItemPrice(
        "AK-47 | Redline (Field-Tested)",
        "test-api-key"
      );
      expect(price).toBeNull();
    });
  });

  describe("fetchCSFloatPrices", () => {
    it("returns Map with prices for multiple items", async () => {
      mockedAxios.get = vi
        .fn()
        .mockResolvedValueOnce({
          data: [{ id: "1", price: 1234, item: { market_hash_name: "AK-47 | Redline (Field-Tested)", float_value: 0.25 } }],
        })
        .mockResolvedValueOnce({
          data: [{ id: "2", price: 5678, item: { market_hash_name: "AWP | Asiimov (Field-Tested)", float_value: 0.3 } }],
        });

      const { fetchCSFloatPrices } = await import("../csfloat.js");
      const prices = await fetchCSFloatPrices([
        "AK-47 | Redline (Field-Tested)",
        "AWP | Asiimov (Field-Tested)",
      ]);

      expect(prices).toBeInstanceOf(Map);
      expect(prices.get("AK-47 | Redline (Field-Tested)")).toBe(12.34);
      expect(prices.get("AWP | Asiimov (Field-Tested)")).toBe(56.78);
    });

    it("returns empty Map when API key is missing", async () => {
      delete process.env.CSFLOAT_API_KEY;

      const { fetchCSFloatPrices } = await import("../csfloat.js");
      const prices = await fetchCSFloatPrices(["AK-47 | Redline (Field-Tested)"]);
      expect(prices.size).toBe(0);
    });

    it("deduplicates input market_hash_names", async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({
        data: [{ id: "1", price: 1234, item: { market_hash_name: "AK-47 | Redline (Field-Tested)", float_value: 0.25 } }],
      });

      const { fetchCSFloatPrices } = await import("../csfloat.js");
      await fetchCSFloatPrices([
        "AK-47 | Redline (Field-Tested)",
        "AK-47 | Redline (Field-Tested)",
        "AK-47 | Redline (Field-Tested)",
      ]);

      // Should only call once despite 3 identical names
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it("handles partial failures gracefully", async () => {
      mockedAxios.get = vi
        .fn()
        .mockResolvedValueOnce({
          data: [{ id: "1", price: 1234, item: { market_hash_name: "AK-47 | Redline (Field-Tested)", float_value: 0.25 } }],
        })
        .mockRejectedValueOnce(new Error("429 Too Many Requests"));

      const { fetchCSFloatPrices } = await import("../csfloat.js");
      const prices = await fetchCSFloatPrices([
        "AK-47 | Redline (Field-Tested)",
        "AWP | Asiimov (Field-Tested)",
      ]);

      expect(prices.size).toBe(1);
      expect(prices.get("AK-47 | Redline (Field-Tested)")).toBe(12.34);
    });
  });
});
