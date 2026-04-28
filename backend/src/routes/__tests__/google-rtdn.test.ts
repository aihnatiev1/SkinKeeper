/**
 * google-rtdn.test.ts — Google Play Real-Time Developer Notifications.
 *
 * Verifies the route at `/api/purchases/google-rtdn-<token>` and the handler
 * in services/googlePlayRtdn.ts:
 *   - Empty / malformed body → 204 (no crash, Pub/Sub doesn't retry)
 *   - REVOKED (12) → user.is_premium=false + revoked_at stamped + cache invalidated
 *   - EXPIRED (13) → same revoke flow
 *   - CANCELED (3) → auto_renew=false, premium NOT revoked
 *   - PURCHASED (4) → calls Google API, refreshes premium_until
 *   - Unknown token → logs warning, returns 204 (idempotent)
 *   - testNotification → logs ping, returns 204
 *   - Replay protection: same messageId twice → second is no-op
 *
 * The path token defaults to "dev" when GOOGLE_RTDN_PATH_TOKEN is unset, so
 * tests POST to `/api/purchases/google-rtdn-dev`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";

// ─── Mocks: pool, googlePlayApi, premium cache ───────────────────────

const mockPoolQuery = vi.fn();
vi.mock("../../db/pool.js", () => ({
  pool: { query: (...args: unknown[]) => mockPoolQuery(...args) },
  checkPoolHealth: vi.fn().mockResolvedValue(undefined),
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

vi.mock("../../services/priceStats.js", () => ({
  getAllStats: vi.fn().mockReturnValue({ sources: [] }),
  recordFetchStart: vi.fn(() => vi.fn()),
  recordSuccess: vi.fn(),
  recordFailure: vi.fn(),
  record429: vi.fn(),
  updateCrawlerState: vi.fn(),
}));

vi.mock("../../services/priceJob.js", () => ({
  startPriceJobs: vi.fn(),
  stopAllJobs: vi.fn(),
  getJobHealth: vi.fn().mockReturnValue({}),
}));

vi.mock("../../services/steam.js", () => ({
  fetchSteamInventory: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../services/steamSession.js", () => ({
  SteamSessionService: {
    getActiveAccountId: vi.fn().mockResolvedValue(1),
    ensureValidSession: vi.fn().mockResolvedValue(null),
  },
}));

// Google Play API: hermetic mock so refresh paths don't hit Google.
const mockGetSubscriptionInfo = vi.fn();
vi.mock("../../services/googlePlayApi.js", () => ({
  isGooglePlayApiConfigured: vi.fn().mockReturnValue(true),
  getSubscriptionInfo: (...args: unknown[]) =>
    mockGetSubscriptionInfo(...args),
  _resetGooglePlayClientForTests: vi.fn(),
}));

// Watch invalidatePremiumCache to assert it fires after every state change.
const mockInvalidatePremiumCache = vi.fn();
vi.mock("../../middleware/auth.js", async () => {
  // We still need authMiddleware (used by other purchases routes mounted on
  // the same router) so import the real module and override one export.
  const actual = await vi.importActual<
    typeof import("../../middleware/auth.js")
  >("../../middleware/auth.js");
  return {
    ...actual,
    invalidatePremiumCache: (userId: number) =>
      mockInvalidatePremiumCache(userId),
  };
});

import { createTestApp } from "../../__tests__/app.js";
import { _resetRtdnDedupForTests } from "../../services/googlePlayRtdn.js";

const app = createTestApp();

// Default RTDN path token — set by route module at import time. The route
// uses GOOGLE_RTDN_PATH_TOKEN || "dev"; in test env we leave it unset so
// the route mounts at /google-rtdn-dev.
const RTDN_PATH = "/api/purchases/google-rtdn-dev";

// ─── Helpers ─────────────────────────────────────────────────────────

/** Encode a decoded RTDN payload into the Pub/Sub envelope shape. */
function pubsubEnvelope(
  decoded: Record<string, unknown>,
  messageId: string = `msg-${Date.now()}-${Math.random()}`
) {
  return {
    message: {
      data: Buffer.from(JSON.stringify(decoded)).toString("base64"),
      messageId,
      publishTime: new Date().toISOString(),
    },
    subscription: "projects/skinkeeper/subscriptions/play-rtdn",
  };
}

function subscriptionPayload(
  notificationType: number,
  overrides: { purchaseToken?: string; subscriptionId?: string } = {}
) {
  return {
    version: "1.0",
    packageName: "com.skinkeeper.app",
    eventTimeMillis: String(Date.now()),
    subscriptionNotification: {
      version: "1.0",
      notificationType,
      purchaseToken: overrides.purchaseToken ?? "tok-rtdn-test",
      subscriptionId: overrides.subscriptionId ?? "skinkeeper_pro_monthly",
    },
  };
}

