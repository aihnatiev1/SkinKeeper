/**
 * Google Play Developer API client.
 *
 * Validates Android in-app subscription purchases server-side using the
 * Google Play Developer API. Mirrors the Apple App Store Server API client
 * (`appleStoreApi.ts`) so /verify and /restore can hand off to either store
 * with consistent shape and consistent guarantees.
 *
 * Auth: a Google Cloud service account JSON, base64-encoded into
 * `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. Base64 is used for safer .env transport
 * (no escaping headaches with embedded quotes/newlines from the JSON key).
 *
 * API choice: Subscriptions v2 (`purchases.subscriptionsv2.get`). v2 returns
 * a richer `SubscriptionPurchaseV2` resource that consolidates renewal and
 * payment state across `lineItems`. v3 (legacy `purchases.subscriptions.get`)
 * still works but only handles a single subscription product per call and
 * its `paymentState`/`expiryTimeMillis` semantics are slightly different.
 * We use v2 for parity with Apple StoreKit 2 (which also reports per-line
 * item info) and so we get `obfuscatedExternalAccountId` (the v2 rename of
 * `obfuscatedAccountId`) — that field is the CRIT-3 user-binding key.
 *
 * Required env:
 *   - GOOGLE_PLAY_SERVICE_ACCOUNT_JSON: base64-encoded service account key
 *   - GOOGLE_PLAY_PACKAGE_NAME: Android package name (defaults to com.skinkeeper.app)
 */

import { google, androidpublisher_v3 } from "googleapis";

// ─── Config ──────────────────────────────────────────────────────────

const PACKAGE_NAME =
  process.env.GOOGLE_PLAY_PACKAGE_NAME ?? "com.skinkeeper.app";

