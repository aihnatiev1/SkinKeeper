import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pool
const mockQuery = vi.fn();
vi.mock("../../db/pool.js", () => ({
  pool: {
    query: (...args: any[]) => mockQuery(...args),
  },
}));

import { getPortfolioPL, getPLHistory } from "../profitLoss.js";

describe("getPortfolioPL", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe("global mode (no accountId)", () => {
    it("returns zeros when user has no transactions", async () => {
      // Query 1: item_cost_basis aggregation
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_invested: 0,
          total_earned: 0,
          realized_profit: 0,
          holding_cost: 0,
          holding_count: 0,
        }],
      });
      // Query 2: current holdings value
      mockQuery.mockResolvedValueOnce({ rows: [{ current_value: 0 }] });

      const pl = await getPortfolioPL(1);

      expect(pl.totalInvestedCents).toBe(0);
      expect(pl.totalEarnedCents).toBe(0);
      expect(pl.realizedProfitCents).toBe(0);
      expect(pl.unrealizedProfitCents).toBe(0);
      expect(pl.totalProfitCents).toBe(0);
      expect(pl.totalProfitPct).toBe(0);
      expect(pl.holdingCount).toBe(0);
      expect(pl.totalCurrentValueCents).toBe(0);
    });

    it("calculates P/L correctly with holdings", async () => {
      // Bought 1 AK-47 for $50, currently worth $60
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_invested: 5000, // $50 in cents
          total_earned: 0,
          realized_profit: 0,
          holding_cost: 5000,
          holding_count: 1,
        }],
      });
      // Current value: $60
      mockQuery.mockResolvedValueOnce({ rows: [{ current_value: 6000 }] });

      const pl = await getPortfolioPL(1);

      expect(pl.totalInvestedCents).toBe(5000);
      expect(pl.totalCurrentValueCents).toBe(6000);
      expect(pl.unrealizedProfitCents).toBe(1000); // 6000 - 5000
      expect(pl.totalProfitCents).toBe(1000);
      expect(pl.totalProfitPct).toBe(20); // 1000/5000 * 100
    });

    it("calculates realized profit after sell", async () => {
      // Bought for $100, sold for $120 → realized = $20
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_invested: 10000,
          total_earned: 12000,
          realized_profit: 2000,
          holding_cost: 0,
          holding_count: 0,
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ current_value: 0 }] });

      const pl = await getPortfolioPL(1);

      expect(pl.realizedProfitCents).toBe(2000);
      expect(pl.totalProfitCents).toBe(2000);
      expect(pl.totalProfitPct).toBe(20); // 2000/10000 * 100
    });

    it("returns zero totalProfitPct when totalInvested is 0 (avoid division by zero)", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_invested: 0,
          total_earned: 0,
          realized_profit: 0,
          holding_cost: 0,
          holding_count: 0,
        }],
      });
      mockQuery.mockResolvedValueOnce({ rows: [{ current_value: 0 }] });

      const pl = await getPortfolioPL(1);
      expect(pl.totalProfitPct).toBe(0);
    });
  });

  describe("per-account mode (with accountId)", () => {
    it("returns P/L for specific account", async () => {
      // Per-account transaction aggregation
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_invested: 3000,
          total_earned: 0,
          realized_profit: 0,
          holding_cost: 3000,
          holding_count: 1,
          holdings: [{ name: "AK-47 | Redline (Field-Tested)", holding: 1 }],
        }],
      });
      // Current prices
      mockQuery.mockResolvedValueOnce({
        rows: [{ market_hash_name: "AK-47 | Redline (Field-Tested)", price_usd: "35.00" }],
      });

      const pl = await getPortfolioPL(1, 2);

      expect(pl.totalInvestedCents).toBe(3000);
      expect(pl.holdingCount).toBe(1);
      expect(pl.totalCurrentValueCents).toBe(3500); // 35.00 * 100 * 1
    });

    it("handles account with no holdings (empty holdings array)", async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_invested: 2000,
          total_earned: 2500,
          realized_profit: 500,
          holding_cost: 0,
          holding_count: 0,
          holdings: null,
        }],
      });

      const pl = await getPortfolioPL(1, 2);

      expect(pl.realizedProfitCents).toBe(500);
      expect(pl.totalCurrentValueCents).toBe(0);
      expect(pl.holdingCount).toBe(0);
    });
  });
});

describe("getPLHistory", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("returns daily snapshots for specified days", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    mockQuery.mockResolvedValueOnce({
      rows: [
        {
          snapshot_date: yesterday,
          total_invested_cents: 10000,
          total_current_value_cents: 12000,
          cumulative_profit_cents: 2000,
          realized_profit_cents: 500,
          unrealized_profit_cents: 1500,
        },
        {
          snapshot_date: today,
          total_invested_cents: 10000,
          total_current_value_cents: 11000,
          cumulative_profit_cents: 1000,
          realized_profit_cents: 500,
          unrealized_profit_cents: 500,
        },
      ],
    });

    const history = await getPLHistory(1, 7);

    expect(history).toHaveLength(2);
    expect(history[0].date).toBe(yesterday);
    expect(history[0].totalInvestedCents).toBe(10000);
    expect(history[0].cumulativeProfitCents).toBe(2000);
    expect(history[1].date).toBe(today);
  });

  it("returns empty array when no history", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const history = await getPLHistory(1, 30);
    expect(history).toEqual([]);
  });

  it("uses default 30 days when no days arg provided", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await getPLHistory(1);

    const callArgs = mockQuery.mock.calls[0];
    expect(callArgs[1]).toContain(30);
  });
});

// ─── Edge Cases ──────────────────────────────────────────────────────

describe("getPortfolioPL edge cases", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("handles sell-only user (0 buys, some sells from external trades)", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_invested: 0,
        total_earned: 5000,
        realized_profit: 5000,
        holding_cost: 0,
        holding_count: 0,
      }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ current_value: 0 }] });

    const pl = await getPortfolioPL(1);

    expect(pl.totalInvestedCents).toBe(0);
    expect(pl.realizedProfitCents).toBe(5000);
    expect(pl.totalProfitPct).toBe(0); // 0 invested → 0% (no division by zero)
  });

  it("handles very large portfolio values without overflow", async () => {
    // $50,000 invested, $75,000 current value
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_invested: 5000000,
        total_earned: 0,
        realized_profit: 0,
        holding_cost: 5000000,
        holding_count: 500,
      }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ current_value: 7500000 }] });

    const pl = await getPortfolioPL(1);

    expect(pl.unrealizedProfitCents).toBe(2500000); // $25,000
    expect(pl.totalProfitPct).toBe(50);
  });

  it("handles negative unrealized profit (price dropped)", async () => {
    // Bought for $100, now worth $60
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_invested: 10000,
        total_earned: 0,
        realized_profit: 0,
        holding_cost: 10000,
        holding_count: 1,
      }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ current_value: 6000 }] });

    const pl = await getPortfolioPL(1);

    expect(pl.unrealizedProfitCents).toBe(-4000);
    expect(pl.totalProfitCents).toBe(-4000);
    expect(pl.totalProfitPct).toBe(-40);
  });

  it("handles null/missing values from DB gracefully", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        total_invested: null,
        total_earned: null,
        realized_profit: null,
        holding_cost: null,
        holding_count: null,
      }],
    });
    mockQuery.mockResolvedValueOnce({ rows: [{ current_value: null }] });

    const pl = await getPortfolioPL(1);

    expect(pl.totalInvestedCents).toBe(0);
    expect(pl.totalCurrentValueCents).toBe(0);
    expect(pl.totalProfitPct).toBe(0);
  });
});
