# Feature Flags & Controlled Rollout

Backend infrastructure for gradually shipping premium features (P9 of premium-upgrade plan).

## Why

Decoupling "is this user premium" (entitlement) from "is this feature enabled for this user" (rollout). Even paying users may need to wait their turn for newly-shipped features that are risky (`auto_sell` writes to Steam) or simply unproven at scale (`smart_alerts`, `tour`).

Lets us:

- **Kill** a misbehaving feature for everyone in one env var change (no deploy).
- **Canary** a new feature to N% of users, ramp gradually.
- **Override** per-user (QA accounts, beta testers, refund cases).

## Storage

```
users.feature_flags JSONB NOT NULL DEFAULT '{}'
```

`{}` (empty) means "no overrides" — the user gets the canary/kill-switch resolution. Setting `{"auto_sell": true}` is an explicit opt-in that BYPASSES canary; setting `{"auto_sell": false}` is an explicit opt-out.

GIN index `idx_users_feature_flags` for future "find all users with flag X" queries.

## Available flags

| Flag | Owner phase | Notes |
|------|-------------|-------|
| `auto_sell` | P3-P4 | Auto-sell rules; safety-critical (writes to Steam) |
| `smart_alerts` | P5-P7 | Smart alert types (bargain, sellNow, arbitrage) |
| `tour` | P8 | Onboarding tour after first premium activation |

Flag names are lowercase `snake_case`. To add a new flag, edit `FLAG_NAMES` in `src/services/featureFlags.ts` and document it here.

## Resolution precedence (high → low)

1. **Kill switch** — `KILL_<FLAG>=1` env var. Forces `false` for ALL users.
2. **User override** — `users.feature_flags[<flag>]` is `true` or `false`. Bypasses canary.
3. **Canary** — `CANARY_<FLAG>_PCT` env var (0–100). User's deterministic bucket
   (`sha256(userId) % 100`) compared against pct.
4. **Default** — `false`.

## Env vars

```bash
# Kill switches (any of '1', 'true' kills the feature globally)
KILL_AUTO_SELL=
KILL_SMART_ALERTS=
KILL_TOUR=

# Canary rollout percentages (0..100, anything outside that range is clamped)
CANARY_AUTO_SELL_PCT=0
CANARY_SMART_ALERTS_PCT=0
CANARY_TOUR_PCT=0
```

A flag with no `CANARY_*_PCT` env defaults to **0%** — no canary rollout, only explicit per-user overrides flip it on.

## Canary computation

```ts
sha256(userId).readUInt32BE(0) % 100   // user's bucket: 0..99
```

Deterministic + sticky. The same userId always lands in the same bucket regardless of process restarts. Bucket < pct → flag on. Buckets are reasonably uniform; for 1000 sequential userIds, 10% pct returns true for ~100 users (test enforces 80–120 tolerance).

## Caching

In-memory `TTLCache<userId, Record<flag, bool>>`:

- TTL: **5 min** (matches `requirePremium` cache).
- Max entries: **1000**, oldest-first eviction.
- Registered in cache registry (visible at `GET /api/admin/cache-stats`).
- Invalidated automatically when `setFeatureFlag()` is called for that user.

## Admin endpoints

All require `x-admin-secret` header.

### `GET /api/admin/feature-flags/:userId`

Returns the user's resolved flags (post env+canary merge), the raw JSONB overrides from the DB, and their canary bucket.

```json
{
  "userId": 1,
  "bucket": 42,
  "rawOverrides": { "auto_sell": true },
  "resolved": { "auto_sell": true, "smart_alerts": false, "tour": false }
}
```

### `POST /api/admin/feature-flags/:userId`

Body: `{ "flag": "auto_sell", "value": true | false | null }`

- `true` / `false` → set explicit user override.
- `null` → remove the override (user falls back to canary/env).

Returns the updated resolved flags. Invalidates the cache for that user.

### `GET /api/admin/feature-flags/canary-stats`

Snapshot of current rollout config.

```json
{
  "totalUsers": 12345,
  "flags": [
    { "flag": "auto_sell", "percentage": 10, "killed": false, "estimatedUsersInCanary": 1234 }
  ],
  "knownFlags": ["auto_sell", "smart_alerts", "tour"]
}
```

`estimatedUsersInCanary = totalUsers * pct / 100`. Approximate (true count requires hashing every userId).

## Route integration

```ts
import { requireAuth, requirePremium, requireFeatureFlag } from "../middleware/auth.js";

router.post(
  "/auto-sell/rules",
  authMiddleware,
  requirePremium,
  requireFeatureFlag("auto_sell"),
  handler
);
```

`requireFeatureFlag` and `requirePremium` are independent — premium = paid; feature flag = rolled out. Use both together for paid features behind a rollout gate.

On failure: 403 with body `{ error, code: "FEATURE_DISABLED", flag }`. Flutter clients detect `FEATURE_DISABLED` to render fallback UI ("coming soon", placeholder).

## Operational playbook

### Disable a feature globally (incident)

Set `KILL_<FLAG>=1` and restart (or hot-reload env if your deploy supports it). Cache TTL is 5 min, so users see the change within 5 min worst-case. If you need instant effect, also call `cache-stats` (it doesn't invalidate but you can see size) and consider issuing per-user invalidations via admin endpoint after shipping a true global flush helper (TODO if needed).

### Roll out 10% canary

```bash
CANARY_AUTO_SELL_PCT=10
```

Restart. Watch error rates / `auto-sell-stats`. If healthy, bump to 25, 50, 100.

### QA opt-in for an unrolled feature

```bash
curl -XPOST -H "x-admin-secret: $SECRET" \
  -H "content-type: application/json" \
  -d '{"flag":"auto_sell","value":true}' \
  /api/admin/feature-flags/<qaUserId>
```

### Revoke a per-user opt-in

Same endpoint with `"value": null` — clears the override and the user falls back to canary/env.

## Public API

The Flutter client (and any other authenticated consumer) reads its resolved
flags via a single non-admin endpoint. No premium gate — free users also need
to know which features are available so the UI can render the correct CTA
(upsell vs. "coming soon" vs. live).

### `GET /api/users/feature-flags`

Auth: `Authorization: Bearer <jwt>` (standard `authMiddleware`).

Response:

```json
{
  "flags": {
    "auto_sell": false,
    "smart_alerts": false,
    "tour": true
  },
  "version": "5b1c8f0e2a4d6b91"
}
```

- `flags`: the same map as the admin `resolved` field, but with **only**
  user-safe data. Admin-only fields (`bucket`, `rawOverrides`, kill-switch
  state) are NEVER included.
- `version`: a 16-char hex prefix of `sha256(stable-stringified-flags)`.
  ETag-style fingerprint the client compares against its previously-cached
  value to know whether to invalidate dependent providers. Sorted-key
  stringify guarantees stability across restarts.

Headers:

- `Cache-Control: private, max-age=300` — matches the 5-minute service-level
  TTLCache. The client may cache the response for the same window.

There is no separate route-level cache: we lean on the in-memory
`getFeatureFlagsForUser` cache. Adding a second layer would risk a
stampede-on-restart problem and complicate invalidation after admin overrides.

### Flutter consumer notes

- Add `featureFlagsProvider` (FutureProvider) calling `/api/users/feature-flags`.
- Compare returned `version` against last-known value; only invalidate gated
  screen providers if it changed.
- On any gated route, a 403 with `code: FEATURE_DISABLED` should render the
  "coming soon" / fallback UI (see `requireFeatureFlag` middleware above).
- Cache flags client-side for ~5 min so we don't add latency to every gated
  screen mount.
