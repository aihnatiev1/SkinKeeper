import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────
// All DB / push / sellOps calls go through these so we can assert exact
// argument shape without spinning up a real Postgres or Firebase.

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

// Logger is a tiny shim — quiet in tests.
vi.mock("../../utils/logger.js", () => ({
  log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import {
  shouldFire,
  computeIntendedListPrice,
  evaluateRules,
  executeListing,
} from "../autoSellEngine.js";

// ─── Pure-function tests ─────────────────────────────────────────────────

describe("shouldFire", () => {
  it("fires 'above' at boundary (price == trigger)", () => {
    expect(
      shouldFire({ trigger_type: "above", trigger_price_usd: 10 }, 10)
    ).toBe(true);
  });

  it("fires 'above' when price > trigger", () => {
    expect(
      shouldFire({ trigger_type: "above", trigger_price_usd: 10 }, 12)
    ).toBe(true);
  });

  it("does not fire 'above' when price < trigger", () => {
    expect(
      shouldFire({ trigger_type: "above", trigger_price_usd: 10 }, 9)
    ).toBe(false);
  });

  it("fires 'below' at boundary (price == trigger)", () => {
    expect(
      shouldFire({ trigger_type: "below", trigger_price_usd: 10 }, 10)
    ).toBe(true);
  });

  it("fires 'below' when price < trigger", () => {
    expect(
      shouldFire({ trigger_type: "below", trigger_price_usd: 10 }, 5)
    ).toBe(true);
  });

  it("does not fire 'below' when price > trigger", () => {
    expect(
      shouldFire({ trigger_type: "below", trigger_price_usd: 10 }, 15)
    ).toBe(false);
  });

  it("returns false on unknown trigger_type (defensive default)", () => {
    expect(
      shouldFire(
        // Cast through unknown so the test exercises the default branch
        { trigger_type: "sideways" as unknown as "above", trigger_price_usd: 10 },
        100
      )
    ).toBe(false);
  });
});

describe("computeIntendedListPrice", () => {
  it("returns sell_price_usd literal for 'fixed' strategy", () => {
    expect(
      computeIntendedListPrice(
        { sell_strategy: "fixed", sell_price_usd: 12.5 },
        100
      )
    ).toBe(12.5);
  });

  it("returns null for 'fixed' when sell_price_usd is missing", () => {
    expect(
      computeIntendedListPrice(
        { sell_strategy: "fixed", sell_price_usd: null },
        100
      )
    ).toBeNull();
  });

  it("returns currentPrice * 0.99 for 'market_max' (P3 MVP)", () => {
    // 1.00 → 0.99 — exact rounding edge
    expect(
      computeIntendedListPrice(
        { sell_strategy: "market_max", sell_price_usd: null },
        1.0
      )
    ).toBeCloseTo(0.99, 10);

    // 100.00 → 99.00
    expect(
      computeIntendedListPrice(
        { sell_strategy: "market_max", sell_price_usd: null },
        100.0
      )
    ).toBeCloseTo(99.0, 10);
  });

  it("returns currentPrice * (sell_price_usd / 100) for 'percent_of_market'", () => {
    expect(
      computeIntendedListPrice(
        { sell_strategy: "percent_of_market", sell_price_usd: 50 },
        10.0
      )
    ).toBe(5.0);

    expect(
      computeIntendedListPrice(
        { sell_strategy: "percent_of_market", sell_price_usd: 95 },
        20.0
      )
    ).toBe(19.0);
  });

  it("returns null for 'percent_of_market' when sell_price_usd is missing", () => {
    expect(
      computeIntendedListPrice(
        { sell_strategy: "percent_of_market", sell_price_usd: null },
        100
      )
    ).toBeNull();
  });
});

// ─── fireRule path (via evaluateRules) ───────────────────────────────────

const baseRule = {
  id: 1,
  user_id: 42,
  account_id: 7,
  market_hash_name: "AK-47 | Redline (Field-Tested)",
  trigger_type: "above" as const,
  trigger_price_usd: 10,
  sell_price_usd: 5, // intentionally low so MIN guard triggers when used
  sell_strategy: "fixed" as const,
  mode: "auto_list" as const,
  enabled: true,
  cooldown_minutes: 360,
  last_fired_at: null,
  times_fired: 0,
};

/**
 * Build a query-mock that returns advisory lock = true, then yields the
 * provided rules row. Subsequent calls return whatever rest[] supplies.
 */
function mockEvalSequence(rules: unknown[], rest: Array<{ rows: unknown[]; rowCount?: number }>) {
  const responses = [
    { rows: [{ locked: true }], rowCount: 1 }, // advisory lock acquired
    { rows: rules, rowCount: rules.length }, // SELECT rules
    ...rest,
  ];
  let i = 0;
  mockQuery.mockImplementation((..._args: unknown[]) => {
    const resp = responses[i++] ?? { rows: [], rowCount: 0 };
    return Promise.resolve(resp);
  });
}

describe("evaluateRules — fire path", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockSendPush.mockReset();
    mockIsFirebaseReady.mockReset();
    mockCreateOperation.mockReset();
    mockIsFirebaseReady.mockReturnValue(false); // no push noise; assert by DB calls
  });

  // MED-3: push notification body must NOT contain dollar amounts that would
  // surface portfolio activity on the device lock screen. Pricing rides in
  // the data payload only — the in-app modal reads it once authenticated.
  describe("MED-3 lock-screen privacy", () => {
    beforeEach(() => {
      mockIsFirebaseReady.mockReturnValue(true);
    });

    it("sendCancelWindowPush: body has no $ amount, data payload has intendedPriceUsd", async () => {
      const okRule = { ...baseRule, sell_price_usd: 9.5 };
      // Sequence: lock probe + rules + price + insert + bumpFiredCounters
      // + getUserFcmTokens (push) + drain SELECT + unlock
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("pg_try_advisory_lock"))
          return Promise.resolve({ rows: [{ locked: true }], rowCount: 1 });
        if (sql.includes("FROM auto_sell_rules"))
          return Promise.resolve({ rows: [okRule], rowCount: 1 });
        if (sql.includes("FROM current_prices"))
          return Promise.resolve({ rows: [{ price_usd: 10 }] });
        if (sql.includes("INSERT INTO auto_sell_executions"))
          return Promise.resolve({ rows: [{ id: 555 }] });
        if (sql.includes("UPDATE auto_sell_rules"))
          return Promise.resolve({ rows: [], rowCount: 1 });
        if (sql.includes("FROM user_devices"))
          return Promise.resolve({ rows: [{ fcm_token: "tok-abc" }] });
        if (sql.includes("pg_advisory_unlock"))
          return Promise.resolve({ rows: [], rowCount: 1 });
        // drainExpiredCancelWindows
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      await evaluateRules();

      // Find the cancel-window push call.
      const pushCall = mockSendPush.mock.calls.find(
        (c) =>
          (c[3] as Record<string, string> | undefined)?.type ===
          "auto_sell_cancel_window"
      );
      expect(pushCall).toBeDefined();
      const [, title, body, data] = pushCall as [
        unknown,
        string,
        string,
        Record<string, string>,
      ];

      // Title & body have no portfolio dollar amount.
      expect(title).not.toMatch(/\$/);
      expect(body).not.toMatch(/\$/);
      // Body still identifies the rule (user needs context to act).
      expect(body).toContain(baseRule.market_hash_name);

      // Pricing rides in data payload — read by cancel_window_modal.dart.
      expect(data.intendedPriceUsd).toBe("9.50");
      expect(data.actualPriceUsd).toBe("10.00");
      expect(data.executionId).toBe("555");
      expect(data.userId).toBe(String(baseRule.user_id));
    });

    it("sendNotifyOnlyPush (MIN guard refusal): body has no $ amount, refusalReason in data only", async () => {
      // baseRule has sell_price_usd=5, currentPrice=20 below → ratio=0.25 → MIN guard.
      mockQuery.mockImplementation((sql: string) => {
        if (sql.includes("pg_try_advisory_lock"))
          return Promise.resolve({ rows: [{ locked: true }], rowCount: 1 });
        if (sql.includes("FROM auto_sell_rules"))
          return Promise.resolve({ rows: [baseRule], rowCount: 1 });
        if (sql.includes("FROM current_prices"))
          return Promise.resolve({ rows: [{ price_usd: 20 }] });
        if (sql.includes("INSERT INTO auto_sell_executions"))
          return Promise.resolve({ rows: [{ id: 999 }] });
        if (sql.includes("UPDATE auto_sell_rules"))
          return Promise.resolve({ rows: [], rowCount: 1 });
        if (sql.includes("FROM user_devices"))
          return Promise.resolve({ rows: [{ fcm_token: "tok-abc" }] });
        if (sql.includes("pg_advisory_unlock"))
          return Promise.resolve({ rows: [], rowCount: 1 });
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      await evaluateRules();

      const pushCall = mockSendPush.mock.calls.find(
        (c) =>
          (c[3] as Record<string, string> | undefined)?.type ===
          "auto_sell_notify"
      );
      expect(pushCall).toBeDefined();
      const [, title, body, data] = pushCall as [
        unknown,
        string,
        string,
        Record<string, string>,
      ];

      // Title is generic (no portfolio leak).
      expect(title).toBe("SkinKeeper auto-sell");
      // Body for refusals comes from refusalReason — already $-free by design,
      // assert that explicitly so future refusalReason changes don't regress.
      expect(body).not.toMatch(/\$/);
      // refusalReason present in data for in-app rendering.
      expect(data.refusalReason).toMatch(/refusing to auto-list/i);
      // Actual pricing in data.
      expect(data.actualPriceUsd).toBe("20.00");
    });
  });

  it("MIN guard: ratio < 0.5 → action='notified' with refusalReason set", async () => {
    // sell_price=5 (fixed), currentPrice=20 → ratio=0.25 (< 0.5) → MIN guard fires.
    // Even though rule.mode='auto_list', the fire is downgraded to notified.
    mockEvalSequence(
      [baseRule],
      [
        { rows: [{ price_usd: 20 }] }, // current_prices lookup
        { rows: [{ id: 999 }] }, // INSERT execution row → notified, returning id
        { rows: [], rowCount: 1 }, // bumpRuleFiredCounters UPDATE
        { rows: [] }, // drainExpiredCancelWindows SELECT
        { rows: [], rowCount: 1 }, // pg_advisory_unlock
      ]
    );

    await evaluateRules();

    // Assert the INSERT call — extract the call where SQL contains
    // 'INSERT INTO auto_sell_executions'.
    const insertCall = mockQuery.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("INSERT INTO auto_sell_executions")
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    // params order: [ruleId, name, trigger, current, intended, action, ms, errMsg]
    expect(params[5]).toBe("notified"); // action
    expect(typeof params[7]).toBe("string");
    expect(params[7] as string).toMatch(/refusing to auto-list/i);

    // No listing handoff
    expect(mockCreateOperation).not.toHaveBeenCalled();
  });

  it("auto_list happy path: inserts pending_window row", async () => {
    const okRule = { ...baseRule, sell_price_usd: 9.5 }; // ratio=0.95 (above 0.5)
    mockEvalSequence(
      [okRule],
      [
        { rows: [{ price_usd: 10 }] }, // current_prices
        { rows: [{ id: 555 }] }, // INSERT execution → pending_window
        { rows: [], rowCount: 1 }, // bumpRuleFiredCounters
        { rows: [] }, // drainExpiredCancelWindows SELECT
        { rows: [], rowCount: 1 }, // pg_advisory_unlock
      ]
    );

    await evaluateRules();

    const insertCall = mockQuery.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("INSERT INTO auto_sell_executions")
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    expect(params[5]).toBe("pending_window");
    expect(params[6]).toBe("60000"); // 60s cancel window in ms
  });

  it("cooldown blocks a second fire within the window", async () => {
    const recentlyFired = {
      ...baseRule,
      // 30 min ago, with 360-min cooldown → still locked out
      last_fired_at: new Date(Date.now() - 30 * 60_000).toISOString(),
    };
    mockEvalSequence(
      [recentlyFired],
      [
        // No additional queries expected — eval returns early. Just provide
        // the unlock at the end so the finally block has something.
        { rows: [], rowCount: 1 }, // pg_advisory_unlock
      ]
    );

    await evaluateRules();

    // Must NOT have fetched current_prices or inserted an execution.
    const priceLookup = mockQuery.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("FROM current_prices")
    );
    expect(priceLookup).toBeUndefined();

    const insertCall = mockQuery.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("INSERT INTO auto_sell_executions")
    );
    expect(insertCall).toBeUndefined();
  });

  // HIGH-3: stale price → rule eval skips quietly.
  it("skips fire when current_prices freshness window returns no row (stale)", async () => {
    mockEvalSequence(
      [{ ...baseRule, sell_price_usd: 9.5 }],
      [
        // current_prices lookup returns nothing (the WHERE updated_at clause
        // filtered out a stale row)
        { rows: [] },
        // drainExpiredCancelWindows SELECT
        { rows: [] },
        // pg_advisory_unlock
        { rows: [], rowCount: 1 },
      ]
    );

    await evaluateRules();

    // Must NOT have inserted an execution row
    const insertCall = mockQuery.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("INSERT INTO auto_sell_executions")
    );
    expect(insertCall).toBeUndefined();
    expect(mockCreateOperation).not.toHaveBeenCalled();
  });

  // HIGH-2 (D2): engine-side guard on percent_of_market band.
  it("downgrades to notify_only when sell_strategy=percent_of_market with sell_price_usd=50", async () => {
    const badRule = {
      ...baseRule,
      sell_strategy: "percent_of_market" as const,
      sell_price_usd: 50, // outside 70..99 band
    };
    mockEvalSequence(
      [badRule],
      [
        { rows: [{ price_usd: 20 }] }, // current_prices lookup
        { rows: [{ id: 999 }] }, // INSERT execution row → notified
        { rows: [], rowCount: 1 }, // bumpRuleFiredCounters
        { rows: [] }, // drain SELECT
        { rows: [], rowCount: 1 }, // unlock
      ]
    );

    await evaluateRules();

    const insertCall = mockQuery.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("INSERT INTO auto_sell_executions")
    );
    expect(insertCall).toBeDefined();
    const params = insertCall![1] as unknown[];
    // Action downgraded to notified, error_message mentions percent band.
    expect(params[5]).toBe("notified");
    expect(typeof params[7]).toBe("string");
    expect(params[7] as string).toMatch(/percent_of_market/i);
    expect(params[7] as string).toMatch(/70/);
    expect(params[7] as string).toMatch(/99/);

    expect(mockCreateOperation).not.toHaveBeenCalled();
  });

  it("skips eval entirely when advisory lock is held by another instance", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ locked: false }], rowCount: 1 });

    await evaluateRules();

    // Lock held → exactly ONE call (the pg_try_advisory_lock probe). No
    // unlock either, since we never acquired it.
    expect(mockQuery).toHaveBeenCalledTimes(1);
    const sql = mockQuery.mock.calls[0]![0] as string;
    expect(sql).toContain("pg_try_advisory_lock");
  });
});