describe("POST /api/purchases/google-rtdn-<token>", () => {
  beforeEach(() => {
    mockPoolQuery.mockReset();
    mockGetSubscriptionInfo.mockReset();
    mockInvalidatePremiumCache.mockReset();
    _resetRtdnDedupForTests();
  });

  it("empty body → 204 without crashing", async () => {
    const res = await request(app).post(RTDN_PATH).send({});
    expect(res.status).toBe(204);
    // No DB calls — we bail before user lookup.
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it("malformed base64 in message.data → 204, no DB calls", async () => {
    const res = await request(app)
      .post(RTDN_PATH)
      .send({ message: { data: "!!! not valid base64 JSON !!!" } });
    expect(res.status).toBe(204);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it("testNotification → 204, no DB calls", async () => {
    const payload = {
      version: "1.0",
      packageName: "com.skinkeeper.app",
      eventTimeMillis: String(Date.now()),
      testNotification: { version: "1.0" },
    };
    const res = await request(app)
      .post(RTDN_PATH)
      .send(pubsubEnvelope(payload));
    expect(res.status).toBe(204);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });

  it("REVOKED (12) → revokes premium + stamps revoked_at + invalidates cache", async () => {
    // 1: SELECT user lookup → finds user 7, not yet revoked
    // 2: UPDATE users SET is_premium=FALSE
    // 3: UPDATE purchase_receipts SET revoked_at=NOW()
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{ user_id: 7, revoked_at: null }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post(RTDN_PATH)
      .send(pubsubEnvelope(subscriptionPayload(12)));

    expect(res.status).toBe(204);
    // Three DB calls in this exact order.
    expect(mockPoolQuery).toHaveBeenCalledTimes(3);
    const sqls = mockPoolQuery.mock.calls.map((c) => (c[0] as string) ?? "");
    expect(sqls[0]).toMatch(/SELECT user_id/);
    expect(sqls[1]).toMatch(/UPDATE users[\s\S]+is_premium = FALSE/);
    expect(sqls[2]).toMatch(/UPDATE purchase_receipts[\s\S]+revoked_at = NOW/);
    // Cache invalidated for the right user.
    expect(mockInvalidatePremiumCache).toHaveBeenCalledWith(7);
  });

  it("EXPIRED (13) → same revoke flow", async () => {
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{ user_id: 7, revoked_at: null }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post(RTDN_PATH)
      .send(pubsubEnvelope(subscriptionPayload(13)));

    expect(res.status).toBe(204);
    expect(mockInvalidatePremiumCache).toHaveBeenCalledWith(7);
    const sqls = mockPoolQuery.mock.calls.map((c) => (c[0] as string) ?? "");
    expect(sqls[1]).toMatch(/UPDATE users[\s\S]+is_premium = FALSE/);
  });

  it("REVOKED (12) for already-revoked user → no-op (idempotent replay)", async () => {
    // Same notification re-delivered after Google's retry — purchase_receipts
    // row already has revoked_at set. Handler must NOT re-run UPDATE users.
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ user_id: 7, revoked_at: new Date("2026-04-20T12:00:00Z") }],
      rowCount: 1,
    });

    const res = await request(app)
      .post(RTDN_PATH)
      .send(pubsubEnvelope(subscriptionPayload(12)));

    expect(res.status).toBe(204);
    // Only the SELECT ran — no UPDATE, no cache invalidation.
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    expect(mockInvalidatePremiumCache).not.toHaveBeenCalled();
  });

  it("CANCELED (3) → auto_renew=false, premium NOT revoked", async () => {
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{ user_id: 7, revoked_at: null }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const res = await request(app)
      .post(RTDN_PATH)
      .send(pubsubEnvelope(subscriptionPayload(3)));

    expect(res.status).toBe(204);
    expect(mockPoolQuery).toHaveBeenCalledTimes(2);
    const sqls = mockPoolQuery.mock.calls.map((c) => (c[0] as string) ?? "");
    expect(sqls[1]).toMatch(/UPDATE purchase_receipts[\s\S]+auto_renew = FALSE/);
    // Crucially: no UPDATE users SET is_premium=FALSE.
    expect(sqls.some((s) => /UPDATE users/.test(s))).toBe(false);
    expect(mockInvalidatePremiumCache).not.toHaveBeenCalled();
  });

  it("PURCHASED (4) → calls Google API, updates premium_until, invalidates cache", async () => {
    const futureMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{ user_id: 7, revoked_at: null }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE users
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE purchase_receipts

    mockGetSubscriptionInfo.mockResolvedValueOnce({
      info: {
        purchaseToken: "tok-rtdn-test",
        paymentState: 1,
        expiryTimeMillis: String(futureMs),
        autoRenewing: true,
        obfuscatedExternalAccountId: "7",
        lineItems: [
          {
            productId: "skinkeeper_pro_monthly",
            purchaseId: "order-xyz",
          },
        ],
      },
    });

    const res = await request(app)
      .post(RTDN_PATH)
      .send(pubsubEnvelope(subscriptionPayload(4)));

    expect(res.status).toBe(204);
    expect(mockGetSubscriptionInfo).toHaveBeenCalledWith(
      "com.skinkeeper.app",
      "skinkeeper_pro_monthly",
      "tok-rtdn-test"
    );
    const sqls = mockPoolQuery.mock.calls.map((c) => (c[0] as string) ?? "");
    expect(sqls[1]).toMatch(/UPDATE users[\s\S]+is_premium = TRUE/);
    expect(mockInvalidatePremiumCache).toHaveBeenCalledWith(7);
  });

  it("RENEWED (2) → calls Google API even on renewal", async () => {
    const futureMs = Date.now() + 30 * 24 * 60 * 60 * 1000;
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{ user_id: 7, revoked_at: null }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    mockGetSubscriptionInfo.mockResolvedValueOnce({
      info: {
        purchaseToken: "tok-rtdn-test",
        paymentState: 1,
        expiryTimeMillis: String(futureMs),
        autoRenewing: true,
        obfuscatedExternalAccountId: "7",
        lineItems: [{ productId: "skinkeeper_pro_monthly" }],
      },
    });

    const res = await request(app)
      .post(RTDN_PATH)
      .send(pubsubEnvelope(subscriptionPayload(2)));

    expect(res.status).toBe(204);
    expect(mockGetSubscriptionInfo).toHaveBeenCalledTimes(1);
  });

  it("ON_HOLD (5) → no DB writes, just logs (Google handles grace)", async () => {
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ user_id: 7, revoked_at: null }],
      rowCount: 1,
    });

    const res = await request(app)
      .post(RTDN_PATH)
      .send(pubsubEnvelope(subscriptionPayload(5)));

    expect(res.status).toBe(204);
    // Only the SELECT — no premium changes for grace events.
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    expect(mockInvalidatePremiumCache).not.toHaveBeenCalled();
  });

  it("unknown purchaseToken → logs warning, 204, no further DB writes", async () => {
    // SELECT returns no rows.
    mockPoolQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

    const res = await request(app)
      .post(RTDN_PATH)
      .send(
        pubsubEnvelope(
          subscriptionPayload(12, { purchaseToken: "tok-nonexistent" })
        )
      );

    expect(res.status).toBe(204);
    expect(mockPoolQuery).toHaveBeenCalledTimes(1);
    expect(mockInvalidatePremiumCache).not.toHaveBeenCalled();
  });

  it("replay protection: same messageId twice → second is a no-op", async () => {
    // First delivery: full revoke flow.
    mockPoolQuery
      .mockResolvedValueOnce({
        rows: [{ user_id: 7, revoked_at: null }],
        rowCount: 1,
      })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const envelope = pubsubEnvelope(subscriptionPayload(12), "msg-replay-1");

    const first = await request(app).post(RTDN_PATH).send(envelope);
    expect(first.status).toBe(204);
    expect(mockPoolQuery).toHaveBeenCalledTimes(3);
    expect(mockInvalidatePremiumCache).toHaveBeenCalledTimes(1);

    // Second delivery with the SAME messageId — handler must short-circuit
    // before any DB call.
    const callsBefore = mockPoolQuery.mock.calls.length;
    const cacheCallsBefore = mockInvalidatePremiumCache.mock.calls.length;

    const second = await request(app).post(RTDN_PATH).send(envelope);
    expect(second.status).toBe(204);
    expect(mockPoolQuery.mock.calls.length).toBe(callsBefore);
    expect(mockInvalidatePremiumCache.mock.calls.length).toBe(cacheCallsBefore);
  });

  it("missing subscriptionNotification (oneTimeProduct only) → 204, no DB", async () => {
    const payload = {
      version: "1.0",
      packageName: "com.skinkeeper.app",
      eventTimeMillis: String(Date.now()),
      oneTimeProductNotification: {
        version: "1.0",
        notificationType: 1,
        purchaseToken: "tok-onetime",
        sku: "some_iap",
      },
    };

    const res = await request(app)
      .post(RTDN_PATH)
      .send(pubsubEnvelope(payload));
    expect(res.status).toBe(204);
    expect(mockPoolQuery).not.toHaveBeenCalled();
  });
});
