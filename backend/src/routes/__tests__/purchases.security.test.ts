/**
 * purchases.security.test.ts — security-audit fixes for /api/purchases.
 *
 * Covers:
 *   - CRIT-1/2: receipt user-binding (FOR UPDATE) on /verify and /restore
 *   - HIGH-4: empty transactionId rejection
 *   - /restore input hardening (missing receiptData, store=stripe)
 *
 * activatePremium goes through pool.connect()/client.query (not pool.query),
 * so we mock the connect path with a tiny client stub. Receipt verification
 * uses verifyAppleReceipt which reads JSON.parse'd client receiptData when
 * the Apple App Store API isn't configured (default in tests).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import { createTestJwt } from "../../__tests__/helpers.js";

// ─── pool mock with both query() and connect() ─────────────────────────
//
// Other purchases tests only mock `pool.query`. Activation flows go through
// `pool.connect()` → `client.query()` → `client.release()`. Each test
// supplies an array of expected query responses; the client mock pops them
// in order and any unexpected query throws (catches mocking holes).
const mockPoolQuery = vi.fn();
const mockClientQuery = vi.fn();
const mockClientRelease = vi.fn();
const mockPoolConnect = vi.fn(async () => ({
  query: mockClientQuery,
  release: mockClientRelease,
}));

vi.mock("../../db/pool.js", () => ({
  pool: {
    query: (...args: unknown[]) => mockPoolQuery(...args),
    connect: (...args: unknown[]) => mockPoolConnect(...(args as [])),
  },
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

// Force the dev/test "trust client" branch of verifyAppleReceipt — keeps
// the suite hermetic (no Apple keys, no network).
vi.mock("../../services/appleStoreApi.js", () => ({
  isAppleApiConfigured: vi.fn().mockReturnValue(false),
  getTransactionInfo: vi.fn(),
}));

// Google Play API: hermetic mock. Each Google test reseats the return
// value via mockGooglePlayConfigured / mockGetSubscriptionInfo so we can
// exercise the configured/unconfigured branches and the response shapes
// (active subscription, mismatched user, pending payment, 410 gone, …)
// without making real API calls.
const mockGooglePlayConfigured = vi.fn().mockReturnValue(true);
const mockGetSubscriptionInfo = vi.fn();
vi.mock("../../services/googlePlayApi.js", () => ({
  isGooglePlayApiConfigured: () => mockGooglePlayConfigured(),
  getSubscriptionInfo: (...args: unknown[]) =>
    mockGetSubscriptionInfo(...args),
  _resetGooglePlayClientForTests: vi.fn(),
}));

import { createTestApp } from "../../__tests__/app.js";

const app = createTestApp();
const userAJwt = createTestJwt(1);
const userBJwt = createTestJwt(2);

// authMiddleware does a SELECT steam_id FROM users — mock once per request.
const mockDemoCheck = (userId: number = 1) =>
  mockPoolQuery.mockResolvedValueOnce({
    rows: [{ steam_id: `765611980000000${userId}` }],
  });

/**
 * Build a sequence of client.query responses for activatePremium's txn.
 * Order:
 *   1. BEGIN
 *   2. SELECT user_id FOR UPDATE         — receipt user-binding probe
 *   3. INSERT INTO purchase_receipts     — only if probe was clean
 *   4. UPDATE users SET is_premium       — only if probe was clean
 *   5. COMMIT
 *
 * For the conflict path: BEGIN, SELECT (returns other user), ROLLBACK —
 * INSERT/UPDATE never run.
 */
function setClientResponsesHappyPath() {
  mockClientQuery
    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT FOR UPDATE — empty
    .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // INSERT receipt
    .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE users
    .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT
}

function setClientResponsesConflict(linkedUserId: number) {
  mockClientQuery
    .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
    .mockResolvedValueOnce({
      rows: [{ user_id: linkedUserId }],
      rowCount: 1,
    }) // SELECT FOR UPDATE — finds another owner
    .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // ROLLBACK
}

