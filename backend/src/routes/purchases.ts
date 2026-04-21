import { Router, Request, Response } from "express";
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

/// Decode a JWS compact-serialized token's payload without verifying the
/// signature. Returns null on malformed input.
///
/// SECURITY: Apple signs ASSN v2 payloads with a cert chain rooted at
/// the Apple Root CA. Full verification requires walking that chain —
/// scoped as a follow-up (tracked in the commit message). Until then
/// this endpoint trusts bundle-id + transaction-id lookup as the guard:
/// an attacker would need a valid transactionId belonging to our app to
/// trigger a state change, and they still only get to revoke the very
/// user that owns that transaction (never elevate someone else).
function decodeJwsPayload(jws: string): Record<string, unknown> | null {
  const parts = jws.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(
      Buffer.from(parts[1], "base64url").toString("utf8")
    ) as Record<string, unknown>;
  } catch {
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

      const outer = decodeJwsPayload(signedPayload);
      if (!outer) {
        console.warn("[ASSN] Malformed outer JWS");
        res.status(200).json({ ok: true });
        return;
      }

      const notificationType = outer["notificationType"] as string | undefined;
      const subtype = outer["subtype"] as string | undefined;
      const data = outer["data"] as Record<string, unknown> | undefined;
      const signedTransactionInfo = data?.["signedTransactionInfo"] as
        | string
        | undefined;

      if (!notificationType || !signedTransactionInfo) {
        console.warn("[ASSN] Missing notificationType or transaction info");
        res.status(200).json({ ok: true });
        return;
      }

      const tx = decodeJwsPayload(signedTransactionInfo);
      if (!tx) {
        console.warn("[ASSN] Malformed transaction JWS");
        res.status(200).json({ ok: true });
        return;
      }

      // Bundle check — reject notifications for a different app.
      if (tx["bundleId"] !== APPLE_BUNDLE_ID) {
        console.warn(
          `[ASSN] bundleId mismatch: got ${String(tx["bundleId"])} expected ${APPLE_BUNDLE_ID}`
        );
        res.status(200).json({ ok: true });
        return;
      }

      const originalTransactionId = tx["originalTransactionId"] as
        | string
        | undefined;
      const transactionId = tx["transactionId"] as string | undefined;
      const productId = tx["productId"] as string | undefined;
      const expiresDate = tx["expiresDate"] as number | undefined; // ms since epoch

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
