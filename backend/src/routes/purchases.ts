import { Router, Request, Response } from "express";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SignedDataVerifier,
  Environment,
} from "@apple/app-store-server-library";
import { authMiddleware, AuthRequest, invalidatePremiumCache } from "../middleware/auth.js";
import {
  PRODUCT_IDS,
  PRODUCTS,
  verifyAppleReceipt,
  verifyGoogleReceipt,
  activatePremium,
  getSubscriptionStatus,
  ReceiptAlreadyLinkedError,
} from "../services/purchases.js";
import { getFeaturePreviews } from "../services/featurePreviews.js";
import { pool } from "../db/pool.js";

const APPLE_BUNDLE_ID =
  process.env.APPLE_BUNDLE_ID ?? "app.skinkeeper.store";
const APPLE_APP_APPLE_ID = process.env.APPLE_APP_APPLE_ID
  ? Number(process.env.APPLE_APP_APPLE_ID)
  : undefined;

// ─── ASSN v2 signature verifier ─────────────────────────────────────
// Certs load at module time (fail-fast if they're missing from disk).
// The SignedDataVerifier itself is lazy: in Production the library
// requires appAppleId, and if APPLE_APP_APPLE_ID isn't configured yet
// we don't want startup to crash — ASSN just stays disabled until it is.
const __dirname = dirname(fileURLToPath(import.meta.url));
const CERT_DIR = join(__dirname, "..", "..", "certs", "apple");
const APPLE_ROOT_CERTS: Buffer[] = [
  "AppleRootCA-G3.cer",
  "AppleRootCA-G2.cer",
  "AppleIncRootCertificate.cer",
].map((name) => readFileSync(join(CERT_DIR, name)));

const APPLE_ENV =
  process.env.NODE_ENV === "production"
    ? Environment.PRODUCTION
    : Environment.SANDBOX;

let appleNotificationVerifier: SignedDataVerifier | null = null;
let appleVerifierInitTried = false;
function getAppleNotificationVerifier(): SignedDataVerifier | null {
  if (appleNotificationVerifier) return appleNotificationVerifier;
  if (appleVerifierInitTried) return null;
  appleVerifierInitTried = true;
  try {
    appleNotificationVerifier = new SignedDataVerifier(
      APPLE_ROOT_CERTS,
      true, // enableOnlineChecks — verifies leaf cert isn't revoked
      APPLE_ENV,
      APPLE_BUNDLE_ID,
      APPLE_APP_APPLE_ID
    );
    return appleNotificationVerifier;
  } catch (err) {
    console.warn(
      "[ASSN] SignedDataVerifier unavailable:",
      (err as Error).message,
      "— set APPLE_APP_APPLE_ID in .env to enable Apple notifications"
    );
    return null;
  }
}

const router = Router();

// GET /api/purchases/products — return available product IDs
router.get("/products", (_req, res: Response) => {
  res.json({
    products: PRODUCT_IDS,
    monthly: "skinkeeper_pro_monthly",
    yearly: "skinkeeper_pro_yearly",
    pricing: {
      monthly: { price: 4.99, currency: "USD" },
      yearly: { price: 29.99, currency: "USD" },
    },
  });
});