function getServiceAccountKey(): Record<string, unknown> | null {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON;
  if (!raw) return null;
  try {
    // Support both base64-encoded JSON (preferred — no escaping issues in .env)
    // and raw JSON (e.g. mounted via a secret manager that already decodes).
    const decoded = raw.trim().startsWith("{")
      ? raw
      : Buffer.from(raw, "base64").toString("utf8");
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch (err) {
    console.error(
      "[GooglePlay] Failed to parse GOOGLE_PLAY_SERVICE_ACCOUNT_JSON:",
      (err as Error).message
    );
    return null;
  }
}

/** Returns true iff the service account env var is configured AND parseable. */
export function isGooglePlayApiConfigured(): boolean {
  return getServiceAccountKey() !== null;
}

// ─── Auth client (lazy, cached) ──────────────────────────────────────

// The googleapis JWT client caches and refreshes its access token internally,
// so we only need to construct it once per process. Constructing it earlier
// (at module load) would crash boot when the env var is unset — keep it lazy.
let cachedAndroidPublisher: androidpublisher_v3.Androidpublisher | null = null;

function getAndroidPublisher(): androidpublisher_v3.Androidpublisher {
  if (cachedAndroidPublisher) return cachedAndroidPublisher;

  const key = getServiceAccountKey();
  if (!key) {
    throw new Error("Google Play API credentials not configured");
  }

  const auth = new google.auth.JWT({
    email: key["client_email"] as string,
    key: key["private_key"] as string,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });

  cachedAndroidPublisher = google.androidpublisher({ version: "v3", auth });
  return cachedAndroidPublisher;
}

// ─── Types ───────────────────────────────────────────────────────────

/**
 * Normalized subscription info — Apple-equivalent shape so callers don't
 * branch on store. `paymentState` keeps Google's numeric semantics because
 * the caller needs to differentiate pending (0) vs received (1) vs free
 * trial (2) vs deferred upgrade (3).
 */
export interface GoogleSubscriptionInfo {
  /** Stable purchase token (echoed back from input — same token = same record server-side). */
  purchaseToken: string;
  /** 0 = pending, 1 = received, 2 = free trial, 3 = pending deferred upgrade.
   *  We treat 1, 2, 3 as valid; 0 is rejected upstream. */
  paymentState: number;
  /** Subscription expiry, ms since epoch. May be 0 if cancelled before activation. */
  expiryTimeMillis: string;
  /** True if Google will auto-charge for the next period. */
  autoRenewing: boolean;
  /**
   * CRIT-3 user-binding key. Set by the Android client via
   * `PurchaseParam.applicationUserName` → mapped by the in_app_purchase
   * package to Google's `obfuscatedExternalAccountId`. Empty = client did not
   * bind, which we treat as an unsafe receipt (cross-account replay possible).
   */
  obfuscatedExternalAccountId: string;
  /** v2 returns one entry per product — the first lineItem's purchaseId is
   *  what we use as `originalTransactionId` for renewal binding. */
  lineItems: Array<{ productId: string; purchaseId?: string }>;
}

/** Internal error categorization for verifyGoogleReceipt. */
export interface GooglePlayApiError {
  /** True if the failure is transient (5xx) and the client may retry. */
  retryable: boolean;
  /** Short error code for logging / response. */
  code: string;
  /** Optional message, never echoed to clients (may leak service account info). */
  message: string;
}

// ─── API ─────────────────────────────────────────────────────────────

/**
 * Fetch subscription info from Google Play.
 *
 * Returns `{ info }` on success, `{ error }` on failure. We don't throw —
 * verifyGoogleReceipt branches on the result and the caller never wants
 * a thrown axios/googleapis error escaping out.
 *
 * Idempotency: same (packageName, token) returns the same server-side
 * record on Google's end. Re-calling does NOT consume rate limit faster
 * than necessary (Google caches the response for ~5 min).
 */
export async function getSubscriptionInfo(
  packageName: string,
  productId: string,
  purchaseToken: string
): Promise<
  | { info: GoogleSubscriptionInfo; error?: undefined }
  | { info?: undefined; error: GooglePlayApiError }
> {
  let publisher: androidpublisher_v3.Androidpublisher;
  try {
    publisher = getAndroidPublisher();
  } catch (err) {
    return {
      error: {
        retryable: false,
        code: "NOT_CONFIGURED",
        message: (err as Error).message,
      },
    };
  }

  try {
    // v2 endpoint: purchases.subscriptionsv2.get(packageName, token).
    // Note: v2 does NOT take productId in the path — the response contains
    // lineItems with productId(s), so the caller validates the productId
    // matches what the client claimed.
    const { data } = await publisher.purchases.subscriptionsv2.get({
      packageName,
      token: purchaseToken,
    });

    // v2 response: SubscriptionPurchaseV2.
    // https://developers.google.com/android-publisher/api-ref/rest/v3/purchases.subscriptionsv2#SubscriptionPurchaseV2
    const lineItems = (data.lineItems ?? []).map((li) => ({
      productId: li.productId ?? "",
      purchaseId:
        // v2 doesn't return a separate purchaseId per line item — the global
        // latestOrderId acts as the originalTransactionId equivalent.
        data.latestOrderId ?? undefined,
    }));

    // Map subscriptionState → numeric paymentState for parity with v3 callers.
    // v2 strings:
    //   SUBSCRIPTION_STATE_ACTIVE → 1 (received)
    //   SUBSCRIPTION_STATE_IN_GRACE_PERIOD → 1 (still entitled)
    //   SUBSCRIPTION_STATE_ON_HOLD → 0 (pending recovery — treat as unpaid)
    //   SUBSCRIPTION_STATE_PAUSED → 0
    //   SUBSCRIPTION_STATE_CANCELED → 1 if expiry still in future (paid through period), else 0
    //   SUBSCRIPTION_STATE_EXPIRED → 0
    //   SUBSCRIPTION_STATE_PENDING → 0
    //   SUBSCRIPTION_STATE_UNSPECIFIED → 0
    // Free trial detection: lineItems[].offerDetails.offerId is set OR
    //   subscriptionState is ACTIVE with offerDetails indicating intro/trial.
    const state = data.subscriptionState ?? "SUBSCRIPTION_STATE_UNSPECIFIED";
    const isActive =
      state === "SUBSCRIPTION_STATE_ACTIVE" ||
      state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD";
    const isCancelledButPaid =
      state === "SUBSCRIPTION_STATE_CANCELED" &&
      !!data.lineItems?.[0]?.expiryTime &&
      new Date(data.lineItems[0].expiryTime).getTime() > Date.now();

    // Free trial detection: any lineItem offering an introductory phase.
    const isTrial = (data.lineItems ?? []).some(
      (li) => !!li.offerDetails?.offerId
    );

    let paymentState: number;
    if (!isActive && !isCancelledButPaid) {
      paymentState = 0;
    } else if (isTrial) {
      paymentState = 2;
    } else {
      paymentState = 1;
    }

    // Earliest expiry across line items — typically a single line item for
    // monthly/yearly subs, but be defensive in case of multi-product bundles.
    const expiries = (data.lineItems ?? [])
      .map((li) => li.expiryTime)
      .filter((t): t is string => !!t)
      .map((t) => new Date(t).getTime());
    const expiryTimeMillis =
      expiries.length > 0 ? String(Math.min(...expiries)) : "0";

    // The product the client claimed must match at least one line item.
    // Mismatched productId is suspicious (potential token swap) — let the
    // caller decide how to react; we just surface the lineItems as-is.
    if (
      productId &&
      !lineItems.some((li) => li.productId === productId) &&
      lineItems.length > 0
    ) {
      console.warn(
        `[GooglePlay] productId mismatch: client=${productId} server=${lineItems
          .map((l) => l.productId)
          .join(",")}`
      );
    }

    const info: GoogleSubscriptionInfo = {
      purchaseToken,
      paymentState,
      expiryTimeMillis,
      autoRenewing:
        state === "SUBSCRIPTION_STATE_ACTIVE" ||
        state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD",
      obfuscatedExternalAccountId:
        data.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? "",
      lineItems,
    };

    return { info };
  } catch (err) {
    const status = (err as { code?: number; response?: { status?: number } })
      .code ??
      (err as { response?: { status?: number } }).response?.status;

    // 410 Gone: the subscription was cancelled and the grace period has
    // elapsed. Treat as not-found — the receipt no longer represents
    // a valid entitlement.
    if (status === 410) {
      return {
        error: {
          retryable: false,
          code: "SUBSCRIPTION_NOT_FOUND",
          message: "Subscription gone (410)",
        },
      };
    }

    // 401/403: service account misconfigured (wrong key, package not bound,
    // missing API access). Operational issue, not the user's fault.
    if (status === 401 || status === 403) {
      console.error(
        `[GooglePlay] Auth error ${status} — check service account package binding`,
        (err as Error).message
      );
      return {
        error: {
          retryable: false,
          code: "AUTH_ERROR",
          message: `Service account auth failed (${status})`,
        },
      };
    }

    // 404: token doesn't match any known purchase — typically a forged or
    // already-consumed token.
    if (status === 404) {
      return {
        error: {
          retryable: false,
          code: "SUBSCRIPTION_NOT_FOUND",
          message: "Purchase token not found",
        },
      };
    }

    // 5xx: Google's side. Let the client retry.
    if (typeof status === "number" && status >= 500 && status < 600) {
      return {
        error: {
          retryable: true,
          code: "TRANSIENT",
          message: `Google Play API ${status}`,
        },
      };
    }

    console.error(
      "[GooglePlay] getSubscriptionInfo error:",
      (err as Error).message
    );
    return {
      error: {
        retryable: false,
        code: "VERIFICATION_FAILED",
        message: (err as Error).message,
      },
    };
  }
}

/** Test-only: reset the cached publisher. */
export function _resetGooglePlayClientForTests(): void {
  cachedAndroidPublisher = null;
}

export const _GOOGLE_PLAY_PACKAGE_NAME = PACKAGE_NAME;
