import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pool
const mockQuery = vi.fn();
const mockConnect = vi.fn();
vi.mock("../../db/pool.js", () => ({
  pool: {
    query: (...args: any[]) => mockQuery(...args),
    connect: (...args: any[]) => mockConnect(...args),
  },
}));

// Mock steamSession
vi.mock("../steamSession.js", () => ({
  SteamSessionService: {
    getActiveAccountId: vi.fn().mockResolvedValue(1),
    ensureValidSession: vi.fn().mockResolvedValue({
      sessionId: "test-session",
      steamLoginSecure: "test-secure",
    }),
  },
}));

// Mock market
vi.mock("../market.js", () => ({
  sellItem: vi.fn().mockResolvedValue({ success: true, requiresConfirmation: false }),
  quickSellPrice: vi.fn().mockResolvedValue({ sellerReceivesCents: 1000, source: "live", currencyId: 1 }),
  checkAssetListed: vi.fn().mockResolvedValue("not_listed"),
}));

// Mock currency
vi.mock("../currency.js", () => ({
  getWalletCurrency: vi.fn().mockResolvedValue(1),
}));

// Mock profitLoss
vi.mock("../profitLoss.js", () => ({
  recalculateCostBasis: vi.fn().mockResolvedValue(undefined),
}));

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { createOperation, getOperation, cancelOperation, getDailyVolume } from "../sellOperations.js";

describe("getOperation", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns null when operation not found", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const op = await getOperation("nonexistent-id", 1);
    expect(op).toBeNull();
  });

  it("returns operation with items", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "op-123",
        user_id: 1,
        status: "completed",
        total_items: 2,
        succeeded: 1,
        failed: 1,
        created_at: "2025-12-01T00:00:00.000Z",
        completed_at: "2025-12-01T00:01:00.000Z",
      }],
    });
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          id: 1,
          operation_id: "op-123",
          asset_id: "111111",
          market_hash_name: "AK-47 | Redline (Field-Tested)",
          price_cents: 1000,
          status: "listed",
          error_message: null,
          requires_confirmation: false,
          updated_at: "2025-12-01T00:01:00.000Z",
        },
        {
          id: 2,
          operation_id: "op-123",
          asset_id: "222222",
          market_hash_name: "AWP | Asiimov (Field-Tested)",
          price_cents: 2000,
          status: "failed",
          error_message: "Session expired",
          requires_confirmation: false,
          updated_at: "2025-12-01T00:00:30.000Z",
        },
      ],
    });

    const op = await getOperation("op-123", 1);

    expect(op).not.toBeNull();
    expect(op!.id).toBe("op-123");
    expect(op!.status).toBe("completed");
    expect(op!.totalItems).toBe(2);
    expect(op!.succeeded).toBe(1);
    expect(op!.failed).toBe(1);
    expect(op!.items).toHaveLength(2);
    expect(op!.items[0].assetId).toBe("111111");
    expect(op!.items[0].status).toBe("listed");
    expect(op!.items[1].status).toBe("failed");
    expect(op!.items[1].errorMessage).toBe("Session expired");
  });

  it("does not return operation belonging to different user", async () => {
    // DB query includes user_id constraint, returns empty
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const op = await getOperation("op-123", 999); // wrong userId
    expect(op).toBeNull();
  });
});

describe("cancelOperation", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns true when operation cancelled successfully", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // update sell_operations
    mockQuery.mockResolvedValueOnce({ rows: [] }); // update queued items

    const result = await cancelOperation("op-123", 1);
    expect(result).toBe(true);
  });

  it("returns false when operation not found or not cancellable", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 0 });

    const result = await cancelOperation("nonexistent", 1);
    expect(result).toBe(false);
  });

  it("cancels queued items when operation cancelled", async () => {
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await cancelOperation("op-123", 1);

    // Verify second query cancels queued items
    const secondCall = mockQuery.mock.calls[1];
    expect(secondCall[0]).toContain("cancelled");
  });
});

describe("getDailyVolume", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns current volume info for user", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 45 }] });

    const info = await getDailyVolume(1);

    expect(info.count).toBe(45);
    expect(info.limit).toBe(100);
    expect(info.warningAt).toBe(80);
    expect(info.remaining).toBe(55); // 100 - 45
  });

  it("returns count=0 and remaining=100 for fresh user", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // no row = no sells today

    const info = await getDailyVolume(1);

    expect(info.count).toBe(0);
    expect(info.remaining).toBe(100);
  });

  it("returns remaining=0 when at limit", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ count: 100 }] });

    const info = await getDailyVolume(1);
    expect(info.remaining).toBe(0);
  });
});

