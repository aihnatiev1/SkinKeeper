import * as Sentry from "@sentry/node";
import { pool } from "../db/pool.js";
import { isAppleApiConfigured, getTransactionInfo } from "./appleStoreApi.js";
import {
  isGooglePlayApiConfigured,
  getSubscriptionInfo,
} from "./googlePlayApi.js";
import { invalidatePremiumCache } from "../middleware/auth.js";

// Product IDs — must match App Store Connect / Google Play Console
export const PRODUCTS = {
  monthly: "skinkeeper_pro_monthly",
  yearly: "skinkeeper_pro_yearly",
};

export const PRODUCT_IDS = [PRODUCTS.monthly, PRODUCTS.yearly];

interface VerifyResult {
  valid: boolean;
  productId: string;
  transactionId: string;
  originalTransactionId?: string;
  purchaseDate?: Date;
  expiresDate?: Date;
  isTrial?: boolean;
  error?: string;
}

// ---- Apple App Store Receipt Verification ----

export async function verifyAppleReceipt(
  receiptData: string
): Promise<VerifyResult> {
  try {
    const clientData = JSON.parse(receiptData);
    const transactionId = clientData.transactionId || clientData.id || "";

    // HIGH-4: an empty/missing transactionId silently slipped past the
    // user-binding check (FOR UPDATE on `transaction_id IN ('','')` matches
    // any pre-existing empty row but, crucially, lets the FIRST attacker
    // create one and lock everyone else out of receipt verification). Reject
    // up-front so this never reaches activatePremium.
    if (!transactionId) {
      return {
        valid: false,
        productId: clientData.productId || "",
        transactionId: "",
        error: "MISSING_TRANSACTION_ID",
      };
    }

    // Server-side validation via Apple App Store Server API
    if (isAppleApiConfigured()) {
      const info = await getTransactionInfo(transactionId);
      if (!info) {
        return {
          valid: false,
          productId: clientData.productId || "",
          transactionId,
          error: "Apple could not verify this transaction",
        };
      }

      if (info.revocationDate) {
        return {
          valid: false,
          productId: info.productId,
          transactionId: info.transactionId,
          error: "Transaction was revoked by Apple",
        };
      }

      if (!PRODUCT_IDS.includes(info.productId)) {
        return {
          valid: false,
          productId: info.productId,
          transactionId: info.transactionId,
          error: `Unknown product: ${info.productId}`,
        };
      }

      console.log(
        `[Purchase] Apple server-verified: ${info.productId} tx=${info.transactionId} env=${info.environment}`
      );

      return {
        valid: true,
        productId: info.productId,
        transactionId: info.transactionId,
        originalTransactionId: info.originalTransactionId,
        purchaseDate: new Date(info.purchaseDate),
        expiresDate: info.expiresDate ? new Date(info.expiresDate) : undefined,
        isTrial: false,
      };
    }

    // No server-side validation configured. In production this is a free-
    // premium vulnerability (any jailbroken client gets Pro), so fail closed.
    // Dev/test keeps the lenient path so local work and CI don't need real
    // App Store Connect keys.
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[Purchase] Apple API not configured — rejecting receipt in production"
      );
      return {
        valid: false,
        productId: clientData.productId || "",
        transactionId,
        error: "Receipt validation unavailable",
      };
    }

    console.warn(
      "[Purchase] Apple API not configured — trusting client receipt data (dev/test only)"
    );
    return {
      valid: true,
      productId: clientData.productId || "",
      transactionId,
      originalTransactionId: clientData.originalTransactionId || "",
      purchaseDate: clientData.purchaseDate
        ? new Date(clientData.purchaseDate)
        : new Date(),
      expiresDate: clientData.expiresDate
        ? new Date(clientData.expiresDate)
        : undefined,
      isTrial: clientData.offerType === 2,
    };
  } catch (err) {
    Sentry.captureException(err, {
      tags: { component: "iap", store: "apple" },
    });
    return {
      valid: false,
      productId: "",
      transactionId: "",
      error: "Invalid receipt data",
    };
  }
}

// ---- Google Play Receipt Verification ----

