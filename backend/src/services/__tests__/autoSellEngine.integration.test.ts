/**
 * autoSellEngine.integration.test.ts
 *
 * Integration-style tests that exercise multi-step flows: cron → fire →
 * pending_window → cancel via API → drainOnStartup, plus advisory-lock
 * concurrency. Pool is still mocked (consistent with existing tests in
 * src/services/__tests__/) — DevOps-1 backlog tracks moving to a real
 * ephemeral test DB.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const mockQuery = vi.fn();
vi.mock("../../db/pool.js", () => ({
  pool: { query: (...args: unknown[]) => mockQuery(...args) },
}));

const mockSendPush = vi.fn();
const mockIsFirebaseReady = vi.fn();
vi.mock("../firebase.js", () => ({
  sendPush: (...args: unknown[]) => mockSendPush(...args),
  isFirebaseReady: () => mockIsFirebaseReady(),
}));

const mockCreateOperation = vi.fn();
vi.mock("../sellOperations.js", () => ({
  createOperation: (...args: unknown[]) => mockCreateOperation(...args),
}));

vi.mock("../../utils/logger.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  evaluateRules,
  executeListing,
  drainOnStartup,
} from "../autoSellEngine.js";

const ruleAutoList = {
  id: 1,
  user_id: 42,
  account_id: 7,
  market_hash_name: "AK-47 | Redline (Field-Tested)",
  trigger_type: "above" as const,
  trigger_price_usd: 10,
  sell_price_usd: 9.5,
  sell_strategy: "fixed" as const,
  mode: "auto_list" as const,
  enabled: true,
  cooldown_minutes: 360,
  last_fired_at: null,
  times_fired: 0,
};

const ruleNotifyOnly = { ...ruleAutoList, mode: "notify_only" as const };

beforeEach(() => {
  mockQuery.mockReset();
  mockSendPush.mockReset();
  mockIsFirebaseReady.mockReset();
  mockCreateOperation.mockReset();
  mockIsFirebaseReady.mockReturnValue(false);
});

describe("notify_only happy path", () => {
  it("seeded rule + crossed price → execution row 'notified'", async () => {
    const responses = [
      { rows: [{ locked: true }], rowCount: 1 }, // advisory lock
      { rows: [ruleNotifyOnly], rowCount: 1 }, // SELECT rules
      { rows: [{ price_usd: 12 }] }, // current_prices (>= 10 trigger)
      { rows: [{ id: 999 }] }, // INSERT execution → notified
      { rows: [], rowCount: 1 }, // bumpRuleFiredCounters
      { rows: [] }, // drain SELECT
      { rows: [], rowCount: 1 }, // unlock
    ];
    let i = 0;
    mockQuery.mockImplementation(() =>
      Promise.resolve(responses[i++] ?? { rows: [], rowCount: 0 })
    );

    await evaluateRules();

    const insertCall = mockQuery.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("INSERT INTO auto_sell_executions")
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    expect(params[5]).toBe("notified");
    expect(params[6]).toBe("0"); // no cancel window for notify_only

    expect(mockCreateOperation).not.toHaveBeenCalled();
  });
});

describe("auto_list happy path", () => {
  it("crosses trigger → pending_window row, then executeListing hands off", async () => {
    // Step 1: cron eval inserts pending_window.
    const evalResponses = [
      { rows: [{ locked: true }], rowCount: 1 },
      { rows: [ruleAutoList], rowCount: 1 },
      { rows: [{ price_usd: 10 }] },
      { rows: [{ id: 555 }] }, // pending_window inserted
      { rows: [], rowCount: 1 }, // bumpRuleFiredCounters
      { rows: [] }, // drain SELECT
      { rows: [], rowCount: 1 }, // unlock
    ];
    let i = 0;
    mockQuery.mockImplementation(() =>
      Promise.resolve(evalResponses[i++] ?? { rows: [], rowCount: 0 })
    );

    await evaluateRules();

    // The setTimeout(60s).unref() inside fireRule has scheduled the listing
    // for later, but we don't fast-forward fake timers — instead we drive
    // executeListing directly to validate the handoff. (The real-clock
    // behaviour is covered by drainOnStartup tests below.)

    mockQuery.mockReset();
    const execResponses = [
      // UPDATE pending_window → listed (atomic claim)
      {
        rows: [
          {
            rule_id: 1,
            market_hash_name: "AK-47 | Redline (Field-Tested)",
            intended_list_price_usd: 9.5,
            actual_price_usd: 10,
          },
        ],
        rowCount: 1,
      },
      // SELECT rule
      {
        rows: [
          {
            id: 1,
            user_id: 42,
            account_id: 7,
            market_hash_name: "AK-47 | Redline (Field-Tested)",
            mode: "auto_list",
          },
        ],
      },
      // HIGH-2 mid-window recheck: price unchanged → no drift abort.
      { rows: [{ price_usd: 9.5 }] },
      // SELECT inventory asset
      {
        rows: [
          {
            asset_id: "abc123",
            market_hash_name: "AK-47 | Redline (Field-Tested)",
          },
        ],
      },
      // UPDATE sell_operation_id
      { rows: [], rowCount: 1 },
    ];
    let j = 0;
    mockQuery.mockImplementation(() =>
      Promise.resolve(execResponses[j++] ?? { rows: [], rowCount: 0 })
    );
    mockCreateOperation.mockResolvedValueOnce({ operationId: "op-uuid", skippedAssetIds: [] });

    await executeListing(555);

    expect(mockCreateOperation).toHaveBeenCalledTimes(1);
    expect(mockCreateOperation).toHaveBeenCalledWith(
      42,
      [
        expect.objectContaining({
          assetId: "abc123",
          priceCents: 950,
          accountId: 7,
        }),
      ],
      7
    );
  });
});

describe("cancel during window", () => {
  it("if pending_window → cancelled, executeListing is a no-op", async () => {
    // Simulate the atomic UPDATE pending_window → listed returning 0 rows
    // (because the user already cancelled, flipping it to 'cancelled').
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await executeListing(555);

    expect(mockCreateOperation).not.toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });
});

describe("restart safety: drainOnStartup", () => {
  it("processes pending_window rows whose window already expired", async () => {
    const claimRow = {
      rows: [
        {
          rule_id: 1,
          market_hash_name: "AK-47 | Redline (Field-Tested)",
          intended_list_price_usd: 9.5,
          actual_price_usd: 10,
        },
      ],
      rowCount: 1,
    };
    const ruleRow = {
      rows: [
        {
          id: 1,
          user_id: 42,
          account_id: 7,
          market_hash_name: "AK-47 | Redline (Field-Tested)",
          mode: "auto_list",
        },
      ],
      rowCount: 1,
    };
    const assetRow = {
      rows: [
        { asset_id: "asset-x", market_hash_name: "AK-47 | Redline (Field-Tested)" },
      ],
      rowCount: 1,
    };
    const updateOk = { rows: [], rowCount: 1 };

    // HIGH-2: each executeListing now also runs a mid-window price recheck
    // between the rule lookup and the asset lookup. Inject a no-drift price
    // (matches intended_list_price_usd=9.5) for both passes.
    const recheckRow = { rows: [{ price_usd: 9.5 }], rowCount: 1 };

    // SELECT expired pending_window rows → 2 ids
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 700 }, { id: 701 }] })
      // executeListing(700)
      .mockResolvedValueOnce(claimRow)
      .mockResolvedValueOnce(ruleRow)
      .mockResolvedValueOnce(recheckRow)
      .mockResolvedValueOnce(assetRow)
      .mockResolvedValueOnce(updateOk)
      // executeListing(701)
      .mockResolvedValueOnce(claimRow)
      .mockResolvedValueOnce(ruleRow)
      .mockResolvedValueOnce(recheckRow)
      .mockResolvedValueOnce(assetRow)
      .mockResolvedValueOnce(updateOk);

    mockCreateOperation.mockResolvedValue({ operationId: "op-uuid", skippedAssetIds: [] });

    await drainOnStartup();

    expect(mockCreateOperation).toHaveBeenCalledTimes(2);
  });

  it("no-op when there are no expired pending_window rows", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await drainOnStartup();

    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockCreateOperation).not.toHaveBeenCalled();
  });
});

describe("advisory lock concurrency", () => {
  it("two parallel evaluateRules: only one acquires lock, the other returns early", async () => {
    let lockHeld = false;

    mockQuery.mockImplementation(async (sql: string) => {
      if (typeof sql === "string" && sql.includes("pg_try_advisory_lock")) {
        if (lockHeld) return { rows: [{ locked: false }], rowCount: 1 };
        lockHeld = true;
        return { rows: [{ locked: true }], rowCount: 1 };
      }
      if (typeof sql === "string" && sql.includes("pg_advisory_unlock")) {
        lockHeld = false;
        return { rows: [], rowCount: 1 };
      }
      // The "winner" eval needs SELECT rules to resolve. Return empty so
      // the loop exits quickly without further DB chatter.
      if (typeof sql === "string" && sql.includes("FROM auto_sell_rules")) {
        return { rows: [] };
      }
      // drainExpiredCancelWindows
      if (typeof sql === "string" && sql.includes("auto_sell_executions")) {
        return { rows: [] };
      }
      return { rows: [], rowCount: 0 };
    });

    await Promise.all([evaluateRules(), evaluateRules()]);

    // Both calls executed the lock probe (2 attempts). Only one unlock
    // happened because only one acquired the lock.
    const lockAttempts = mockQuery.mock.calls.filter(
      (c) => typeof c[0] === "string" && (c[0] as string).includes("pg_try_advisory_lock")
    );
    const unlocks = mockQuery.mock.calls.filter(
      (c) => typeof c[0] === "string" && (c[0] as string).includes("pg_advisory_unlock")
    );
    expect(lockAttempts.length).toBe(2);
    expect(unlocks.length).toBe(1);
  });
});
