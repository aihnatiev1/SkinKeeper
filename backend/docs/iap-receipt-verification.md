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
