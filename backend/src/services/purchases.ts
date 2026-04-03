import { pool } from "../db/pool.js";
import { isAppleApiConfigured, getTransactionInfo } from "./appleStoreApi.js";

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

    // Server-side validation via Apple App Store Server API
    if (isAppleApiConfigured() && transactionId) {
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

    // Fallback: trust client data when Apple API not configured
    console.warn("[Purchase] Apple API not configured — trusting client receipt data (NOT safe for production)");
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
  } catch {
    return {
      valid: false,
      productId: "",
      transactionId: "",
      error: "Invalid receipt data",
    };
  }
}

// ---- Google Play Receipt Verification ----

export async function verifyGoogleReceipt(
  purchaseToken: string,
  productId: string
): Promise<VerifyResult> {
  // TODO: Implement Google Play Developer API validation when service account key is available.
  // https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptions
  console.warn("[Purchase] Google receipt not server-verified — no credentials configured");

  try {
    return {
      valid: true,
      productId,
      transactionId: purchaseToken,
      purchaseDate: new Date(),
      // Google subscriptions: calculate expiry based on product
      expiresDate: new Date(
        Date.now() +
          (productId === PRODUCTS.yearly
            ? 365 * 24 * 60 * 60 * 1000
            : 30 * 24 * 60 * 60 * 1000)
      ),
    };
  } catch {
    return {
      valid: false,
      productId: "",
      transactionId: "",
      error: "Invalid purchase token",
    };
  }
}

// ---- Save Receipt & Activate Premium ----

export async function activatePremium(
  userId: number,
  store: "apple" | "google" | "stripe",
  result: VerifyResult
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

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
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// ---- Check & Expire Subscriptions ----

export async function checkExpiredSubscriptions(): Promise<void> {
  const result = await pool.query(
    `UPDATE users SET is_premium = FALSE
     WHERE is_premium = TRUE
       AND premium_until IS NOT NULL
       AND premium_until < NOW()
     RETURNING id`
  );

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
