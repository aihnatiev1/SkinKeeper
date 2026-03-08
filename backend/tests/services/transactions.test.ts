import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the pool module before importing the function under test
vi.mock("../../src/db/pool.js", () => ({
  pool: {
    query: vi.fn(),
  },
}));

import { getTransactionStats } from "../../src/services/transactions.js";
import { pool } from "../../src/db/pool.js";

const mockQuery = vi.mocked(pool.query);

describe("getTransactionStats", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: return empty results for all queries
    mockQuery.mockResolvedValue({
      rows: [],
      command: "SELECT",
      rowCount: 0,
      oid: 0,
      fields: [],
    } as any);
  });

  it("builds parameterized query with $N placeholders when dateFrom is provided", async () => {
    await getTransactionStats(1, "2024-01-01");

    // All three queries should have been called
    expect(mockQuery).toHaveBeenCalledTimes(3);

    // Check the stats query (first call)
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("$1");
    expect(sql).toContain("$2");
    expect(sql).toContain("$3");
    // Date should NOT be interpolated into the SQL string
    expect(sql).not.toContain("2024-01-01");
    // Params should contain userId and dateFrom
    expect(params).toContain(1);
    expect(params).toContain("2024-01-01");
  });

  it("builds parameterized query when both dateFrom and dateTo are provided", async () => {
    await getTransactionStats(1, "2024-01-01", "2024-12-31");

    expect(mockQuery).toHaveBeenCalledTimes(3);

    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain("$2");
    expect(sql).toContain("$3");
    expect(sql).not.toContain("2024-01-01");
    expect(sql).not.toContain("2024-12-31");
    expect(params).toContain("2024-01-01");
    expect(params).toContain("2024-12-31");
  });

  it("omits date conditions when dateFrom is undefined", async () => {
    await getTransactionStats(1);

    expect(mockQuery).toHaveBeenCalledTimes(3);

    const [sql, params] = mockQuery.mock.calls[0];
    // Should only have $1 for userId, no date placeholders
    expect(sql).not.toContain("$2");
    expect(sql).not.toContain("tx_date");
    expect(params).toEqual([1]);
  });

  it("safely parameterizes SQL injection payload in dateFrom", async () => {
    const malicious = "'; DROP TABLE transactions; --";
    await getTransactionStats(1, malicious);

    expect(mockQuery).toHaveBeenCalledTimes(3);

    const [sql, params] = mockQuery.mock.calls[0];
    // The malicious string must NOT appear in the SQL
    expect(sql).not.toContain("DROP TABLE");
    expect(sql).not.toContain(malicious);
    // It must be in the params array instead
    expect(params).toContain(malicious);
  });
});