// POST /api/purchases/verify — verify receipt and activate premium
router.post(
  "/verify",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { store, receiptData, purchaseToken, productId } = req.body;

      if (!store || !["apple", "google", "stripe"].includes(store)) {
        res.status(400).json({ error: "Invalid store (apple, google, or stripe)" });
        return;
      }

      // Stripe subscriptions are managed via /api/stripe/* endpoints
      if (store === "stripe") {
        res.status(400).json({ error: "Use /api/stripe/checkout for Stripe subscriptions" });
        return;
      }

      let result;

      if (store === "apple") {
        if (!receiptData) {
          res.status(400).json({ error: "Missing receiptData" });
          return;
        }
        result = await verifyAppleReceipt(receiptData);
      } else {
        if (!purchaseToken || !productId) {
          res
            .status(400)
            .json({ error: "Missing purchaseToken or productId" });
          return;
        }
        // CRIT-3: pass req.userId so verifyGoogleReceipt can match against
        // Google's obfuscatedExternalAccountId (set by the Android client
        // via PurchaseParam.applicationUserName). Without this binding,
        // user A could submit user B's receipt and steal their Premium.
        result = await verifyGoogleReceipt(
          purchaseToken,
          productId,
          req.userId!
        );
      }

      if (!result.valid) {
        res.status(400).json({ error: result.error || "Invalid receipt" });
        return;
      }

      try {
        await activatePremium(req.userId!, store, result);
      } catch (err) {
        if (err instanceof ReceiptAlreadyLinkedError) {
          // CRIT-1/2: receipt is already bound to a different user. Don't
          // grant Premium and don't leak which user owns it.
          console.warn(
            `[Purchase] User ${req.userId} attempted to verify a receipt linked to another account (tx=${result.transactionId})`
          );
          res.status(409).json({
            error: "Receipt already linked to another account",
            code: "RECEIPT_ALREADY_LINKED",
          });
          return;
        }
        throw err;
      }

      console.log(
        `[Purchase] User ${req.userId} activated premium via ${store}: ${result.productId}`
      );

      const status = await getSubscriptionStatus(req.userId!);
      res.json({ success: true, subscription: status });
    } catch (err) {
      console.error("Purchase verification error:", err);
      res.status(500).json({ error: "Failed to verify purchase" });
    }
  }
);

// GET /api/purchases/status — get subscription status
router.get(
  "/status",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const status = await getSubscriptionStatus(req.userId!);
      res.json(status);
    } catch (err) {
      console.error("Subscription status error:", err);
      res.status(500).json({ error: "Failed to get status" });
    }
  }
);

// GET /api/purchases/feature-previews — precomputed personalization data for
// the post-purchase tour ("Your top item: AK Redline | $15.50") and for the
// pre-purchase paywall teaser. Same payload, two consumers.
//
// Auth: requireAuth only — NOT requirePremium. Free users hit this when the
// paywall renders the teaser; premium users hit it when the tour starts.
//
// Response shape (consumed by Flutter mobile + web app paywall):
//   {
//     topItem: {                       // null if inventory is empty
//       marketHashName: string,
//       iconUrl:       string | null,
//       currentPriceUsd: number,       // USD, source = steam
//       trend7d:       string | null,  // "+8.2%" / "-3.1%", null if no history
//     } | null,
//     inventoryStats: {
//       totalItems:    number,         // SUM of stacks across active account
//       totalValueUsd: number,         // SUM(price * count) across active account
//       uniqueItems:   number,         // distinct market_hash_name
//     },
//     trackedItemsCount:           number,  // price_alerts WHERE is_watchlist
//     alertsActive:                number,  // price_alerts WHERE is_active AND NOT watchlist
//     potentialAutoSellCandidates: number,  // items where current ≥ 1.5× cost basis
//   }
//
// Caching: in-memory 5-min TTL keyed by userId. Mutating endpoints (inventory
// sync, alert/watchlist CRUD) should call invalidateFeaturePreviews(userId).
//
// Errors:
//   401 SESSION_EXPIRED — user has no linked Steam account
//   500                  — DB failure
router.get(
  "/feature-previews",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const previews = await getFeaturePreviews(req.userId!);
      res.json(previews);
    } catch (err) {
      const msg = (err as Error).message ?? "";
      if (msg.includes("No linked Steam accounts")) {
        res.status(401).json({
          error: "No active Steam account",
          code: "SESSION_EXPIRED",
        });
        return;
      }
      console.error("Feature previews error:", err);
      res.status(500).json({ error: "Failed to load feature previews" });
    }
  }
);

