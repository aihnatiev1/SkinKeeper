import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("crypto module", () => {
  const TEST_KEY = "a".repeat(64); // 64 hex chars = 32 bytes

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  it("encrypt then decrypt roundtrip returns original string", async () => {
    const { encrypt, decrypt } = await import("../../src/services/crypto.js");
    const plaintext = "hello world";
    const encrypted = encrypt(plaintext);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("encrypt produces base64 output", async () => {
    const { encrypt } = await import("../../src/services/crypto.js");
    const encrypted = encrypt("test data");
    // base64 regex: only base64 chars, +, /, = padding
    expect(encrypted).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("encrypt with same input produces different ciphertext (unique IV)", async () => {
    const { encrypt } = await import("../../src/services/crypto.js");
    const input = "same input";
    const a = encrypt(input);
    const b = encrypt(input);
    expect(a).not.toBe(b);
  });

  it("decrypt throws on tampered ciphertext", async () => {
    const { encrypt, decrypt } = await import("../../src/services/crypto.js");
    const encrypted = encrypt("sensitive data");
    // Decode, flip a byte in the middle, re-encode
    const buf = Buffer.from(encrypted, "base64");
    const mid = Math.floor(buf.length / 2);
    buf[mid] = buf[mid]! ^ 0xff;
    const tampered = buf.toString("base64");
    expect(() => decrypt(tampered)).toThrow();
  });

  it("decrypt throws on truncated input (too short for iv + tag)", async () => {
    const { decrypt } = await import("../../src/services/crypto.js");
    const tooShort = Buffer.alloc(10).toString("base64");
    expect(() => decrypt(tooShort)).toThrow();
  });

  it("encrypt/decrypt handles empty string", async () => {
    const { encrypt, decrypt } = await import("../../src/services/crypto.js");
    const encrypted = encrypt("");
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe("");
  });

  it("encrypt/decrypt handles unicode (Cyrillic characters)", async () => {
    const { encrypt, decrypt } = await import("../../src/services/crypto.js");
    const cyrillic = "\u0410\u0432\u0442\u043e\u043c\u0430\u0442 \u041a\u0430\u043b\u0430\u0448\u043d\u0438\u043a\u043e\u0432\u0430";
    const encrypted = encrypt(cyrillic);
    const decrypted = decrypt(encrypted);
    expect(decrypted).toBe(cyrillic);
  });

  it("getKey throws if ENCRYPTION_KEY env var is not set", async () => {
    delete process.env.ENCRYPTION_KEY;
    const { getKey } = await import("../../src/services/crypto.js");
    expect(() => getKey()).toThrow(/ENCRYPTION_KEY/);
  });

  it("getKey throws if ENCRYPTION_KEY is not 64 hex chars", async () => {
    process.env.ENCRYPTION_KEY = "tooshort";
    const { getKey } = await import("../../src/services/crypto.js");
    expect(() => getKey()).toThrow();
  });
});
