import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import axios from "axios";

vi.mock("axios");
const mockedAxios = vi.mocked(axios);

describe("dmarket", () => {
  const originalEnv = process.env;

  // Generate a deterministic Ed25519 key pair for testing
  const testKeyPair = crypto.generateKeyPairSync("ed25519");
  const testPublicKey = "test-public-key-id";
  // Export private key in PKCS8 DER, extract the raw 32-byte seed
  const pkcs8Der = testKeyPair.privateKey.export({ type: "pkcs8", format: "der" });
  const testSecretKeyHex = Buffer.from(pkcs8Der).subarray(-32).toString("hex");

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...originalEnv,
      DMARKET_PUBLIC_KEY: testPublicKey,
      DMARKET_SECRET_KEY: testSecretKeyHex,
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("signDMarketRequest", () => {
    it("produces a valid Ed25519 hex signature", async () => {
      const { signDMarketRequest } = await import("../dmarket.js");

      const method = "GET";
      const path = "/exchange/v1/market/items?gameId=a8db&title=AK-47&limit=1";
      const body = "";
      const timestamp = "1700000000";

      const signature = signDMarketRequest(method, path, body, timestamp);

      // Signature should be a hex string (128 chars = 64 bytes)
      expect(signature).toMatch(/^[0-9a-f]{128}$/);

      // Verify the signature is actually valid
      const message = method + path + body + timestamp;
      const isValid = crypto.verify(
        null,
        Buffer.from(message),
        testKeyPair.publicKey,
        Buffer.from(signature, "hex")
      );
      expect(isValid).toBe(true);
    });

    it("produces different signatures for different inputs", async () => {
      const { signDMarketRequest } = await import("../dmarket.js");

      const sig1 = signDMarketRequest("GET", "/path1", "", "1700000000");
      const sig2 = signDMarketRequest("GET", "/path2", "", "1700000000");
      expect(sig1).not.toBe(sig2);
    });
  });

  describe("fetchDMarketItemPrice", () => {
    it("returns price in USD (cents string parsed and divided by 100)", async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({
        data: {
          objects: [
            {
              title: "AK-47 | Redline (Field-Tested)",
              price: { USD: "1234" },
              extra: { exterior: "Field-Tested" },
            },
          ],
          total: { items: 1 },
          cursor: "",
        },
      });

      const { fetchDMarketItemPrice } = await import("../dmarket.js");
      const price = await fetchDMarketItemPrice("AK-47 | Redline (Field-Tested)");
      expect(price).toBe(12.34);
    });

    it("includes correct auth headers", async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({
        data: { objects: [], total: { items: 0 }, cursor: "" },
      });

      const { fetchDMarketItemPrice } = await import("../dmarket.js");
      await fetchDMarketItemPrice("AK-47 | Redline (Field-Tested)");

      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
      const callArgs = (mockedAxios.get as any).mock.calls[0];
      const headers = callArgs[1].headers;

      expect(headers["X-Api-Key"]).toBe(testPublicKey);
      expect(headers["X-Sign-Date"]).toBeDefined();
      expect(headers["X-Request-Sign"]).toMatch(/^dmar ed25519 [0-9a-f]{128}$/);
    });

    it("returns null when API returns no objects", async () => {
      mockedAxios.get = vi.fn().mockResolvedValue({
        data: { objects: [], total: { items: 0 }, cursor: "" },
      });

      const { fetchDMarketItemPrice } = await import("../dmarket.js");
      const price = await fetchDMarketItemPrice("Nonexistent Skin");
      expect(price).toBeNull();
    });

    it("returns null on network error", async () => {
      mockedAxios.get = vi.fn().mockRejectedValue(new Error("Network Error"));

      const { fetchDMarketItemPrice } = await import("../dmarket.js");
      const price = await fetchDMarketItemPrice("AK-47 | Redline (Field-Tested)");
      expect(price).toBeNull();
    });
  });

  describe("fetchDMarketPrices", () => {
    it("returns Map with prices for multiple items", async () => {
      mockedAxios.get = vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            objects: [{ title: "AK-47 | Redline (Field-Tested)", price: { USD: "1234" }, extra: {} }],
            total: { items: 1 },
            cursor: "",
          },
        })
        .mockResolvedValueOnce({
          data: {
            objects: [{ title: "AWP | Asiimov (Field-Tested)", price: { USD: "5678" }, extra: {} }],
            total: { items: 1 },
            cursor: "",
          },
        });

      const { fetchDMarketPrices } = await import("../dmarket.js");
      const prices = await fetchDMarketPrices([
        "AK-47 | Redline (Field-Tested)",
        "AWP | Asiimov (Field-Tested)",
      ]);

      expect(prices).toBeInstanceOf(Map);
      expect(prices.get("AK-47 | Redline (Field-Tested)")).toBe(12.34);
      expect(prices.get("AWP | Asiimov (Field-Tested)")).toBe(56.78);
    });

    it("returns empty Map when env vars are missing", async () => {
      delete process.env.DMARKET_PUBLIC_KEY;
      delete process.env.DMARKET_SECRET_KEY;

      const { fetchDMarketPrices } = await import("../dmarket.js");
      const prices = await fetchDMarketPrices(["AK-47 | Redline (Field-Tested)"]);
      expect(prices.size).toBe(0);
    });

    it("handles partial failures gracefully", async () => {
      mockedAxios.get = vi
        .fn()
        .mockResolvedValueOnce({
          data: {
            objects: [{ title: "AK-47 | Redline (Field-Tested)", price: { USD: "1234" }, extra: {} }],
            total: { items: 1 },
            cursor: "",
          },
        })
        .mockRejectedValueOnce(new Error("Server Error"));

      const { fetchDMarketPrices } = await import("../dmarket.js");
      const prices = await fetchDMarketPrices([
        "AK-47 | Redline (Field-Tested)",
        "AWP | Asiimov (Field-Tested)",
      ]);

      expect(prices.size).toBe(1);
      expect(prices.get("AK-47 | Redline (Field-Tested)")).toBe(12.34);
    });
  });
});
