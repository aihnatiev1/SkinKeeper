/**
 * Regression tests for the "zombie session refresh loop" bug:
 *
 *   - account 261's refresh-token was permanently revoked by Steam (eresult 15
 *     = AccessDenied). The cron sweep tried to refresh every 30 minutes,
 *     fail-stack-traced, and tried again on the next sweep — forever.
 *     1000+ stack traces per day in the err log, hitting Steam for nothing.
 *
 *   - Fix: classify the error and clear `steam_refresh_token` when the
 *     failure is permanent. The candidate query in sessionRefreshJob filters
 *     `steam_refresh_token IS NOT NULL`, so a null-out automatically removes
 *     the account from future sweeps.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../utils/SteamClient.js", () => ({
  steamRequest: vi.fn(),
  SteamSessionError: class SteamSessionError extends Error {
    readonly code = "SESSION_EXPIRED";
    constructor(message: string) { super(message); this.name = "SteamSessionError"; }
  },
  SteamRequestError: class SteamRequestError extends Error {
    constructor(message: string, public httpStatus: number) { super(message); }
  },
  getSteamClientMetrics: vi.fn().mockReturnValue({}),
}));

const { mockPoolQuery, getWebCookiesMock } = vi.hoisted(() => ({
  mockPoolQuery: vi.fn(),
  getWebCookiesMock: vi.fn(),
}));

vi.mock("../../db/pool.js", () => ({
  pool: { query: mockPoolQuery },
  checkPoolHealth: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../crypto.js", () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace("enc:", "")),
}));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:...") } }));

vi.mock("steam-session", () => {
  // `new LoginSession()` is invoked inside refreshSession; vi.fn() doesn't
  // play well as a constructor target across hoisting boundaries here, so
  // we expose a real class. Each instance shares the hoisted
  // `getWebCookiesMock` so tests can queue per-call behaviors.
  class LoginSession {
    on = () => {};
    startWithQR = () => {};
    getWebCookies = getWebCookiesMock;
    refreshToken: string | null = null;
  }
  return {
    LoginSession,
    EAuthTokenPlatformType: { MobileApp: 0, WebBrowser: 1 },
  };
});
vi.mock("../currency.js", () => ({ detectWalletCurrency: vi.fn().mockResolvedValue(null) }));
vi.mock("../tradeOffers.js", () => ({ fetchTradeToken: vi.fn().mockResolvedValue(null) }));
vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn(), create: vi.fn() } }));

import { SteamSessionService } from "../steamSession.js";

const ACCOUNT_ID = 261;
const FAKE_REFRESH_TOKEN = "enc:eyJhbGciOiJIUzI1NiJ9.dummytoken";

function mockSelectRefreshToken() {
  // First query in refreshSession: SELECT steam_refresh_token
  mockPoolQuery.mockResolvedValueOnce({
    rows: [{ steam_refresh_token: FAKE_REFRESH_TOKEN }],
  });
}

describe("SteamSessionService.refreshSession (zombie-loop fix)", () => {
  beforeEach(() => {
    mockPoolQuery.mockReset();
    getWebCookiesMock.mockReset();
  });

  it("nulls steam_refresh_token when Steam returns AccessDenied (eresult 15)", async () => {
    mockSelectRefreshToken();

    // Simulate the production failure for account 261.
    const accessDenied = Object.assign(new Error("AccessDenied"), { eresult: 15 });
    getWebCookiesMock.mockRejectedValueOnce(accessDenied);

    const result = await SteamSessionService.refreshSession(ACCOUNT_ID);

    expect(result.refreshed).toBe(false);
    expect(result.reason).toBe("refresh_token_revoked");

    // Must have been a NULL-out UPDATE so the next sweep skips this account.
    const updateCalls = mockPoolQuery.mock.calls.filter((c) =>
      typeof c[0] === "string" && c[0].includes("UPDATE steam_accounts")
    );
    expect(updateCalls.length).toBe(1);
    const [sql, params] = updateCalls[0];
    expect(sql).toMatch(/steam_refresh_token\s*=\s*NULL/);
    expect(sql).toMatch(/session_method\s*=\s*'invalid'/);
    expect(params).toEqual([ACCOUNT_ID]);
  });

  it("nulls steam_refresh_token on InvalidPassword (eresult 5)", async () => {
    mockSelectRefreshToken();
    const invalidPwd = Object.assign(new Error("InvalidPassword"), { eresult: 5 });
    getWebCookiesMock.mockRejectedValueOnce(invalidPwd);

    const result = await SteamSessionService.refreshSession(ACCOUNT_ID);
    expect(result.reason).toBe("refresh_token_revoked");
    expect(mockPoolQuery.mock.calls.some((c) =>
      typeof c[0] === "string" && c[0].includes("steam_refresh_token = NULL")
    )).toBe(true);
  });

  it("nulls steam_refresh_token on AccountLocked (eresult 65)", async () => {
    mockSelectRefreshToken();
    const locked = Object.assign(new Error("AccountLocked"), { eresult: 65 });
    getWebCookiesMock.mockRejectedValueOnce(locked);

    const result = await SteamSessionService.refreshSession(ACCOUNT_ID);
    expect(result.reason).toBe("refresh_token_revoked");
  });

  it("nulls steam_refresh_token on Malformed login response", async () => {
    mockSelectRefreshToken();
    getWebCookiesMock.mockRejectedValueOnce(new Error("Malformed login response"));

    const result = await SteamSessionService.refreshSession(ACCOUNT_ID);
    expect(result.reason).toBe("refresh_token_revoked");
    expect(mockPoolQuery.mock.calls.some((c) =>
      typeof c[0] === "string" && c[0].includes("steam_refresh_token = NULL")
    )).toBe(true);
  });

  it("does NOT null token on transient errors (timeouts, 5xx)", async () => {
    mockSelectRefreshToken();

    // Timeouts and 5xx are transient — Steam might be flaky for a minute,
    // wiping the token would force the user to re-auth for nothing.
    const timeout = Object.assign(new Error("ETIMEDOUT"), { code: "ETIMEDOUT" });
    getWebCookiesMock.mockRejectedValueOnce(timeout);

    const result = await SteamSessionService.refreshSession(ACCOUNT_ID);

    expect(result.refreshed).toBe(false);
    expect(result.reason).toBe("refresh_failed");

    // No UPDATE — token survives so the next sweep can retry.
    const updateCalls = mockPoolQuery.mock.calls.filter((c) =>
      typeof c[0] === "string" && c[0].includes("UPDATE steam_accounts")
    );
    expect(updateCalls.length).toBe(0);
  });

  it("returns no_refresh_token when account has no token (no DB writes)", async () => {
    mockPoolQuery.mockResolvedValueOnce({ rows: [{ steam_refresh_token: null }] });

    const result = await SteamSessionService.refreshSession(ACCOUNT_ID);
    expect(result.refreshed).toBe(false);
    expect(result.reason).toBe("no_refresh_token");
    // Must not have called Steam at all.
    expect(getWebCookiesMock).not.toHaveBeenCalled();
    // Must not have UPDATEd anything.
    expect(mockPoolQuery.mock.calls.length).toBe(1);
  });
});
