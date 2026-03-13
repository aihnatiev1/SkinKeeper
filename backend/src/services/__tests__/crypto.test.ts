import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("crypto utility", () => {
  const originalEnv = process.env;
  const validKey = "a".repeat(64); // 64 hex chars = 32 bytes

  beforeEach(() => {
    process.env = { ...originalEnv, ENCRYPTION_KEY: validKey };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe("encrypt / decrypt roundtrip", () => {
    it("encrypts and decrypts plaintext correctly", async () => {
      const { encrypt, decrypt } = await import("../crypto.js");
      const plaintext = "super-secret-session-token-12345";
      const ciphertext = encrypt(plaintext);
      expect(decrypt(ciphertext)).toBe(plaintext);
    });

    it("roundtrips empty string", async () => {
      const { encrypt, decrypt } = await import("../crypto.js");
      const ciphertext = encrypt("");
      expect(decrypt(ciphertext)).toBe("");
    });

    it("roundtrips unicode text", async () => {
      const { encrypt, decrypt } = await import("../crypto.js");
      const text = "привіт 🌍 hello";
      expect(decrypt(encrypt(text))).toBe(text);
    });

    it("roundtrips long string", async () => {
      const { encrypt, decrypt } = await import("../crypto.js");
      const long = "x".repeat(10000);
      expect(decrypt(encrypt(long))).toBe(long);
    });
  });

  describe("ciphertext properties", () => {
    it("produces different ciphertext for same plaintext (random IV)", async () => {
      const { encrypt } = await import("../crypto.js");
      const ct1 = encrypt("same plaintext");
      const ct2 = encrypt("same plaintext");
      expect(ct1).not.toBe(ct2);
    });

    it("ciphertext is base64 encoded", async () => {
      const { encrypt } = await import("../crypto.js");
      const ct = encrypt("hello");
      expect(ct).toMatch(/^[A-Za-z0-9+/]+=*$/);
    });

    it("ciphertext is longer than plaintext (IV + tag overhead)", async () => {
      const { encrypt } = await import("../crypto.js");
      const plaintext = "short";
      const ct = Buffer.from(encrypt(plaintext), "base64");
      // IV (12) + tag (16) + ciphertext = at least 28 + plaintext.length
      expect(ct.length).toBeGreaterThanOrEqual(28);
    });
  });

  describe("error handling", () => {
    it("throws when ENCRYPTION_KEY is missing", async () => {
      delete process.env.ENCRYPTION_KEY;
      const { encrypt } = await import("../crypto.js");
      expect(() => encrypt("hello")).toThrow("ENCRYPTION_KEY");
    });

    it("throws when ENCRYPTION_KEY is wrong length", async () => {
      process.env.ENCRYPTION_KEY = "abc"; // too short
      const { encrypt } = await import("../crypto.js");
      expect(() => encrypt("hello")).toThrow("ENCRYPTION_KEY");
    });

    it("throws on tampered ciphertext", async () => {
      const { encrypt, decrypt } = await import("../crypto.js");
      const ct = Buffer.from(encrypt("test"), "base64");
      // Flip a byte in the ciphertext area (after IV+tag=28 bytes)
      ct[30] ^= 0xff;
      expect(() => decrypt(ct.toString("base64"))).toThrow();
    });

    it("throws on truncated ciphertext (too short)", async () => {
      const { decrypt } = await import("../crypto.js");
      // Less than 28 bytes minimum
      const truncated = Buffer.alloc(20).toString("base64");
      expect(() => decrypt(truncated)).toThrow();
    });
  });
});