/**
 * Verify a Google Play subscription purchase server-side.
 *
 * CRIT-3 fix: previously this was a pure client-trust pass-through that
 * fabricated a 30/365-day expiry from the client-supplied product id. Any
 * Android user with `adb shell` access (or a misconfigured `NODE_ENV`)
 * could mint an unlimited free Premium subscription. Now we:
 *
 *   1. Fail-closed when the Google Play Developer API isn't configured,
 *      gated by the explicit `ALLOW_UNVERIFIED_RECEIPTS=1` env var (NOT
 *      `NODE_ENV` — misconfigured environments like "staging" or unset
 *      were the original bypass vector).
 *   2. Call `purchases.subscriptionsv2.get` server-to-server to validate
 *      the token against Google's records.
 *   3. Enforce user-binding via `obfuscatedExternalAccountId` — the
 *      Android client sets `PurchaseParam.applicationUserName` to the
 *      logged-in user id; if Google's record doesn't match, this is a
 *      cross-account replay attempt and we reject it.
 *   4. Reject pending payments (paymentState=0). A user mid-payment
 *      (e.g. waiting for a bank transfer to clear) must not get Premium
 *      until Google confirms the charge.
 *
 * @param expectedUserId The authenticated user submitting the receipt.
 *                       Compared against Google's
 *                       `obfuscatedExternalAccountId`. Pass `req.userId!`.
 */
export async function verifyGoogleReceipt(
  purchaseToken: string,
  productId: string,
  expectedUserId: number
): Promise<VerifyResult> {
  // HIGH-4 analog for Google: the Android client sometimes emits an empty
  // verificationData when an in-progress purchase is interrupted. Reject
  // up-front so the empty-string token never reaches the user-binding probe
  // (which would otherwise lock everyone out via empty-string match).
  if (!purchaseToken) {
    return {
      valid: false,
      productId,
      transactionId: "",
      error: "MISSING_PURCHASE_TOKEN",
    };
  }

  // Local-dev escape hatch. Explicit, separate from NODE_ENV. The original
  // bypass was `NODE_ENV !== "production"` — any value other than "production"
  // (including unset, "staging", "development", typos) granted premium.
  // ALLOW_UNVERIFIED_RECEIPTS is intentionally a different name and a strict
  // "1" check so it can NEVER be flipped on by accident in a deployed env.
  if (process.env.ALLOW_UNVERIFIED_RECEIPTS === "1") {
    console.warn(
      "[Purchase] verifyGoogleReceipt: ALLOW_UNVERIFIED_RECEIPTS=1 — accepting client-supplied token (LOCAL TESTING ONLY)"
    );
    return {
      valid: true,
      productId,
      transactionId: purchaseToken,
      originalTransactionId: purchaseToken,
      purchaseDate: new Date(),
      expiresDate: new Date(
        Date.now() +
          (productId === PRODUCTS.yearly
            ? 365 * 24 * 60 * 60 * 1000
            : 30 * 24 * 60 * 60 * 1000)
      ),
    };
  }

  if (!isGooglePlayApiConfigured()) {
    console.error(
      "[Purchase] Google Play API not configured AND ALLOW_UNVERIFIED_RECEIPTS not set — failing closed"
    );
    return {
      valid: false,
      productId,
      transactionId: purchaseToken,
      error: "CONFIGURATION_ERROR",
    };
  }

  const packageName =
    process.env.GOOGLE_PLAY_PACKAGE_NAME ?? "com.skinkeeper.app";

  const result = await getSubscriptionInfo(
    packageName,
    productId,
    purchaseToken
  );

  if (result.error) {
    return {
      valid: false,
      productId,
      transactionId: purchaseToken,
      error: result.error.code,
    };
  }

  const info = result.info;

  // CRIT-3 user-binding. The Android client must set
  // `PurchaseParam.applicationUserName = String(userId)` — the
  // in_app_purchase package maps that into Google's
  // `obfuscatedExternalAccountId`. If empty, the client didn't bind, which
  // means an attacker could replay this receipt under a different user.
  // If non-empty but mismatched, it's an explicit cross-account replay.
  if (!info.obfuscatedExternalAccountId) {
    console.warn(
      `[Purchase] Google receipt missing obfuscatedExternalAccountId (user=${expectedUserId} tx=${purchaseToken.slice(0, 12)}…)`
    );
    return {
      valid: false,
      productId,
      transactionId: purchaseToken,
      error: "RECEIPT_NOT_BOUND",
    };
  }
  if (info.obfuscatedExternalAccountId !== String(expectedUserId)) {
    console.warn(
      `[Purchase] Google receipt user-binding mismatch: expected=${expectedUserId} got=${info.obfuscatedExternalAccountId} tx=${purchaseToken.slice(0, 12)}…`
    );
    return {
      valid: false,
      productId,
      transactionId: purchaseToken,
      error: "RECEIPT_USER_MISMATCH",
    };
  }

  // paymentState: 1 = received, 2 = free trial, 3 = pending deferred upgrade.
  // 0 = pending (e.g. SEPA / pre-authorized debit waiting to clear) — must
  // NOT grant Premium until the charge confirms.
  if (![1, 2, 3].includes(info.paymentState)) {
    return {
      valid: false,
      productId,
      transactionId: purchaseToken,
      error: `INVALID_PAYMENT_STATE_${info.paymentState}`,
    };
  }

  // Verify the productId the server returned matches what the client claimed.
  // If lineItems is empty (shouldn't happen for a valid sub) we let it pass
  // — the user-binding check above is the strong guard.
  if (
    info.lineItems.length > 0 &&
    !info.lineItems.some((li) => li.productId === productId)
  ) {
    return {
      valid: false,
      productId,
      transactionId: purchaseToken,
      error: "PRODUCT_ID_MISMATCH",
    };
  }

  if (!PRODUCT_IDS.includes(productId)) {
    return {
      valid: false,
      productId,
      transactionId: purchaseToken,
      error: `Unknown product: ${productId}`,
    };
  }

  const expiryMs = parseInt(info.expiryTimeMillis, 10);
  const expiresDate = expiryMs > 0 ? new Date(expiryMs) : undefined;

  console.log(
    `[Purchase] Google server-verified: ${productId} tx=${purchaseToken.slice(0, 12)}… user=${expectedUserId} state=${info.paymentState}`
  );

  return {
    valid: true,
    productId,
    // The purchase token IS the unique transaction id on Google's side —
    // a single token represents the subscription record across renewals.
    transactionId: purchaseToken,
    // For Google, latestOrderId (surfaced as lineItems[0].purchaseId) plays
    // the role Apple's originalTransactionId does — the stable handle
    // across renewals. Fall back to the purchase token if absent so the
    // receipt-replay guard in activatePremium still has a value to match on.
    originalTransactionId:
      info.lineItems[0]?.purchaseId || purchaseToken,
    purchaseDate: new Date(),
    expiresDate,
    isTrial: info.paymentState === 2,
  };
}