// ─── executeListing handoff ──────────────────────────────────────────────

describe("executeListing", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockCreateOperation.mockReset();
  });

  it("hands off to createOperation when pending_window claim succeeds", async () => {
    const exec = {
      rule_id: 1,
      market_hash_name: "AK-47 | Redline (Field-Tested)",
      intended_list_price_usd: 9.5,
      actual_price_usd: 10.0,
    };
    mockQuery
      // Atomic UPDATE pending_window → listed
      .mockResolvedValueOnce({ rows: [exec], rowCount: 1 })
      // SELECT rule
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 42,
            account_id: 7,
            market_hash_name: "AK-47 | Redline (Field-Tested)",
            mode: "auto_list",
          },
        ],
      })
      // HIGH-2 mid-window recheck: getCurrentMarketPrice — same as
      // intendedAtTrigger so drift = 0, no abort.
      .mockResolvedValueOnce({ rows: [{ price_usd: 9.5 }] })
      // SELECT inventory asset
      .mockResolvedValueOnce({
        rows: [
          {
            asset_id: "12345",
            market_hash_name: "AK-47 | Redline (Field-Tested)",
          },
        ],
      })
      // UPDATE sell_operation_id
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    mockCreateOperation.mockResolvedValueOnce({ operationId: "op-uuid", skippedAssetIds: [] });

    await executeListing(123);

    expect(mockCreateOperation).toHaveBeenCalledWith(
      42,
      [
        expect.objectContaining({
          assetId: "12345",
          marketHashName: "AK-47 | Redline (Field-Tested)",
          priceCents: 950, // 9.50 * 100
          accountId: 7,
          priceCurrencyId: 1,
        }),
      ],
      7
    );
  });

  it("skips when pending_window claim returns no rows (already cancelled/listed)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await executeListing(123);

    expect(mockCreateOperation).not.toHaveBeenCalled();
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  // HIGH-2 (D1): mid-window price drift recheck.
  it("aborts with PRICE_MOVED_DURING_WINDOW when market drops >30% mid-window", async () => {
    const exec = {
      rule_id: 1,
      market_hash_name: "AK-47 | Redline (Field-Tested)",
      intended_list_price_usd: 100,
      actual_price_usd: 100,
    };
    mockQuery
      .mockResolvedValueOnce({ rows: [exec], rowCount: 1 }) // claim
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 42,
            account_id: 7,
            market_hash_name: "AK-47 | Redline (Field-Tested)",
            mode: "auto_list",
          },
        ],
      })
      // Recheck price collapsed to 50 — drift = (100-50)/50 = 1.0 (>0.30)
      .mockResolvedValueOnce({ rows: [{ price_usd: 50 }] })
      // UPDATE → failed with PRICE_MOVED_DURING_WINDOW
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await executeListing(123);

    expect(mockCreateOperation).not.toHaveBeenCalled();
    // The reason is inlined in the SQL literal, params hold only [execId].
    const failUpdate = mockQuery.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("PRICE_MOVED_DURING_WINDOW")
    );
    expect(failUpdate).toBeDefined();
  });

  it("aborts with PRICE_UNAVAILABLE_AT_LISTING when recheck yields no fresh price", async () => {
    const exec = {
      rule_id: 1,
      market_hash_name: "AK-47 | Redline (Field-Tested)",
      intended_list_price_usd: 9.5,
      actual_price_usd: 10,
    };
    mockQuery
      .mockResolvedValueOnce({ rows: [exec], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 42,
            account_id: 7,
            market_hash_name: "AK-47 | Redline (Field-Tested)",
            mode: "auto_list",
          },
        ],
      })
      // current_prices returns no row (stale or wedged crawler)
      .mockResolvedValueOnce({ rows: [] })
      // UPDATE → failed
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    await executeListing(123);

    expect(mockCreateOperation).not.toHaveBeenCalled();
    const failUpdate = mockQuery.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("PRICE_UNAVAILABLE_AT_LISTING")
    );
    expect(failUpdate).toBeDefined();
  });

  it("marks 'failed' when no tradable asset is found", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          {
            rule_id: 1,
            market_hash_name: "AK-47 | Redline (Field-Tested)",
            intended_list_price_usd: 9.5,
            actual_price_usd: 10.0,
          },
        ],
        rowCount: 1,
      })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 1,
            user_id: 42,
            account_id: 7,
            market_hash_name: "AK-47 | Redline (Field-Tested)",
            mode: "auto_list",
          },
        ],
      })
      // HIGH-2 mid-window recheck — no drift (price unchanged)
      .mockResolvedValueOnce({ rows: [{ price_usd: 9.5 }] })
      .mockResolvedValueOnce({ rows: [] }) // no inventory asset
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE → failed

    await executeListing(123);

    expect(mockCreateOperation).not.toHaveBeenCalled();
    const failUpdate = mockQuery.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("error_message") &&
        (c[0] as string).includes("'failed'")
    );
    expect(failUpdate).toBeDefined();
  });
});
