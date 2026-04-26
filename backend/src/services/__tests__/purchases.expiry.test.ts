/**
 * purchases.expiry.test.ts — HIGH-1: cache invalidation on cron expiry.
 *
 * checkExpiredSubscriptions runs every N minutes and flips is_premium=FALSE
 * for users whose premium_until elapsed. Without this fix, requirePremium's
 * 5-minute in-process cache kept the user on Premium for up to 5 min after
 * expiry. Now invalidatePremiumCache(row.id) is called for each expired
 * user, matching the ASSN handler's behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockQuery = vi.fn();
vi.mock("../../db/pool.js", () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));

const mockInvalidate = vi.fn();
vi.mock("../../middleware/auth.js", () => ({
  invalidatePremiumCache: (...args: unknown[]) => mockInvalidate(...args),
}));

vi.mock("../../utils/cacheRegistry.js", () => ({
  registerCache: vi.fn(),
  getCacheStats: vi.fn().mockReturnValue([]),
}));

vi.mock("../appleStoreApi.js", () => ({
  isAppleApiConfigured: vi.fn().mockReturnValue(false),
  getTransactionInfo: vi.fn(),
}));

import { checkExpiredSubscriptions } from "../purchases.js";

describe("HIGH-1: checkExpiredSubscriptions invalidates premium cache", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockInvalidate.mockReset();
  });

  it("calls invalidatePremiumCache for every expired user returned by RETURNING id", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{ id: 7 }, { id: 11 }, { id: 42 }],
      rowCount: 3,
    });

    await checkExpiredSubscriptions();

    expect(mockInvalidate).toHaveBeenCalledTimes(3);
    expect(mockInvalidate).toHaveBeenCalledWith(7);
    expect(mockInvalidate).toHaveBeenCalledWith(11);
    expect(mockInvalidate).toHaveBeenCalledWith(42);
  });

  it("no-op when no users expired", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await checkExpiredSubscriptions();

    expect(mockInvalidate).not.toHaveBeenCalled();
  });
});
