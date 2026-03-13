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

vi.mock("../../db/pool.js", () => ({
  pool: { query: vi.fn().mockResolvedValue({ rows: [] }) },
  checkPoolHealth: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../crypto.js", () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace("enc:", "")),
}));
vi.mock("qrcode", () => ({ default: { toDataURL: vi.fn().mockResolvedValue("data:...") } }));
vi.mock("steam-session", () => ({
  LoginSession: vi.fn().mockImplementation(() => ({ on: vi.fn(), startWithQR: vi.fn() })),
  EAuthTokenPlatformType: { MobileApp: 0, WebBrowser: 1 },
}));
vi.mock("../currency.js", () => ({ detectWalletCurrency: vi.fn().mockResolvedValue(null) }));
vi.mock("axios", () => ({
  default: { get: vi.fn(), post: vi.fn(), create: vi.fn() },
}));

import { SteamSessionService } from "../steamSession.js";
import { steamRequest } from "../../utils/SteamClient.js";

const mockSteamRequest = vi.mocked(steamRequest);

describe("extractSessionId", () => {
  beforeEach(() => vi.resetAllMocks());

  it("uses steamRequest — not raw axios", async () => {
    mockSteamRequest.mockResolvedValueOnce({
      status: 200,
      data: "",
      headers: { "set-cookie": ["sessionid=abc123; Path=/"] },
    });
    const result = await SteamSessionService.extractSessionId("steamLoginSecureValue");
    expect(mockSteamRequest).toHaveBeenCalledWith(
      expect.objectContaining({ url: "https://steamcommunity.com/" })
    );
    expect(result).toBe("abc123");
  });

  it("returns null when steamRequest throws", async () => {
    mockSteamRequest.mockRejectedValueOnce(new Error("network error"));
    const result = await SteamSessionService.extractSessionId("steamLoginSecureValue");
    expect(result).toBeNull();
  });

  it("returns null when no set-cookie header", async () => {
    mockSteamRequest.mockResolvedValueOnce({ status: 200, data: "", headers: {} });
    const result = await SteamSessionService.extractSessionId("steamLoginSecureValue");
    expect(result).toBeNull();
  });
});

describe("validateSession", () => {
  const mockSession = { sessionId: "sess123", steamLoginSecure: "slValue", accountId: 1 };

  beforeEach(() => vi.resetAllMocks());

  it("uses steamRequest with followRedirects:false", async () => {
    mockSteamRequest.mockResolvedValueOnce({ status: 200, data: "", headers: {} });
    const result = await SteamSessionService.validateSession(mockSession as any);
    expect(mockSteamRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        url: "https://steamcommunity.com/my/",
        followRedirects: false,
      })
    );
    expect(result).toBe(true);
  });

  it("returns false when redirected to /login", async () => {
    mockSteamRequest.mockResolvedValueOnce({
      status: 302,
      data: "",
      headers: { location: "https://steamcommunity.com/login" },
    });
    const result = await SteamSessionService.validateSession(mockSession as any);
    expect(result).toBe(false);
  });

  it("returns false when steamRequest throws", async () => {
    mockSteamRequest.mockRejectedValueOnce(new Error("timeout"));
    const result = await SteamSessionService.validateSession(mockSession as any);
    expect(result).toBe(false);
  });
});
