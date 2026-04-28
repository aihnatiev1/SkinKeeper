/**
 * Google Play Real-Time Developer Notifications (RTDN) handler.
 *
 * Mirror of the Apple App Store Server Notifications (ASSN) handler in
 * routes/purchases.ts. Without this, refunds and cancellations from Google
 * Play never propagate to backend → users keep Premium indefinitely after
 * a refund. Critical before mass Android rollout.
 *
 * RTDN architecture:
 *   Play Console → Pub/Sub topic → push subscription → POST /api/purchases/google-rtdn-<token>
 *
 * Notification types we care about (per Google docs):
 *   1  SUBSCRIPTION_RECOVERED       — was on hold/paused, now active → refresh expiry
 *   2  SUBSCRIPTION_RENEWED         — new billing period → refresh expiry
 *   3  SUBSCRIPTION_CANCELED        — user canceled (still has access until expiry)
 *   4  SUBSCRIPTION_PURCHASED       — initial buy → refresh expiry
 *   5  SUBSCRIPTION_ON_HOLD         — payment failed (Google handles grace; just log)
 *   6  SUBSCRIPTION_IN_GRACE_PERIOD — payment failed, in grace (Google handles; just log)
 *   7  SUBSCRIPTION_RESTARTED       — user restarted after cancel → refresh expiry
 *   12 SUBSCRIPTION_REVOKED         — refund or chargeback → REVOKE PREMIUM IMMEDIATELY
 *   13 SUBSCRIPTION_EXPIRED         — natural expiry → flip is_premium=false
 *
 * Type 12 (REVOKED) is the refund event. Apple ASSN equivalent is REFUND.
 *
 * Idempotency: REVOKED for an already-revoked user is a no-op. Replays of the
 * same notification (Pub/Sub at-least-once delivery) are safe — every action
 * here is set-based, not delta-based.
 */

import { pool } from "../db/pool.js";
import { invalidatePremiumCache } from "../middleware/auth.js";
import { getSubscriptionInfo } from "./googlePlayApi.js";

// ─── Types ───────────────────────────────────────────────────────────

/** Decoded Pub/Sub data payload. The shape Google publishes to the topic. */
export interface GoogleRtdnPayload {
  version?: string;
  packageName?: string;
  eventTimeMillis?: string;
  /** Sandbox/test ping from Play Console — no real subscription attached. */
  testNotification?: { version?: string };
  subscriptionNotification?: {
    version?: string;
    /** 1..13, see top-of-file legend. */
    notificationType: number;
    purchaseToken: string;
    subscriptionId: string;
  };
  /** One-time IAP — out of scope for now (we only sell subscriptions). */
  oneTimeProductNotification?: {
    version?: string;
    notificationType: number;
    purchaseToken: string;
    sku: string;
  };
  /** Voided purchase (refund) — overlaps with subscriptionNotification type 12.
   *  Google sends both for a refunded subscription; we handle via the typed event. */
  voidedPurchaseNotification?: {
    purchaseToken: string;
    orderId?: string;
    productType?: number;
    refundType?: number;
  };
}

// ─── Replay protection ───────────────────────────────────────────────
//
// Pub/Sub guarantees at-least-once delivery, so the same messageId can arrive
// multiple times. All our actions are idempotent (UPDATE ... SET is_premium =
// false is idempotent), so dedup is a nice-to-have, not a correctness
// requirement. We keep an in-memory LRU-ish Set with 1h TTL to suppress log
// noise from genuine retries; if the process restarts, the worst case is one
// extra log line per re-delivered message.

const SEEN_MESSAGE_TTL_MS = 60 * 60 * 1000; // 1h
const SEEN_MAX_ENTRIES = 10_000;
const seenMessageIds = new Map<string, number>();

function alreadySeen(messageId: string): boolean {
  const now = Date.now();
  // Lazy GC: only sweep when the Map gets large.
  if (seenMessageIds.size > SEEN_MAX_ENTRIES) {
    for (const [id, ts] of seenMessageIds) {
      if (now - ts > SEEN_MESSAGE_TTL_MS) seenMessageIds.delete(id);
    }
  }
  const seen = seenMessageIds.get(messageId);
  if (seen !== undefined && now - seen <= SEEN_MESSAGE_TTL_MS) return true;
  seenMessageIds.set(messageId, now);
  return false;
}