// ─── createOperation ────────────────────────────────────────────────

describe("createOperation", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockConnect.mockReset();
  });

  function setupMockClient(insertedCount: number, totalItems: number) {
    const mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    mockConnect.mockResolvedValue(mockClient);

    // BEGIN
    mockClient.query.mockResolvedValueOnce({});
    // INSERT sell_operations RETURNING id
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: "op-test-123" }] });

    // INSERT sell_operation_items (one per item, ON CONFLICT DO NOTHING)
    for (let i = 0; i < totalItems; i++) {
      mockClient.query.mockResolvedValueOnce({
        rowCount: i < insertedCount ? 1 : 0, // first N succeed, rest conflict
      });
    }

    // UPDATE total_items (only if some skipped)
    if (insertedCount < totalItems) {
      mockClient.query.mockResolvedValueOnce({});
    }

    // COMMIT
    mockClient.query.mockResolvedValueOnce({});

    // Background processOperation queries (sell_operations status update)
    mockQuery.mockResolvedValue({ rows: [] });

    return mockClient;
  }

  it("creates operation and returns operationId with no skipped items", async () => {
    setupMockClient(2, 2);

    const result = await createOperation(1, [
      { assetId: "111", marketHashName: "AK-47", priceCents: 1000 },
      { assetId: "222", marketHashName: "AWP", priceCents: 2000 },
    ]);

    expect(result.operationId).toBe("op-test-123");
    expect(result.skippedAssetIds).toEqual([]);
  });

  it("detects and reports skipped items (already in active sell operation)", async () => {
    setupMockClient(1, 2); // first item inserted, second conflicts

    const result = await createOperation(1, [
      { assetId: "111", marketHashName: "AK-47", priceCents: 1000 },
      { assetId: "222", marketHashName: "AWP", priceCents: 2000 }, // already active
    ]);

    expect(result.operationId).toBe("op-test-123");
    expect(result.skippedAssetIds).toEqual(["222"]);
  });

  it("skips all items when all are already active (marks operation completed immediately)", async () => {
    const mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    mockConnect.mockResolvedValue(mockClient);

    // BEGIN
    mockClient.query.mockResolvedValueOnce({});
    // INSERT sell_operations
    mockClient.query.mockResolvedValueOnce({ rows: [{ id: "op-empty" }] });
    // Both items conflict
    mockClient.query.mockResolvedValueOnce({ rowCount: 0 });
    mockClient.query.mockResolvedValueOnce({ rowCount: 0 });
    // UPDATE total_items = 0
    mockClient.query.mockResolvedValueOnce({});
    // COMMIT
    mockClient.query.mockResolvedValueOnce({});

    // Mark operation completed immediately (pool.query, not client.query)
    mockQuery.mockResolvedValueOnce({});

    const result = await createOperation(1, [
      { assetId: "111", marketHashName: "AK-47", priceCents: 1000 },
      { assetId: "222", marketHashName: "AWP", priceCents: 2000 },
    ]);

    expect(result.skippedAssetIds).toEqual(["111", "222"]);
    // Should mark operation as completed since 0 items to process
    expect(mockQuery.mock.calls[0][0]).toContain("completed");
  });

  it("rolls back on DB error", async () => {
    const mockClient = {
      query: vi.fn(),
      release: vi.fn(),
    };
    mockConnect.mockResolvedValue(mockClient);

    // BEGIN
    mockClient.query.mockResolvedValueOnce({});
    // INSERT fails
    mockClient.query.mockRejectedValueOnce(new Error("DB connection lost"));

    await expect(
      createOperation(1, [{ assetId: "111", marketHashName: "AK-47", priceCents: 1000 }])
    ).rejects.toThrow("DB connection lost");

    // Verify ROLLBACK was called
    const rollbackCall = mockClient.query.mock.calls.find(
      (c: any[]) => typeof c[0] === "string" && c[0] === "ROLLBACK"
    );
    expect(rollbackCall).toBeDefined();
    expect(mockClient.release).toHaveBeenCalled();
  });
});