// POST /api/purchases/restore — restore purchases (re-verify existing receipts)
router.post(
  "/restore",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { store, receiptData, purchaseToken, productId } = req.body;

      // Match /verify validation: only apple/google routed through native
      // receipt verification. Stripe uses its own checkout flow and shouldn't
      // fall through to the Google branch (data-integrity bug — without this
      // check, store="stripe" would silently treat purchaseToken as a Google
      // receipt).
      if (store !== "apple" && store !== "google") {
        res.status(400).json({ error: "Invalid store (apple or google)" });
        return;
      }

      let result;
      if (store === "apple") {
        // Was permissive: missing receiptData would propagate `undefined`
        // into JSON.parse and bubble out as a 500. Reject up-front.
        if (!receiptData || typeof receiptData !== "string") {
          res.status(400).json({ error: "Missing receiptData" });
          return;
        }
        result = await verifyAppleReceipt(receiptData);
      } else {
        if (!purchaseToken || !productId) {
          res
            .status(400)
            .json({ error: "Missing purchaseToken or productId" });
          return;
        }
        // CRIT-3: same user-binding guard as /verify. /restore is the
        // alternate entry point for an existing subscription, so the same
        // protection applies — without it, an attacker could call /restore
        // with someone else's purchase token and adopt their Premium.
        result = await verifyGoogleReceipt(
          purchaseToken,
          productId,
          req.userId!
        );
      }

      if (!result.valid) {
        res.status(400).json({ error: result.error || "No valid purchase found" });
        return;
      }

      try {
        await activatePremium(req.userId!, store, result);
      } catch (err) {
        if (err instanceof ReceiptAlreadyLinkedError) {
          // CRIT-1/2: same guard as /verify — restore must not let user A
          // adopt user B's receipt by calling /restore instead of /verify.
          console.warn(
            `[Purchase] User ${req.userId} attempted to restore a receipt linked to another account (tx=${result.transactionId})`
          );
          res.status(409).json({
            error: "Receipt already linked to another account",
            code: "RECEIPT_ALREADY_LINKED",
          });
          return;
        }
        throw err;
      }

      const status = await getSubscriptionStatus(req.userId!);
      res.json({ success: true, subscription: status });
    } catch (err) {
      console.error("Restore error:", err);
      res.status(500).json({ error: "Failed to restore purchase" });
    }
  }
);

// POST /api/purchases/mock — DEV ONLY: activate premium without real purchase
// POST /api/purchases/mock-revoke — DEV ONLY: revoke premium
if (process.env.NODE_ENV !== "production") {
  router.post(
    "/mock",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      const productId = (req.body.productId as string) || PRODUCTS.yearly;
      const expiresDate = new Date(
        Date.now() +
          (productId === PRODUCTS.yearly
            ? 365 * 24 * 60 * 60 * 1000
            : 30 * 24 * 60 * 60 * 1000)
      );

      await activatePremium(req.userId!, "apple", {
        valid: true,
        productId,
        transactionId: `mock_${Date.now()}_${req.userId}`,
        purchaseDate: new Date(),
        expiresDate,
      });

      console.log(
        `[Purchase:mock] User ${req.userId} mock-activated ${productId}`
      );
      const status = await getSubscriptionStatus(req.userId!);
      res.json({ success: true, subscription: status });
    }
  );

  router.post(
    "/mock-revoke",
    authMiddleware,
    async (req: AuthRequest, res: Response) => {
      await pool.query(
        `UPDATE users SET is_premium = FALSE, premium_until = NULL WHERE id = $1`,
        [req.userId]
      );
      // Match the ASSN handler's behavior — without invalidation the dev
      // would still hit cached `is_premium=true` for up to 5 min and
      // think mock-revoke was broken.
      invalidatePremiumCache(req.userId!);
      console.log(`[Purchase:mock] User ${req.userId} mock-revoked premium`);
      res.json({ success: true });
    }
  );
}

