import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock pool
const mockQuery = vi.fn();
vi.mock("../../src/db/pool.js", () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
}));

// Mock crypto module
vi.mock("../../src/services/crypto.js", () => ({
  encrypt: (val: string) => `encrypted_${val}`,
  decrypt: (val: string) => {
    if (!val.startsWith("encrypted_")) {
      throw new Error("Cannot decrypt plaintext value");
    }
    return val.replace("encrypted_", "");
  },
}));

// Mock axios
const mockAxiosGet = vi.fn();
vi.mock("axios", () => ({
  default: { get: (...args: any[]) => mockAxiosGet(...args) },
}));

import { SteamSessionService } from "../../src/services/steamSession.js";

describe("SteamSessionService", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = "a".repeat(64);
    mockQuery.mockReset();
    mockAxiosGet.mockReset();
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
  });

  // Test 1 (SESS-02): getSession decrypts credentials
  it("getSession queries by userId and decrypts credentials", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          steam_session_id: "encrypted_session123",
          steam_login_secure: "encrypted_login456",
          steam_access_token: "encrypted_token789",
        },
      ],
    });

    const session = await SteamSessionService.getSession(42);

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("FROM users WHERE id = $1"),
      [42]
    );
    expect(session).toEqual({
      sessionId: "session123",
      steamLoginSecure: "login456",
      accessToken: "token789",
    });
  });

  // Test 2 (SESS-02): getSession returns null when no session
  it("getSession returns null when user has no session cookies", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          steam_session_id: null,
          steam_login_secure: null,
          steam_access_token: null,
        },
      ],
    });

    const session = await SteamSessionService.getSession(42);
    expect(session).toBeNull();
  });

  // Test 3 (SEC-02): saveSession encrypts all fields
  it("saveSession encrypts all credential fields before writing", async () => {
    mockQuery.mockResolvedValue({ rows: [] });

    await SteamSessionService.saveSession(42, {
      sessionId: "sid",
      steamLoginSecure: "sls",
      accessToken: "tok",
    });

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE users"),
      ["encrypted_sid", "encrypted_sls", "encrypted_tok", 42]
    );
  });

  // Test 4 (SEC-02 dual-read): plaintext fallback
  it("getSession handles plaintext values gracefully (dual-read fallback)", async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          steam_session_id: "plaintext_session",
          steam_login_secure: "plaintext_login",
          steam_access_token: null,
        },
      ],
    });

    const session = await SteamSessionService.getSession(42);
    // plaintext values don't start with "encrypted_" so decrypt throws,
    // fallback returns them as-is
    expect(session).toEqual({
      sessionId: "plaintext_session",
      steamLoginSecure: "plaintext_login",
      accessToken: undefined,
    });
  });

  // Test 5 (SEC-03): extractSessionId makes GET request and extracts sessionid
  it("extractSessionId extracts sessionid from Set-Cookie header", async () => {
    mockAxiosGet.mockResolvedValue({
      headers: {
        "set-cookie": [
          "sessionid=abc123def; Path=/; Secure",
          "steamCountry=US%7C...; Path=/",
        ],
      },
    });

    const sid = await SteamSessionService.extractSessionId("my_login_secure");

    expect(mockAxiosGet).toHaveBeenCalledWith(
      "https://steamcommunity.com/",
      expect.objectContaining({
        headers: expect.objectContaining({
          Cookie: "steamLoginSecure=my_login_secure",
        }),
      })
    );
    expect(sid).toBe("abc123def");
  });

  // Test 6 (SEC-03): extractSessionId returns null when no sessionid cookie
  it("extractSessionId returns null when no sessionid in response", async () => {
    mockAxiosGet.mockResolvedValue({
      headers: {
        "set-cookie": ["steamCountry=US%7C...; Path=/"],
      },
    });

    const sid = await SteamSessionService.extractSessionId("my_login_secure");
    expect(sid).toBeNull();
  });

  // Test 7 (SESS-01): validateSession returns true on 200 without redirect
  it("validateSession returns true when Steam returns 200 without login redirect", async () => {
    mockAxiosGet.mockResolvedValue({
      status: 200,
      headers: {},
    });

    const valid = await SteamSessionService.validateSession({
      sessionId: "sid",
      steamLoginSecure: "sls",
    });
    expect(valid).toBe(true);
  });

  // Test 8 (SESS-01): validateSession returns false on login redirect
  it("validateSession returns false when Steam redirects to login", async () => {
    mockAxiosGet.mockResolvedValue({
      status: 302,
      headers: { location: "https://steamcommunity.com/login/home/" },
    });

    const valid = await SteamSessionService.validateSession({
      sessionId: "sid",
      steamLoginSecure: "sls",
    });
    expect(valid).toBe(false);
  });

  // Test 9 (SESS-01): validateSession returns false on network error
  it("validateSession returns false on network error", async () => {
    mockAxiosGet.mockRejectedValue(new Error("Network timeout"));

    const valid = await SteamSessionService.validateSession({
      sessionId: "sid",
      steamLoginSecure: "sls",
    });
    expect(valid).toBe(false);
  });
});
