/**
 * admin.security.test.ts — security-audit fixes for /api/admin gating.
 *
 * Covers:
 *   - MED-4: constant-time compare for x-admin-secret header
 *
 * The behaviour we assert is:
 *   1. `safeCompareSecret` rejects wrong-length, wrong-content, missing,
 *      and non-string inputs.
 *   2. The endpoint still returns 200 for the correct secret and 403 for
 *      anything else (no behaviour change at the API boundary — only the
 *      compare primitive changed).
 *
 * We deliberately don't try to measure timing in CI (flaky and platform-
 * dependent). Functional equivalence + reading the implementation is the
 * audit signal here; the wall-clock guarantee is provided by Node's
 * crypto.timingSafeEqual.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─── Mocks (mirror admin.test.ts) ──────────────────────────────────────

const mockQuery = vi.fn();
vi.mock("../../db/pool.js", () => ({
  pool: { query: (...args: any[]) => mockQuery(...args) },
  checkPoolHealth: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/priceJob.js", () => ({
  startPriceJobs: vi.fn(),
  stopAllJobs: vi.fn(),
  getJobHealth: vi.fn().mockReturnValue({}),
}));

vi.mock("../../services/priceStats.js", () => ({
  getAllStats: vi.fn().mockReturnValue({ sources: [] }),
  recordFetchStart: vi.fn(() => vi.fn()),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
  record429: vi.fn(),
  updateCrawlerState: vi.fn(),
}));

vi.mock("../../utils/cacheRegistry.js", () => ({
  registerCache: vi.fn(),
  getCacheStats: vi.fn().mockReturnValue([]),
}));

vi.mock("../../services/firebase.js", () => ({
  initFirebase: vi.fn(),
  isFirebaseReady: vi.fn().mockReturnValue(false),
  sendPush: vi.fn().mockResolvedValue({ successCount: 0, failedTokens: [] }),
}));

vi.mock("../../services/steamSession.js", () => ({
  SteamSessionService: {
    getActiveAccountId: vi.fn().mockResolvedValue(1),
    ensureValidSession: vi.fn().mockResolvedValue(null),
  },
}));

vi.mock("../../services/steam.js", () => ({
  fetchSteamInventory: vi.fn().mockResolvedValue([]),
}));

import { createTestApp } from "../../__tests__/app.js";
import { safeCompareSecret } from "../admin.js";

const app = createTestApp();
const ADMIN_SECRET = "test-admin-secret"; // matches setup.ts

// ─── Unit: safeCompareSecret ───────────────────────────────────────────

describe("safeCompareSecret (MED-4)", () => {
  it("returns true for an exact match", () => {
    expect(safeCompareSecret("test-admin-secret", "test-admin-secret")).toBe(
      true
    );
  });

  it("returns false for the same length but different content", () => {
    // Same length (17) so the length-prefix shortcut doesn't bypass the
    // timingSafeEqual call. Diff is in the last char.
    expect(safeCompareSecret("test-admin-secrey", "test-admin-secret")).toBe(
      false
    );
  });

  it("returns false for a shorter wrong secret (length mismatch path)", () => {
    expect(safeCompareSecret("short", "test-admin-secret")).toBe(false);
  });

  it("returns false for a longer wrong secret (length mismatch path)", () => {
    expect(
      safeCompareSecret("test-admin-secret-extra", "test-admin-secret")
    ).toBe(false);
  });

  it("returns false for undefined / missing input", () => {
    expect(safeCompareSecret(undefined, "test-admin-secret")).toBe(false);
  });

  it("returns false for non-string input (express headers may be string[])", () => {
    expect(
      safeCompareSecret(["test-admin-secret"], "test-admin-secret")
    ).toBe(false);
  });

  it("returns false for empty string vs non-empty secret", () => {
    expect(safeCompareSecret("", "test-admin-secret")).toBe(false);
  });

  it("returns true for empty-string-vs-empty-string (degenerate but well-defined)", () => {
    expect(safeCompareSecret("", "")).toBe(true);
  });
});

// ─── Integration: requireAdminSecret middleware behaviour ──────────────
//
// We hit a real admin endpoint to make sure the constant-time compare path
// preserves the same 200 / 403 / 503 outcomes the previous strict-equal
// implementation produced. No timing-side-channel assertions — those would
// be flaky in CI.

describe("requireAdminSecret middleware (MED-4 integration)", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns 200 for the correct admin secret (unchanged behaviour)", async () => {
    const res = await request(app)
      .get("/api/admin/price-stats")
      .set("x-admin-secret", ADMIN_SECRET);
    expect(res.status).toBe(200);
  });

  it("returns 403 for a wrong-content same-length secret", async () => {
    // Length matches `test-admin-secret` (17 chars) so the request exercises
    // the timingSafeEqual codepath, not the early length-mismatch return.
    const res = await request(app)
      .get("/api/admin/price-stats")
      .set("x-admin-secret", "test-admin-secrey");
    expect(res.status).toBe(403);
  });

  it("returns 403 for a length-mismatched wrong secret", async () => {
    const res = await request(app)
      .get("/api/admin/price-stats")
      .set("x-admin-secret", "wrong");
    expect(res.status).toBe(403);
  });

  it("returns 403 when the header is missing", async () => {
    const res = await request(app).get("/api/admin/price-stats");
    expect(res.status).toBe(403);
  });
});