// ─── Apple App Store Server Notifications v2 ────────────────────────
// https://developer.apple.com/documentation/appstoreservernotifications
//
// Apple POSTs here when subscription state changes — refunds, revocations,
// renewals, etc. Without this endpoint, refunded users stay Premium forever.
//
// Apple sends ONE field: signedPayload (JWS). We always return 200 after
// parsing so Apple doesn't retry storms on parse failures — all errors go
// to logs for investigation.
router.post(
  "/apple-notifications",
  async (req: Request, res: Response) => {
    try {
      const signedPayload = (req.body as { signedPayload?: string })
        .signedPayload;
      if (typeof signedPayload !== "string" || !signedPayload) {
        console.warn("[ASSN] Missing signedPayload");
        res.status(200).json({ ok: true });
        return;
      }

      const verifier = getAppleNotificationVerifier();
      if (!verifier) {
        console.warn("[ASSN] Verifier unavailable — notification ignored");
        res.status(200).json({ ok: true });
        return;
      }

      // Full chain verification against Apple's Root CAs. Throws on any
      // tamper — bundleId mismatch, bad signature, revoked leaf cert,
      // wrong environment. The library also verifies the inner
      // transaction JWS was signed by the same chain.
      let notification;
      try {
        notification = await verifier
          .verifyAndDecodeNotification(signedPayload);
      } catch (err) {
        console.error("[ASSN] Signature verification failed:", err);
        res.status(200).json({ ok: true });
        return;
      }

      const notificationType = notification.notificationType;
      const subtype = notification.subtype;
      const signedTransactionInfo = notification.data?.signedTransactionInfo;

      if (!notificationType || !signedTransactionInfo) {
        console.warn("[ASSN] Missing notificationType or transaction info");
        res.status(200).json({ ok: true });
        return;
      }

      let tx;
      try {
        tx = await verifier
          .verifyAndDecodeTransaction(signedTransactionInfo);
      } catch (err) {
        console.error("[ASSN] Transaction verification failed:", err);
        res.status(200).json({ ok: true });
        return;
      }

      const originalTransactionId = tx.originalTransactionId;
      const transactionId = tx.transactionId;
      const productId = tx.productId;
      const expiresDate = tx.expiresDate; // ms since epoch

      if (!originalTransactionId) {
        console.warn("[ASSN] Missing originalTransactionId");
        res.status(200).json({ ok: true });
        return;
      }

      // Resolve the user that owns this original transaction. If we don't
      // know the transaction, silently acknowledge — likely a stale or
      // unrelated notification.
      const { rows } = await pool.query(
        `SELECT user_id FROM purchase_receipts
         WHERE original_transaction_id = $1 OR transaction_id = $1
         ORDER BY created_at DESC
         LIMIT 1`,
        [originalTransactionId]
      );
      const userId = rows[0]?.user_id as number | undefined;

      console.log(
        `[ASSN] ${notificationType}${subtype ? `/${subtype}` : ""} ` +
          `tx=${transactionId} product=${productId} user=${userId ?? "unknown"}`
      );

      if (!userId) {
        res.status(200).json({ ok: true });
        return;
      }

      switch (notificationType) {
        case "REFUND":
        case "REVOKE":
          // User got a refund OR family-shared subscription was revoked.
          // Either way, pull Premium immediately.
          await pool.query(
            `UPDATE users SET is_premium = FALSE, premium_until = NULL WHERE id = $1`,
            [userId]
          );
          invalidatePremiumCache(userId);
          console.log(
            `[ASSN] Revoked premium for user ${userId} (tx=${originalTransactionId})`
          );
          break;

        case "DID_RENEW":
          // New billing period — extend expiry.
          if (expiresDate) {
            await pool.query(
              `UPDATE users SET is_premium = TRUE, premium_until = $2 WHERE id = $1`,
              [userId, new Date(expiresDate)]
            );
            invalidatePremiumCache(userId);
          }
          break;

        case "EXPIRED":
        case "GRACE_PERIOD_EXPIRED":
          // Natural expiry — checkExpiredSubscriptions cron already covers
          // this path, but flip it now so the user sees the gate on next
          // request instead of waiting up to an hour.
          await pool.query(
            `UPDATE users SET is_premium = FALSE WHERE id = $1`,
            [userId]
          );
          invalidatePremiumCache(userId);
          break;

        // Other types (DID_CHANGE_RENEWAL_STATUS, OFFER_REDEEMED, etc.)
        // are observational — the authoritative state is already captured
        // in DID_RENEW / REFUND / REVOKE / EXPIRED.
      }

      res.status(200).json({ ok: true });
    } catch (err) {
      console.error("[ASSN] Handler error:", err);
      // Always 200 so Apple doesn't hammer retries; we log and move on.
      res.status(200).json({ ok: true });
    }
  }
);

export default router;
