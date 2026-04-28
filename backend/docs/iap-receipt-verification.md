# IAP Receipt Verification

Server-side validation of Apple and Google Play subscription purchases.
Implements CRIT-1 / CRIT-2 / CRIT-3 fixes from the security audit.

## Why server-side verification

A purchase confirmation from `in_app_purchase` on the device is **not**
proof of payment. A jailbroken iOS device or Android user with `adb shell`
can trivially fabricate the local IAP response. Without server-side
verification, every paying-customer SKU is also a free-tier giveaway.

We hand the receipt to Apple / Google directly, server-to-server, and only
flip `users.is_premium = TRUE` if their record matches.

## Flow

```
Flutter (in_app_purchase) ──┐
                            │  POST /api/purchases/verify
                            │  { store, receiptData|purchaseToken, productId }
                            ▼
                         backend
                            │
                            ├─ Apple: getTransactionInfo(transactionId)
                            │         → App Store Server API v1
                            │
                            └─ Google: getSubscriptionInfo(pkg, productId, token)
                                       → Play Developer API v3 (subscriptionsv2.get)
```

## CRIT-1 / CRIT-2: receipt user-binding (already shipped)

`activatePremium` in `purchases.ts` runs the receipt-replay guard inside a
transaction with `SELECT ... FOR UPDATE`. Matches on **both**
`transaction_id` and `original_transaction_id` so renewal vectors don't
slip through. Cross-user replay → `409 RECEIPT_ALREADY_LINKED`.

## CRIT-3: Google Play user-binding (this doc)

Apple's StoreKit 2 transaction info is signed by Apple and tied to the
Apple ID that bought it — the user-binding lives in the original purchase
chain, so the `purchase_receipts` UNIQUE constraint plus the
`SELECT ... FOR UPDATE` in `activatePremium` is enough.

Google Play does **not** stamp the user identity on the purchase record by
default. The `obfuscatedExternalAccountId` field is **opt-in**: the Android
client must populate it at purchase time via
`PurchaseParam.applicationUserName`. If the client skips it, the receipt
is "unbound" — anyone holding the purchase token can claim Premium.

### Backend enforcement

`verifyGoogleReceipt(purchaseToken, productId, expectedUserId)`:

1. Calls `purchases.subscriptionsv2.get(packageName, token)`.
2. Reads `externalAccountIdentifiers.obfuscatedExternalAccountId`.
3. Compares against `String(expectedUserId)` (the JWT-authenticated caller).
4. Mismatch → `RECEIPT_USER_MISMATCH`. Empty → `RECEIPT_NOT_BOUND`.

### Flutter enforcement

`lib/features/purchases/iap_service.dart`:

```dart
final purchaseParam = PurchaseParam(
  productDetails: product,
  applicationUserName: user.id.toString(),  // ← this populates obfuscatedExternalAccountId
);
```

Constraints from Google: `applicationUserName` ≤ 64 chars, **no PII**.
Plain numeric user id is fine — it's already an opaque DB row id, not a
Steam id or email.

## Env vars

```bash
# Required for production:
GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=  # base64-encoded service account JSON
GOOGLE_PLAY_PACKAGE_NAME=com.skinkeeper.app
APPLE_KEY_ID=                      # from App Store Connect
APPLE_ISSUER_ID=                   # from App Store Connect
APPLE_PRIVATE_KEY=                 # .p8 contents (PEM or base64)
APPLE_BUNDLE_ID=app.skinkeeper.store

# Local dev escape hatch — NEVER set in production:
ALLOW_UNVERIFIED_RECEIPTS=         # set to "1" to skip Apple+Google verification
```

### Why `ALLOW_UNVERIFIED_RECEIPTS` instead of `NODE_ENV !== "production"`

The original `NODE_ENV !== "production"` check was the CRIT-3 root cause:
any unset, typo'd, or non-prod-named env (`"staging"`, `"development"`,
empty) defaulted to "trust the client". That's the wrong default for any
deployed environment.