const baseReceipt = {
  productId: "skinkeeper_pro_monthly",
  transactionId: "tx-1001",
  originalTransactionId: "tx-orig-1001",
  purchaseDate: new Date().toISOString(),
  expiresDate: new Date(Date.now() + 30 * 86400_000).toISOString(),
};

describe("CRIT-1/2: Apple receipt user-binding", () => {
  beforeEach(() => {
    mockPoolQuery.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockPoolConnect.mockClear();
  });

  it("first user successfully verifies a fresh receipt (200)", async () => {
    mockDemoCheck(1);
    setClientResponsesHappyPath();
    // getSubscriptionStatus runs after activate
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ is_premium: true, premium_until: null }],
    });
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/purchases/verify")
      .set("Authorization", `Bearer ${userAJwt}`)
      .send({
        store: "apple",
        receiptData: JSON.stringify(baseReceipt),
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("second user submitting same receipt → 409 RECEIPT_ALREADY_LINKED, premium NOT granted", async () => {
    mockDemoCheck(2);
    setClientResponsesConflict(1); // receipt is linked to user 1

    const res = await request(app)
      .post("/api/purchases/verify")
      .set("Authorization", `Bearer ${userBJwt}`)
      .send({
        store: "apple",
        receiptData: JSON.stringify(baseReceipt),
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("RECEIPT_ALREADY_LINKED");

    // Most importantly: the UPDATE users SET is_premium=TRUE never ran.
    // We assert that exactly 3 client.query calls were made: BEGIN,
    // SELECT, ROLLBACK. No INSERT, no UPDATE, no COMMIT.
    expect(mockClientQuery).toHaveBeenCalledTimes(3);
    const sqlCalls = mockClientQuery.mock.calls.map(
      (c) => (c[0] as string) ?? ""
    );
    expect(sqlCalls.some((s) => s.includes("UPDATE users SET is_premium"))).toBe(
      false
    );
    expect(
      sqlCalls.some((s) => s.includes("INSERT INTO purchase_receipts"))
    ).toBe(false);
  });

  it("renewal of another user's subscription (new tx_id, same original_tx_id) → 409", async () => {
    // Apple's renewal pattern: brand new transactionId, original_transaction_id
    // is the SAME. Without OR-original matching, an attacker could impersonate
    // a renewal and bypass the user-binding check.
    mockDemoCheck(2);
    setClientResponsesConflict(1);

    const res = await request(app)
      .post("/api/purchases/verify")
      .set("Authorization", `Bearer ${userBJwt}`)
      .send({
        store: "apple",
        receiptData: JSON.stringify({
          ...baseReceipt,
          transactionId: "tx-1002-renewal",
          originalTransactionId: baseReceipt.originalTransactionId,
        }),
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("RECEIPT_ALREADY_LINKED");
  });

  it("idempotent: same user re-submitting their own receipt → 200, premium granted", async () => {
    // SELECT FOR UPDATE returns user_id matching the caller — proceed.
    mockDemoCheck(1);
    mockClientQuery
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // BEGIN
      .mockResolvedValueOnce({ rows: [{ user_id: 1 }], rowCount: 1 }) // SELECT
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // INSERT (ON CONFLICT DO NOTHING)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE users
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // COMMIT
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ is_premium: true, premium_until: null }],
    });
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/purchases/verify")
      .set("Authorization", `Bearer ${userAJwt}`)
      .send({
        store: "apple",
        receiptData: JSON.stringify(baseReceipt),
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("/restore enforces same user-binding guard — second user → 409", async () => {
    mockDemoCheck(2);
    setClientResponsesConflict(1);

    const res = await request(app)
      .post("/api/purchases/restore")
      .set("Authorization", `Bearer ${userBJwt}`)
      .send({
        store: "apple",
        receiptData: JSON.stringify(baseReceipt),
      });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe("RECEIPT_ALREADY_LINKED");
  });
});

describe("HIGH-4: empty transactionId rejection", () => {
  beforeEach(() => {
    mockPoolQuery.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockPoolConnect.mockClear();
  });

  it("/verify with receiptData='{}' → 400 MISSING_TRANSACTION_ID", async () => {
    mockDemoCheck(1);

    const res = await request(app)
      .post("/api/purchases/verify")
      .set("Authorization", `Bearer ${userAJwt}`)
      .send({ store: "apple", receiptData: "{}" });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("MISSING_TRANSACTION_ID");
    // activatePremium MUST NOT have run.
    expect(mockPoolConnect).not.toHaveBeenCalled();
  });
});

describe("/restore input hardening", () => {
  beforeEach(() => {
    mockPoolQuery.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockPoolConnect.mockClear();
  });

  it("/restore without receiptData (apple) → 400", async () => {
    mockDemoCheck(1);

    const res = await request(app)
      .post("/api/purchases/restore")
      .set("Authorization", `Bearer ${userAJwt}`)
      .send({ store: "apple" });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toMatch(/receiptData/i);
    expect(mockPoolConnect).not.toHaveBeenCalled();
  });

  it("/restore with store=stripe → 400 (stripe must use its own checkout)", async () => {
    mockDemoCheck(1);

    const res = await request(app)
      .post("/api/purchases/restore")
      .set("Authorization", `Bearer ${userAJwt}`)
      .send({ store: "stripe", receiptData: "{}" });

    expect(res.status).toBe(400);
    expect(mockPoolConnect).not.toHaveBeenCalled();
  });

  it("/restore with unknown store → 400", async () => {
    mockDemoCheck(1);

    const res = await request(app)
      .post("/api/purchases/restore")
      .set("Authorization", `Bearer ${userAJwt}`)
      .send({ store: "playstation", receiptData: "{}" });

    expect(res.status).toBe(400);
  });
});

// ─── CRIT-3: Google Play receipt user-binding ────────────────────────
//
// Same threat model as Apple's CRIT-1/CRIT-2 but the protection lives one
// layer earlier — Google Play's purchase records don't carry a user
// identity unless the client populates `applicationUserName` at purchase
// time. Backend enforces the binding by reading
// `obfuscatedExternalAccountId` from the server-to-server response and
// rejecting any receipt where it doesn't match the JWT-authenticated user.
//
// Tests target verifyGoogleReceipt's branches via the /verify route; the
// route is the integration surface that flutter clients hit.

describe("CRIT-3: Google Play receipt user-binding", () => {
  const ORIGINAL_ENV = { ...process.env };

  beforeEach(() => {
    mockPoolQuery.mockReset();
    mockClientQuery.mockReset();
    mockClientRelease.mockReset();
    mockPoolConnect.mockClear();
    mockGooglePlayConfigured.mockReset();
    mockGetSubscriptionInfo.mockReset();
    // Ensure the dev escape hatch isn't leaking from the host shell —
    // every test that wants it sets it explicitly.
    delete process.env.ALLOW_UNVERIFIED_RECEIPTS;
    process.env.GOOGLE_PLAY_PACKAGE_NAME = "com.skinkeeper.app";
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  // Helper: a "happy" subscription record with user-binding set to user 1.
  const validInfo = (overrides: Record<string, unknown> = {}) => ({
    info: {
      purchaseToken: "tok-abc",
      paymentState: 1,
      expiryTimeMillis: String(Date.now() + 30 * 86400_000),
      autoRenewing: true,
      obfuscatedExternalAccountId: "1",
      lineItems: [
        { productId: "skinkeeper_pro_monthly", purchaseId: "order-xyz" },
      ],
      ...overrides,
    },
  });

  it("rejects empty purchaseToken without calling Google API", async () => {
    mockDemoCheck(1);
    mockGooglePlayConfigured.mockReturnValue(true);

    const res = await request(app)
      .post("/api/purchases/verify")
      .set("Authorization", `Bearer ${userAJwt}`)
      .send({
        store: "google",
        purchaseToken: "",
        productId: "skinkeeper_pro_monthly",
      });

    // Express route checks `!purchaseToken` first → 400 before
    // verifyGoogleReceipt is even called. Either way the API stays untouched.
    expect(res.status).toBe(400);
    expect(mockGetSubscriptionInfo).not.toHaveBeenCalled();
    expect(mockPoolConnect).not.toHaveBeenCalled();
  });

  it("ALLOW_UNVERIFIED_RECEIPTS=1 → bypasses API and grants premium (local-test path)", async () => {
    process.env.ALLOW_UNVERIFIED_RECEIPTS = "1";
    mockDemoCheck(1);
    setClientResponsesHappyPath();
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ is_premium: true, premium_until: null }],
    });
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/purchases/verify")
      .set("Authorization", `Bearer ${userAJwt}`)
      .send({
        store: "google",
        purchaseToken: "tok-local",
        productId: "skinkeeper_pro_monthly",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Crucially: the escape hatch DOES NOT call the Google API. This is
    // the whole point — local devs without service account keys can still
    // exercise the activation flow.
    expect(mockGetSubscriptionInfo).not.toHaveBeenCalled();
  });

  it("API not configured AND no escape hatch → 400 CONFIGURATION_ERROR (failsafe)", async () => {
    mockDemoCheck(1);
    mockGooglePlayConfigured.mockReturnValue(false);
    // No ALLOW_UNVERIFIED_RECEIPTS set — the regression we care about.
    // The original CRIT-3 bug let this combo through whenever NODE_ENV
    // wasn't exactly "production".

    const res = await request(app)
      .post("/api/purchases/verify")
      .set("Authorization", `Bearer ${userAJwt}`)
      .send({
        store: "google",
        purchaseToken: "tok-prod",
        productId: "skinkeeper_pro_monthly",
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("CONFIGURATION_ERROR");
    expect(mockPoolConnect).not.toHaveBeenCalled();
  });

  it("valid subscription with matching obfuscatedExternalAccountId → 200, premium granted", async () => {
    mockDemoCheck(1);
    mockGooglePlayConfigured.mockReturnValue(true);
    mockGetSubscriptionInfo.mockResolvedValueOnce(validInfo());
    setClientResponsesHappyPath();
    mockPoolQuery.mockResolvedValueOnce({
      rows: [{ is_premium: true, premium_until: null }],
    });
    mockPoolQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .post("/api/purchases/verify")
      .set("Authorization", `Bearer ${userAJwt}`)
      .send({
        store: "google",
        purchaseToken: "tok-abc",
        productId: "skinkeeper_pro_monthly",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    // Confirm the route passed (packageName, productId, purchaseToken)
    // to the Google client — the test would silently pass even if the
    // route reverted to the old 2-arg signature without this check.
    expect(mockGetSubscriptionInfo).toHaveBeenCalledWith(
      "com.skinkeeper.app",
      "skinkeeper_pro_monthly",
      "tok-abc"
    );
  });

  it("mismatched obfuscatedExternalAccountId → 400 RECEIPT_USER_MISMATCH (CRIT-3 protection)", async () => {
    // User 2 (userBJwt) submits a receipt that Google says belongs to user 1.
    // This is the cross-account replay: attacker observed user 1's purchase
    // token (e.g. via a leaked Sentry breadcrumb) and tries to claim Premium
    // on their own account.
    mockDemoCheck(2);
    mockGooglePlayConfigured.mockReturnValue(true);
    mockGetSubscriptionInfo.mockResolvedValueOnce(
      validInfo({ obfuscatedExternalAccountId: "1" })
    );

    const res = await request(app)
      .post("/api/purchases/verify")
      .set("Authorization", `Bearer ${userBJwt}`)
      .send({
        store: "google",
        purchaseToken: "tok-abc",
        productId: "skinkeeper_pro_monthly",
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("RECEIPT_USER_MISMATCH");
    // activatePremium MUST NOT have run — we never reach the txn.
    expect(mockPoolConnect).not.toHaveBeenCalled();
  });

  it("empty obfuscatedExternalAccountId → 400 RECEIPT_NOT_BOUND (client didn't bind)", async () => {
    // Client purchased without setting `applicationUserName`. We can't
    // tell who owns this receipt — refuse to activate Premium for anyone.
    mockDemoCheck(1);
    mockGooglePlayConfigured.mockReturnValue(true);
    mockGetSubscriptionInfo.mockResolvedValueOnce(
      validInfo({ obfuscatedExternalAccountId: "" })
    );

    const res = await request(app)
      .post("/api/purchases/verify")
      .set("Authorization", `Bearer ${userAJwt}`)
      .send({
        store: "google",
        purchaseToken: "tok-abc",
        productId: "skinkeeper_pro_monthly",
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("RECEIPT_NOT_BOUND");
    expect(mockPoolConnect).not.toHaveBeenCalled();
  });

  it("paymentState=0 (pending) → 400 INVALID_PAYMENT_STATE_0", async () => {
    // SEPA / pre-auth debit waiting to clear. User must NOT get Premium
    // until Google flips this to paymentState=1 — otherwise a chargeback
    // would have already run by the time the cron expires the sub.
    mockDemoCheck(1);
    mockGooglePlayConfigured.mockReturnValue(true);
    mockGetSubscriptionInfo.mockResolvedValueOnce(
      validInfo({ paymentState: 0 })
    );

    const res = await request(app)
      .post("/api/purchases/verify")
      .set("Authorization", `Bearer ${userAJwt}`)
      .send({
        store: "google",
        purchaseToken: "tok-abc",
        productId: "skinkeeper_pro_monthly",
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("INVALID_PAYMENT_STATE_0");
    expect(mockPoolConnect).not.toHaveBeenCalled();
  });

  it("Google API returns 410 / SUBSCRIPTION_NOT_FOUND → 400 SUBSCRIPTION_NOT_FOUND", async () => {
    mockDemoCheck(1);
    mockGooglePlayConfigured.mockReturnValue(true);
    mockGetSubscriptionInfo.mockResolvedValueOnce({
      error: {
        retryable: false,
        code: "SUBSCRIPTION_NOT_FOUND",
        message: "Subscription gone (410)",
      },
    });

    const res = await request(app)
      .post("/api/purchases/verify")
      .set("Authorization", `Bearer ${userAJwt}`)
      .send({
        store: "google",
        purchaseToken: "tok-stale",
        productId: "skinkeeper_pro_monthly",
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("SUBSCRIPTION_NOT_FOUND");
    expect(mockPoolConnect).not.toHaveBeenCalled();
  });

  it("cross-user replay: user A's valid receipt + user B submitter → 400 RECEIPT_USER_MISMATCH (no DB lock taken)", async () => {
    // Defense-in-depth check: even if some bug let user-binding through,
    // CRIT-1/2 (purchase_receipts UNIQUE + FOR UPDATE) would still 409.
    // But the check should fire BEFORE we ever take the row lock —
    // otherwise the attacker could probe transaction id existence.
    mockDemoCheck(2);
    mockGooglePlayConfigured.mockReturnValue(true);
    mockGetSubscriptionInfo.mockResolvedValueOnce(
      validInfo({ obfuscatedExternalAccountId: "1" })
    );

    const res = await request(app)
      .post("/api/purchases/verify")
      .set("Authorization", `Bearer ${userBJwt}`)
      .send({
        store: "google",
        purchaseToken: "tok-victim",
        productId: "skinkeeper_pro_monthly",
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("RECEIPT_USER_MISMATCH");
    // Strong assertion: pool.connect() means activatePremium ran. The
    // user-binding check MUST short-circuit before that. Without this
    // assertion a future refactor could swallow the rejection inside
    // activatePremium and we'd never know.
    expect(mockPoolConnect).not.toHaveBeenCalled();
  });

  it("/restore with mismatched user-binding → 400 RECEIPT_USER_MISMATCH", async () => {
    // /restore must enforce the same guard — without it, an attacker who
    // knew about the /verify protection would just call /restore instead.
    mockDemoCheck(2);
    mockGooglePlayConfigured.mockReturnValue(true);
    mockGetSubscriptionInfo.mockResolvedValueOnce(
      validInfo({ obfuscatedExternalAccountId: "1" })
    );

    const res = await request(app)
      .post("/api/purchases/restore")
      .set("Authorization", `Bearer ${userBJwt}`)
      .send({
        store: "google",
        purchaseToken: "tok-victim",
        productId: "skinkeeper_pro_monthly",
      });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("RECEIPT_USER_MISMATCH");
    expect(mockPoolConnect).not.toHaveBeenCalled();
  });
});
