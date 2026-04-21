import { Router, Request, Response } from "express";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  SignedDataVerifier,
  Environment,
} from "@apple/app-store-server-library";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import {
  PRODUCT_IDS,
  PRODUCTS,
  verifyAppleReceipt,
  verifyGoogleReceipt,
  activatePremium,
  getSubscriptionStatus,
} from "../services/purchases.js";
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
        result = await verifyGoogleReceipt(purchaseToken, productId);
      }

      if (!result.valid) {
        res.status(400).json({ error: result.error || "Invalid receipt" });
        return;
      }

      await activatePremium(req.userId!, store, result);

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

// POST /api/purchases/restore — restore purchases (re-verify existing receipts)
router.post(
  "/restore",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { store, receiptData, purchaseToken, productId } = req.body;

      if (!store) {
        res.status(400).json({ error: "Missing store" });
        return;
      }

      let result;
      if (store === "apple") {
        result = await verifyAppleReceipt(receiptData);
      } else {
        result = await verifyGoogleReceipt(purchaseToken, productId);
      }

      if (!result.valid) {
        res.status(400).json({ error: "No valid purchase found" });
        return;
      }

      await activatePremium(req.userId!, store, result);

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