`ALLOW_UNVERIFIED_RECEIPTS=1` is opt-in, named for what it does, and
checked with strict equality. It's documented as local-only and there's
no defensible reason it should ever appear in a deployed env file.

## Failure modes

| Code | HTTP | Meaning |
|---|---|---|
| `MISSING_PURCHASE_TOKEN` | 400 | Empty token — client bug or interrupted purchase |
| `MISSING_TRANSACTION_ID` | 400 | (Apple) Empty transactionId — same |
| `CONFIGURATION_ERROR` | 400 | Service account env not configured AND no escape hatch — operational issue |
| `SUBSCRIPTION_NOT_FOUND` | 400 | 404 / 410 from Google — token unknown or grace-elapsed |
| `RECEIPT_NOT_BOUND` | 400 | Google record has empty `obfuscatedExternalAccountId` — client didn't pass `applicationUserName` |
| `RECEIPT_USER_MISMATCH` | 400 | Google record's bound user ≠ caller — replay attempt |
| `RECEIPT_ALREADY_LINKED` | 409 | Receipt is already linked to a different user (CRIT-1/2 guard) |
| `INVALID_PAYMENT_STATE_<n>` | 400 | Pending payment (e.g. SEPA pre-auth not cleared) |
| `PRODUCT_ID_MISMATCH` | 400 | Server returned a different product than client claimed — token swap |
| `AUTH_ERROR` | 400 | Service account misconfigured (401/403 from Google) |
| `TRANSIENT` | 400 | 5xx from Google — client may retry |
| `VERIFICATION_FAILED` | 400 | Anything else — see logs |

`AUTH_ERROR` and `CONFIGURATION_ERROR` are operational; alert on them
(they signal the deploy is broken, not a malicious user).

## Production deployment checklist

1. **Service account creation** (one-time):
   - Google Cloud Console → IAM & Admin → Service Accounts → Create.
   - No project roles needed at the GCP level.
   - Create JSON key, download.
2. **Bind to Play Console**:
   - Play Console → Settings → API access → Link the service account.
   - Grant "View financial data" + "Manage orders and subscriptions".
3. **Enable APIs**: in GCP, enable "Google Play Android Developer API".
4. **Env vars**: `base64 -i service-account.json | tr -d '\n'` →
   `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`. Set `GOOGLE_PLAY_PACKAGE_NAME`.
5. **Smoke test post-deploy**: trigger a sandbox purchase from a test
   Android device (must use a Google account added to Play Console's
   "License testing" list to avoid being charged). Watch logs:
   `[Purchase] Google server-verified: ... user=<id> state=1`
6. **Confirm `ALLOW_UNVERIFIED_RECEIPTS` is unset** in the production
   PM2/systemd env (`pm2 env <id> | grep ALLOW_UNVER` should return empty).

## Google Play Real-Time Developer Notifications (RTDN)

**Why required**: without RTDN, refunds and cancellations from Google Play
never propagate to backend. A user who refunds keeps Premium indefinitely
because nothing flips `users.is_premium = FALSE`. This is the Android
analog of Apple's App Store Server Notifications.

### Architecture

```
Google Play ──→ Pub/Sub topic ──(push subscription)──→ POST /api/purchases/google-rtdn-<TOKEN>
                                                              │
                                                              └─ services/googlePlayRtdn.ts
                                                                 - REVOKED (12) → revoke premium
                                                                 - EXPIRED (13) → flip is_premium=false
                                                                 - CANCELED (3) → auto_renew=false
                                                                 - PURCHASED/RENEWED/etc → re-verify with Play API
```

### Notification types handled