// ---- Save Receipt & Activate Premium ----

/**
 * Thrown when the receipt is already linked to a different user.
 *
 * CRIT-1/2 guard: an attacker who replays another user's purchased receipt
 * (or a renewal of it) must not be able to graft Premium onto their own
 * account. We match on BOTH transaction_id and original_transaction_id —
 * Apple renewals create new transaction_ids but reuse the original, so a
 * naive check on transaction_id alone leaves the renewal vector wide open.
 *
 * Same-user resubmits are idempotent (no error thrown).
 */
export class ReceiptAlreadyLinkedError extends Error {
  code = "RECEIPT_ALREADY_LINKED";
  constructor(message = "Receipt already linked to another account") {
    super(message);
    this.name = "ReceiptAlreadyLinkedError";
  }
}

export async function activatePremium(
  userId: number,
  store: "apple" | "google" | "stripe",
  result: VerifyResult
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // CRIT-1/2: prevent receipt-replay across users. Lock matching rows
    // FOR UPDATE inside the same txn so a concurrent verify by another
    // user can't sneak past this check (TOCTOU). We match on both
    // transaction_id AND original_transaction_id because Apple renewals
    // mint a fresh transaction_id but keep the original — without the
    // OR-original branch, an attacker submitting a renewal of someone
    // else's subscription would slip through.
    const tx = result.transactionId;
    const origTx = result.originalTransactionId || tx;
    const { rows: existing } = await client.query<{ user_id: number }>(
      `SELECT user_id FROM purchase_receipts
        WHERE transaction_id IN ($1, $2)
           OR original_transaction_id IN ($1, $2)
        FOR UPDATE
        LIMIT 1`,
      [tx, origTx]
    );
    if (existing.length > 0 && existing[0].user_id !== userId) {
      // Rollback BEFORE throw so the UPDATE users SET is_premium=TRUE
      // below never runs — the attacker stays free-tier.
      await client.query("ROLLBACK");
      throw new ReceiptAlreadyLinkedError();
    }

    // Save receipt
    await client.query(
      `INSERT INTO purchase_receipts (user_id, store, product_id, transaction_id,
        original_transaction_id, purchase_date, expires_date, is_trial)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (transaction_id) DO NOTHING`,
      [
        userId,
        store,
        result.productId,
        result.transactionId,
        result.originalTransactionId || null,
        result.purchaseDate || new Date(),
        result.expiresDate || null,
        result.isTrial || false,
      ]
    );

    // Activate premium on user
    await client.query(
      `UPDATE users SET is_premium = TRUE, premium_until = $2 WHERE id = $1`,
      [userId, result.expiresDate || null]
    );

    await client.query("COMMIT");

    // requirePremium caches the is_premium flag for 5 min to avoid hitting
    // the DB on every gated request. Without an explicit invalidation here,
    // a user who was checked before the purchase would keep seeing 403 on
    // premium routes until the TTL expires.
    invalidatePremiumCache(userId);
  } catch (err) {
    // ReceiptAlreadyLinkedError already rolled back above; for any other
    // error, roll back here. Multiple ROLLBACKs are safe but noisy — we
    // detect the already-rolled-back path by the error type.
    if (!(err instanceof ReceiptAlreadyLinkedError)) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // pool may already have aborted the txn — swallow.
      }
      // Unexpected failures in premium activation are critical — the user paid
      // but may not have received their entitlement. Capture with high priority.
      Sentry.captureException(err, {
        level: "error",
        tags: { component: "iap", flow: "activation", store },
        extra: { userId, productId: result.productId, transactionId: result.transactionId },
      });
    }
    throw err;
  } finally {
    client.release();
  }
}