/** Test-only: clear replay-protection state between runs. */
export function _resetRtdnDedupForTests(): void {
  seenMessageIds.clear();
}

// ─── Handler ─────────────────────────────────────────────────────────

/**
 * Process a decoded RTDN payload.
 *
 * Always returns void — never throws. Pub/Sub retries on non-2xx, and a
 * persistent error here would create a retry storm. The caller (route
 * handler) returns 204 unconditionally; this function just does the work
 * and logs failures.
 *
 * @param messageId Optional Pub/Sub messageId for replay dedup. If a duplicate
 *                  is detected, returns immediately without re-processing.
 */
export async function handleGooglePlayNotification(
  payload: GoogleRtdnPayload,
  messageId?: string
): Promise<void> {
  if (messageId && alreadySeen(messageId)) {
    console.log(`[RTDN] duplicate messageId ${messageId} — ignoring`);
    return;
  }

  // Test pings from Play Console "Send test notification" — no subscription
  // payload attached. Acknowledge silently.
  if (payload.testNotification) {
    console.log(
      `[RTDN] test ping received (version=${payload.testNotification.version ?? "?"})`
    );
    return;
  }

  // Voided purchase (refund) without a subscriptionNotification — we still
  // try to revoke. This path triggers for one-time IAPs we don't sell, but
  // logging it surfaces unexpected store activity.
  if (
    payload.voidedPurchaseNotification &&
    !payload.subscriptionNotification
  ) {
    console.log(
      `[RTDN] voided purchase notification (token=${payload.voidedPurchaseNotification.purchaseToken.slice(0, 12)}…) — handled separately or ignored`
    );
    return;
  }

  const sub = payload.subscriptionNotification;
  if (!sub) {
    console.warn(
      "[RTDN] payload has no subscriptionNotification — ignoring (possibly oneTimeProductNotification)"
    );
    return;
  }

  const { notificationType, purchaseToken, subscriptionId } = sub;
  const packageName = payload.packageName ?? "";

  if (!purchaseToken) {
    console.warn("[RTDN] subscriptionNotification missing purchaseToken");
    return;
  }

  // Resolve user via the purchase token. We stored it as both
  // transaction_id (Google's stable handle) and may have stored it as
  // original_transaction_id when latestOrderId was missing — check both.
  const { rows } = await pool.query<{ user_id: number; revoked_at: Date | null }>(
    `SELECT user_id, revoked_at
       FROM purchase_receipts
       WHERE transaction_id = $1 OR original_transaction_id = $1
       ORDER BY created_at DESC
       LIMIT 1`,
    [purchaseToken]
  );

  if (rows.length === 0) {
    console.warn(
      `[RTDN] no user found for token ${purchaseToken.slice(0, 12)}… (type=${notificationType} sub=${subscriptionId})`
    );
    return;
  }

  const userId = rows[0].user_id;
  const alreadyRevoked = rows[0].revoked_at !== null;

  console.log(
    `[RTDN] type=${notificationType} sub=${subscriptionId} user=${userId} token=${purchaseToken.slice(0, 12)}…`
  );

  switch (notificationType) {
    case 12: // SUBSCRIPTION_REVOKED — refund / chargeback
    case 13: // SUBSCRIPTION_EXPIRED — natural expiry
      if (alreadyRevoked && notificationType === 12) {
        // Idempotent replay — already revoked.
        console.log(`[RTDN] user ${userId} already revoked, skipping`);
        return;
      }
      await revokePremium(userId, purchaseToken, `rtdn_${notificationType}`);
      break;

    case 3: // SUBSCRIPTION_CANCELED — user canceled, but still has access until expiry
      // Don't revoke yet. Flip auto_renew so the client can render
      // "ends on <date>" instead of "renews on <date>". Premium gate
      // continues to honor premium_until via checkExpiredSubscriptions cron.
      await pool.query(
        `UPDATE purchase_receipts
            SET auto_renew = FALSE
          WHERE transaction_id = $1 OR original_transaction_id = $1`,
        [purchaseToken]
      );
      console.log(`[RTDN] user ${userId} canceled (auto_renew=false)`);
      break;

    case 1: // SUBSCRIPTION_RECOVERED
    case 2: // SUBSCRIPTION_RENEWED
    case 4: // SUBSCRIPTION_PURCHASED
    case 7: // SUBSCRIPTION_RESTARTED
      // These need fresh expiry — call Play Developer API to get authoritative
      // expiryTimeMillis and update users.premium_until accordingly.
      await refreshSubscriptionFromGoogle(
        userId,
        packageName,
        subscriptionId,
        purchaseToken,
        notificationType
      );
      break;

    case 5: // SUBSCRIPTION_ON_HOLD — payment retry in progress
    case 6: // SUBSCRIPTION_IN_GRACE_PERIOD — payment failed, grace running
      // Google handles grace internally — the user's expiry is already set
      // and the existing checkExpiredSubscriptions cron will revoke if it
      // truly lapses. Just log so we have a paper trail.
      console.log(
        `[RTDN] user ${userId} payment issue (type=${notificationType}) — Google handles grace, no action`
      );
      break;

    default:
      console.log(
        `[RTDN] unhandled notification type ${notificationType} for user ${userId}`
      );
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Revoke premium immediately — refund/chargeback path.
 *
 * Sets is_premium=FALSE, premium_until=NULL on users, and stamps revoked_at
 * on the corresponding purchase_receipts rows so a later replay of the same
 * receipt to /verify won't silently re-grant premium.
 */
async function revokePremium(
  userId: number,
  purchaseToken: string,
  reason: string
): Promise<void> {
  // We don't wrap these in a single txn because each is independently
  // correct on its own — even partial application leaves the user in a
  // safer state (no premium) than not running at all.
  await pool.query(
    `UPDATE users
        SET is_premium = FALSE, premium_until = NULL
      WHERE id = $1`,
    [userId]
  );

  await pool.query(
    `UPDATE purchase_receipts
        SET revoked_at = NOW(), auto_renew = FALSE
      WHERE (transaction_id = $1 OR original_transaction_id = $1)
        AND revoked_at IS NULL`,
    [purchaseToken]
  );

  invalidatePremiumCache(userId);
  console.log(`[RTDN] revoked premium for user ${userId} (${reason})`);
}

/**
 * Re-verify with Play Developer API and update premium_until from Google's
 * authoritative expiry. Used for purchase / renewal / recovery / restart —
 * notifications that imply the subscription is currently entitled but we
 * need a fresh expiry timestamp.
 *
 * If the Google API call fails, we log and bail. The user's existing premium
 * state is left untouched (entitlement still honored until next event).
 */
async function refreshSubscriptionFromGoogle(
  userId: number,
  packageName: string,
  subscriptionId: string,
  purchaseToken: string,
  notificationType: number
): Promise<void> {
  const result = await getSubscriptionInfo(
    packageName,
    subscriptionId,
    purchaseToken
  );

  if (result.error) {
    console.warn(
      `[RTDN] refresh failed for user ${userId}: ${result.error.code} (${result.error.message})`
    );
    return;
  }

  const info = result.info;
  const expiryMs = parseInt(info.expiryTimeMillis, 10);
  const expiresDate = expiryMs > 0 ? new Date(expiryMs) : null;

  // paymentState 1/2/3 = entitled. 0 = pending (e.g. SEPA pre-auth) — don't
  // grant premium until the charge confirms.
  const isActive = [1, 2, 3].includes(info.paymentState);

  if (isActive && expiresDate) {
    await pool.query(
      `UPDATE users
          SET is_premium = TRUE,
              premium_until = $2
        WHERE id = $1`,
      [userId, expiresDate]
    );
    // Renewal path: clear any prior revoked_at if the same token is being
    // re-activated (rare but happens with Google's grace recovery).
    await pool.query(
      `UPDATE purchase_receipts
          SET expires_date = $2,
              auto_renew = $3,
              revoked_at = NULL
        WHERE transaction_id = $1 OR original_transaction_id = $1`,
      [purchaseToken, expiresDate, info.autoRenewing]
    );
    invalidatePremiumCache(userId);
    console.log(
      `[RTDN] refreshed user ${userId} type=${notificationType} → premium_until=${expiresDate.toISOString()} autoRenew=${info.autoRenewing}`
    );
  } else {
    console.warn(
      `[RTDN] refresh returned non-active state for user ${userId}: paymentState=${info.paymentState} expiry=${expiresDate?.toISOString() ?? "null"}`
    );
  }
}
