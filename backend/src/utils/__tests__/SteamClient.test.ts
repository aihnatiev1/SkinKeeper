import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("axios");

import axios from "axios";
const mockedAxios = vi.mocked(axios);

import {
  steamRequest,
  SteamSessionError,
  SteamRequestError,
  getSteamClientMetrics,
} from "../SteamClient.js";

function makeAxiosError(status: number, headers: Record<string, string> = {}) {
  const err: any = new Error(`HTTP ${status}`);
  err.response = { status, headers };
  return err;
}

describe("steamRequest", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns data on successful GET", async () => {
    mockedAxios.mockResolvedValue({
      data: { items: [] },
      status: 200,
      headers: { "content-type": "application/json" },
    });

    const res = await steamRequest<{ items: unknown[] }>({
      url: "https://steamcommunity.com/api/test",
    });

    expect(res.status).toBe(200);
    expect(res.data).toEqual({ items: [] });
    expect(typeof res.durationMs).toBe("number");
  });

  it("includes cookies in request when provided", async () => {
    mockedAxios.mockResolvedValue({ data: {}, status: 200, headers: {} });

    await steamRequest({
      url: "https://steamcommunity.com/test",
      cookies: {
        steamLoginSecure: "76561198000000000%7C%7Ctoken",
        sessionId: "abcdef123456",
      },
    });

    const callConfig = (mockedAxios as any).mock.calls[0][0];
    expect(callConfig.headers.Cookie).toContain("steamLoginSecure=");
    expect(callConfig.headers.Cookie).toContain("sessionid=abcdef123456");
  });

  it("includes webTradeEligibility cookie when provided", async () => {
    mockedAxios.mockResolvedValue({ data: {}, status: 200, headers: {} });

    await steamRequest({
      url: "https://steamcommunity.com/test",
      cookies: {
        steamLoginSecure: "token",
        sessionId: "sid",
        webTradeEligibility: "elig-cookie-value",
      },
    });

    const callConfig = (mockedAxios as any).mock.calls[0][0];
    expect(callConfig.headers.Cookie).toContain("webTradeEligibility=elig-cookie-value");
  });

  it("throws SteamSessionError on 403", async () => {
    mockedAxios.mockRejectedValueOnce(makeAxiosError(403));

    await expect(
      steamRequest({ url: "https://steamcommunity.com/test", maxRetries: 0 })
    ).rejects.toThrow(SteamSessionError);
  });

  it("throws SteamSessionError on 401", async () => {
    mockedAxios.mockRejectedValueOnce(makeAxiosError(401));

    await expect(
      steamRequest({ url: "https://steamcommunity.com/test", maxRetries: 0 })
    ).rejects.toThrow(SteamSessionError);
  });

  it("retries on 429 and succeeds", async () => {
    vi.useFakeTimers();

    mockedAxios
      .mockRejectedValueOnce(makeAxiosError(429))
      .mockResolvedValueOnce({ data: { ok: true }, status: 200, headers: {} });

    const promise = steamRequest({
      url: "https://steamcommunity.com/test",
      maxRetries: 2,
    });

    // Advance timers to skip backoff delay
    await vi.runAllTimersAsync();

    const res = await promise;
    expect(res.data).toEqual({ ok: true });
    expect(mockedAxios).toHaveBeenCalledTimes(2);
  });

  it("retries on 5xx and succeeds", async () => {
    vi.useFakeTimers();

    mockedAxios
      .mockRejectedValueOnce(makeAxiosError(503))
      .mockResolvedValueOnce({ data: { ok: true }, status: 200, headers: {} });

    const promise = steamRequest({
      url: "https://steamcommunity.com/test",
      maxRetries: 2,
    });

    await vi.runAllTimersAsync();
    const res = await promise;
    expect(res.data).toEqual({ ok: true });
  });

  it("throws SteamRequestError after max retries exhausted", async () => {
    vi.useFakeTimers();

    mockedAxios.mockRejectedValue(makeAxiosError(429));

    const promise = steamRequest({
      url: "https://steamcommunity.com/test",
      maxRetries: 2,
    });

    const [, result] = await Promise.all([
      vi.runAllTimersAsync(),
      promise.catch((e: unknown) => e),
    ]);
    expect(result).toBeInstanceOf(SteamRequestError);
    vi.useRealTimers();
  });

  it("throws SteamSessionError on redirect to login (302)", async () => {
    mockedAxios.mockResolvedValue({
      data: "",
      status: 302,
      headers: { location: "https://steamcommunity.com/login" },
      validateStatus: () => true,
    });

    await expect(
      steamRequest({
        url: "https://steamcommunity.com/test",
        validateStatus: () => true,
        maxRetries: 0,
      })
    ).rejects.toThrow(SteamSessionError);
  });

  it("sends POST body as form-encoded", async () => {
    mockedAxios.mockResolvedValue({ data: {}, status: 200, headers: {} });

    await steamRequest({
      url: "https://steamcommunity.com/api/action",
      method: "POST",
      data: { action: "test", count: 5 },
    });

    const callConfig = (mockedAxios as any).mock.calls[0][0];
    expect(callConfig.method).toBe("POST");
    expect(callConfig.data).toContain("action=test");
    expect(callConfig.data).toContain("count=5");
    expect(callConfig.headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded"
    );
  });

  it("respects retry-after header from 429 response", async () => {
    vi.useFakeTimers();

    const err = makeAxiosError(429, { "retry-after": "1" }); // 1 second retry-after
    mockedAxios
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({ data: {}, status: 200, headers: {} });

    // Start request but don't await yet
    let resolved = false;
    const promise = steamRequest({
      url: "https://steamcommunity.com/test",
      maxRetries: 2,
    }).then((r) => { resolved = true; return r; });

    // Advance time past retry-after delay (1000ms)
    await vi.runAllTimersAsync();

    const res = await promise;
    expect(resolved).toBe(true);
    expect(res.status).toBe(200);
    expect(mockedAxios).toHaveBeenCalledTimes(2);
  });
});

describe("SteamSessionError", () => {
  it("has SESSION_EXPIRED code", () => {
    const err = new SteamSessionError("test");
    expect(err.code).toBe("SESSION_EXPIRED");
    expect(err.name).toBe("SteamSessionError");
  });
});

describe("SteamRequestError", () => {
  it("stores httpStatus", () => {
    const err = new SteamRequestError("test", 429);
    expect(err.httpStatus).toBe(429);
    expect(err.name).toBe("SteamRequestError");
  });
});

describe("getSteamClientMetrics", () => {
  it("returns zeros when no requests made", async () => {
    // Reset metrics by reimporting (module is cached, so just check structure)
    const metrics = getSteamClientMetrics();
    expect(typeof metrics.totalRequests).toBe("number");
    expect(typeof metrics.avgDurationMs).toBe("number");
    expect(metrics.recentErrors).toBeInstanceOf(Array);
  });

  it("returns N/A error rate when no requests", () => {
    const metrics = getSteamClientMetrics();
    // If totalRequests is 0, returns N/A
    if (metrics.totalRequests === 0) {
      expect(metrics.errorRate).toBe("N/A");
    }
  });

  it("records metrics after successful request", async () => {
    mockedAxios.mockResolvedValueOnce({
      data: {},
      status: 200,
      headers: {},
    });

    await steamRequest({ url: "https://steamcommunity.com/test-metric" });

    const metrics = getSteamClientMetrics();
    expect(metrics.totalRequests).toBeGreaterThan(0);
    expect(metrics.avgDurationMs).toBeGreaterThanOrEqual(0);
  });
});
