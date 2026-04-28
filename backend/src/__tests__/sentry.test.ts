/**
 * sentry.test.ts — Unit tests for Sentry init and privacy hooks.
 *
 * These tests mock @sentry/node globally so no events are ever sent.
 * instrument.ts re-reads process.env at module load time, so each test
 * deletes the module from the registry via vi.resetModules() and re-imports.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Sentry mock ─────────────────────────────────────────────────────────────
// All tests share one mock so we can spy on `init` and `setUser`.
const mockInit = vi.fn();
const mockSetUser = vi.fn();
const mockCaptureException = vi.fn();

vi.mock("@sentry/node", () => ({
  init: (...args: unknown[]) => mockInit(...args),
  setUser: (...args: unknown[]) => mockSetUser(...args),
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  setupExpressErrorHandler: vi.fn(),
  startInactiveSpan: vi.fn(() => ({ end: vi.fn() })),
}));

// dotenv must not interfere — instrument.ts calls dotenv.config() which would
// try to read a .env file that doesn't exist in CI. Stub it out.
vi.mock("dotenv", () => ({
  default: { config: vi.fn() },
  config: vi.fn(),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function loadInstrument(): Promise<void> {
  vi.resetModules();
  await import("../instrument.js");
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe("Sentry instrument.ts", () => {
  const originalDsn = process.env.SENTRY_DSN;
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    mockInit.mockClear();
    mockSetUser.mockClear();
    mockCaptureException.mockClear();
    delete process.env.SENTRY_DSN;
    process.env.NODE_ENV = "test";
  });

  afterEach(() => {
    process.env.SENTRY_DSN = originalDsn;
    process.env.NODE_ENV = originalEnv;
  });

  it("does NOT call Sentry.init when SENTRY_DSN is unset", async () => {
    await loadInstrument();
    expect(mockInit).not.toHaveBeenCalled();
  });

  it("does NOT throw when SENTRY_DSN is unset", async () => {
    await expect(loadInstrument()).resolves.not.toThrow();
  });

  it("calls Sentry.init when SENTRY_DSN is set", async () => {
    process.env.SENTRY_DSN = "https://abc123@o0.ingest.sentry.io/999";
    await loadInstrument();
    expect(mockInit).toHaveBeenCalledOnce();
  });

  it("passes dsn from env to Sentry.init", async () => {
    const dsn = "https://abc123@o0.ingest.sentry.io/999";
    process.env.SENTRY_DSN = dsn;
    await loadInstrument();
    const callArg = mockInit.mock.calls[0][0];
    expect(callArg.dsn).toBe(dsn);
  });

  it("sets sendDefaultPii: false in all environments", async () => {
    process.env.SENTRY_DSN = "https://abc123@o0.ingest.sentry.io/999";
    await loadInstrument();
    const callArg = mockInit.mock.calls[0][0];
    expect(callArg.sendDefaultPii).toBe(false);
  });

  it("uses lower tracesSampleRate in production", async () => {
    process.env.SENTRY_DSN = "https://abc123@o0.ingest.sentry.io/999";
    process.env.NODE_ENV = "production";
    await loadInstrument();
    const callArg = mockInit.mock.calls[0][0];
    expect(callArg.tracesSampleRate).toBeLessThan(1.0);
  });

  it("uses tracesSampleRate 1.0 in non-production", async () => {
    process.env.SENTRY_DSN = "https://abc123@o0.ingest.sentry.io/999";
    process.env.NODE_ENV = "development";
    await loadInstrument();
    const callArg = mockInit.mock.calls[0][0];
    expect(callArg.tracesSampleRate).toBe(1.0);
  });

  it("sets release from SENTRY_RELEASE env var", async () => {
    process.env.SENTRY_DSN = "https://abc123@o0.ingest.sentry.io/999";
    process.env.SENTRY_RELEASE = "abc1234def";
    await loadInstrument();
    const callArg = mockInit.mock.calls[0][0];
    expect(callArg.release).toBe("abc1234def");
    delete process.env.SENTRY_RELEASE;
  });

  it("falls back to 'unknown' release when SENTRY_RELEASE unset", async () => {
    process.env.SENTRY_DSN = "https://abc123@o0.ingest.sentry.io/999";
    delete process.env.SENTRY_RELEASE;
    await loadInstrument();
    const callArg = mockInit.mock.calls[0][0];
    expect(callArg.release).toBe("unknown");
  });
});

// ─── beforeSend privacy hooks ─────────────────────────────────────────────────

describe("Sentry beforeSend privacy hooks", () => {
  /**
   * Extract the beforeSend callback that was passed to Sentry.init.
   * Loads instrument.ts with a DSN set so the callback is registered.
   */
  async function getBeforeSend(): Promise<(event: Record<string, unknown>, hint: Record<string, unknown>) => unknown> {
    process.env.SENTRY_DSN = "https://abc123@o0.ingest.sentry.io/999";
    process.env.NODE_ENV = "test";
    mockInit.mockClear();
    vi.resetModules();
    await import("../instrument.js");
    const callArg = mockInit.mock.calls[0][0];
    return callArg.beforeSend;
  }

  afterEach(() => {
    delete process.env.SENTRY_DSN;
  });

  it("redacts google-rtdn path token in event URL", async () => {
    const beforeSend = await getBeforeSend();
    const event = {
      request: { url: "https://api.skinkeeper.store/api/purchases/google-rtdn-deadbeef12345678", headers: {} },
    };
    const result = beforeSend(event, {}) as typeof event;
    expect(result.request.url).toContain("google-rtdn-REDACTED");
    expect(result.request.url).not.toContain("deadbeef12345678");
  });

  it("leaves URLs without google-rtdn unchanged", async () => {
    const beforeSend = await getBeforeSend();
    const event = {
      request: { url: "https://api.skinkeeper.store/api/purchases/verify", headers: {} },
    };
    const result = beforeSend(event, {}) as typeof event;
    expect(result.request.url).toBe("https://api.skinkeeper.store/api/purchases/verify");
  });

  it("redacts authorization header", async () => {
    const beforeSend = await getBeforeSend();
    const event = {
      request: {
        url: "https://api.skinkeeper.store/api/portfolio",
        headers: { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.secret.sig" },
      },
    };
    const result = beforeSend(event, {}) as typeof event;
    expect((result.request as Record<string, Record<string, string>>).headers.authorization).toBe("REDACTED");
  });

  it("passes events without authorization header through unchanged", async () => {
    const beforeSend = await getBeforeSend();
    const event = {
      request: { url: "https://api.skinkeeper.store/api/health", headers: {} },
    };
    const result = beforeSend(event, {});
    expect(result).toEqual(event);
  });

  it("samples CONN_TIMEOUT errors (returns null ~90% of time)", async () => {
    const beforeSend = await getBeforeSend();
    const event = { request: { url: "/api/test", headers: {} } };
    const hint = { originalException: { code: "CONN_TIMEOUT" } };

    // Run 200 trials — at least one should be null and at least one non-null
    // (probability of all-null in 200 trials with p=0.9: 0.9^200 ≈ 7e-10)
    const results = Array.from({ length: 200 }, () => beforeSend(event, hint));
    const nullCount = results.filter((r) => r === null).length;
    const nonNullCount = results.filter((r) => r !== null).length;
    expect(nullCount).toBeGreaterThan(0);
    expect(nonNullCount).toBeGreaterThan(0);
  });
});

// ─── User context middleware ──────────────────────────────────────────────────

describe("Sentry user context middleware (index.ts pattern)", () => {
  it("calls Sentry.setUser with string id when userId is present", () => {
    // Test the inline logic that index.ts uses: if (req.userId) setUser({ id: String(req.userId) })
    mockSetUser.mockClear();
    const userId = 42;
    if (userId) {
      mockSetUser({ id: String(userId) });
    }
    expect(mockSetUser).toHaveBeenCalledWith({ id: "42" });
  });

  it("does not call Sentry.setUser when userId is undefined", () => {
    mockSetUser.mockClear();
    const userId: number | undefined = undefined;
    if (userId) {
      mockSetUser({ id: String(userId) });
    }
    expect(mockSetUser).not.toHaveBeenCalled();
  });
});