| Type | Name | Action |
|---|---|---|
| 1 | RECOVERED | Re-verify with Play API, update premium_until |
| 2 | RENEWED | Re-verify with Play API, update premium_until |
| 3 | CANCELED | Set auto_renew=FALSE; user keeps access until expiry |
| 4 | PURCHASED | Re-verify with Play API, update premium_until |
| 5 | ON_HOLD | Log only — Google handles grace internally |
| 6 | IN_GRACE_PERIOD | Log only — Google handles grace |
| 7 | RESTARTED | Re-verify with Play API |
| **12** | **REVOKED** | **Refund/chargeback → REVOKE premium immediately** |
| 13 | EXPIRED | Natural expiry → flip is_premium=FALSE |

### One-time setup

1. **Create Pub/Sub topic** (GCP Console → Pub/Sub → Topics → Create):
   - Topic ID: `play-rtdn-skinkeeper`
   - Default settings; no schema needed.
2. **Grant Play Console publisher access on the topic**:
   - Pub/Sub topic → Permissions → Add principal:
     `google-play-developer-notifications@system.gserviceaccount.com`
   - Role: `Pub/Sub Publisher`.
3. **Create push subscription on the topic**:
   - Subscription ID: `play-rtdn-skinkeeper-push`
   - Delivery type: **Push**
   - Endpoint URL: `https://api.skinkeeper.store/api/purchases/google-rtdn-<TOKEN>`
     where `<TOKEN>` is the value of `GOOGLE_RTDN_PATH_TOKEN` env var
     (generate with `openssl rand -hex 32`).
   - Acknowledgement deadline: 30s
   - Retry policy: Exponential backoff (default).
4. **Link in Play Console**:
   - Play Console → Settings → Monetization setup → Real-time developer
     notifications.
   - Topic name: `projects/<gcp-project-id>/topics/play-rtdn-skinkeeper`
   - Click **Send test notification** — should hit `[RTDN] test ping received`
     in app logs within ~10s.

### Env vars

```bash
GOOGLE_RTDN_PATH_TOKEN=  # required in production; openssl rand -hex 32
```

If unset in production, the route mounts at `/api/purchases/google-rtdn-dev`
and a warning is logged on boot. Anyone who can guess the path can spoof
revoke events — **always set this in deployed envs**.

### Verifying a refund actually revoked premium

After processing a refund in Play Console:

```sql
SELECT u.id, u.is_premium, u.premium_until, pr.revoked_at, pr.auto_renew
FROM users u
JOIN purchase_receipts pr ON pr.user_id = u.id
WHERE pr.transaction_id = '<purchase_token>';
```

Expected after RTDN type 12:
- `is_premium = FALSE`
- `premium_until = NULL`
- `revoked_at IS NOT NULL`
- `auto_renew = FALSE`

App logs should show:
```
[RTDN] type=12 sub=skinkeeper_pro_monthly user=<id> token=<first 12 chars>…
[RTDN] revoked premium for user <id> (rtdn_12)
```

### Path token vs OIDC verification

For MVP we authenticate Pub/Sub pushes by path token (32-char hex appended
to the URL). Pub/Sub never sends Bearer tokens, but it CAN sign each push
with an OIDC token from a service account configured on the subscription —
verifying that token against Google's JWKS is the harder upgrade path. Tracked
separately; the path token is sufficient as long as the URL is treated as
secret-equivalent (no logging, no public CI dumps).

### Replay protection

The handler dedupes by Pub/Sub `messageId` in an in-memory Map (1h TTL,
max 10k entries). Pub/Sub guarantees at-least-once delivery so duplicates
are expected. All actions are independently idempotent (set-based UPDATEs),
so the dedup is purely log-noise reduction — losing it across a process
restart is fine.

### Failure modes

| Symptom | Likely cause |
|---|---|
| 404 on Pub/Sub deliveries | `GOOGLE_RTDN_PATH_TOKEN` mismatch between Pub/Sub URL and env var |
| `[RTDN] no user found for token …` | Receipt was never stored via /verify (user never linked sub to backend) |
| `[RTDN] refresh failed for user X: AUTH_ERROR` | Service account lost Play Console binding — re-grant in Play Console |
| Premium not revoked after refund | Check Pub/Sub subscription metrics → "delivery attempts"; ack deadline hit (handler too slow) |