// ---- Check & Expire Subscriptions ----

export async function checkExpiredSubscriptions(): Promise<void> {
  const result = await pool.query<{ id: number }>(
    `UPDATE users SET is_premium = FALSE
     WHERE is_premium = TRUE
       AND premium_until IS NOT NULL
       AND premium_until < NOW()
     RETURNING id`
  );

  // HIGH-1: requirePremium caches `is_premium` for 5 min per user. Without
  // invalidating here, an expired user stays premium-on-cache for up to
  // 5 minutes after this cron runs — short window of free service, but
  // also a security audit ding. ASSN handler already does the same thing
  // for refunds/revokes; this brings the cron path to parity.
  //
  // Known limitation (see auth.ts comment): premiumCache is per-process,
  // so under PM2 cluster mode this only clears the worker that ran the
  // cron. Same caveat applies to the ASSN webhook — switching to Redis
  // is the long-term fix tracked separately.
  for (const row of result.rows) {
    invalidatePremiumCache(row.id);
  }

  if (result.rowCount && result.rowCount > 0) {
    console.log(
      `[Subscriptions] Expired ${result.rowCount} subscriptions`
    );
  }
}

// ---- Get User Subscription Status ----

export interface SubscriptionStatus {
  isPremium: boolean;
  premiumUntil: string | null;
  productId: string | null;
  store: string | null;
  isExpired: boolean;
  autoRenewing: boolean;
}

export async function getSubscriptionStatus(
  userId: number
): Promise<SubscriptionStatus> {
  const userRes = await pool.query(
    `SELECT is_premium, premium_until FROM users WHERE id = $1`,
    [userId]
  );

  if (userRes.rows.length === 0) {
    return {
      isPremium: false,
      premiumUntil: null,
      productId: null,
      store: null,
      isExpired: false,
      autoRenewing: false,
    };
  }

  const user = userRes.rows[0];

  // Get latest receipt
  const receiptRes = await pool.query(
    `SELECT product_id, store, expires_date
     FROM purchase_receipts
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId]
  );

  const receipt = receiptRes.rows[0];
  const premiumUntil = user.premium_until
    ? new Date(user.premium_until)
    : null;
  const isExpired = premiumUntil ? premiumUntil < new Date() : false;

  return {
    isPremium: user.is_premium,
    premiumUntil: user.premium_until,
    productId: receipt?.product_id || null,
    store: receipt?.store || null,
    isExpired,
    autoRenewing: user.is_premium && !isExpired,
  };
}
