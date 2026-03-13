# Phase 16: Multi-Account Gap Closure - Research

**Researched:** 2026-03-13
**Domain:** Flutter/Riverpod multi-account UI, Express.js premium gating, deep link handling
**Confidence:** HIGH — all findings derived from direct code inspection of the actual codebase

## Summary

Phase 16 closes four multi-account gaps identified in the v1.0 audit. The backend infrastructure is almost entirely in place: `steam_accounts` table, per-account inventory queries, account CRUD endpoints, and sell operations that accept `accountId`. The three gaps are surgical: (1) the premium gate on `/auth/accounts/link` is commented out — three lines need uncommenting; (2) inventory fetches only the active account — the provider must drop the `?accountId` filter and use `GET /api/inventory` without filtering to get all accounts' items; (3) item cards have no account badge widget — needs a new overlay; (4) sell flow always uses `sessionStatusProvider` which checks the active account only — needs cross-account awareness.

The most architectural change is the inventory merge: `GET /api/inventory` already returns `account_id`, `account_steam_id`, and `account_name` on every item when no `?accountId` filter is applied. The `InventoryItem` model already has `accountId`, `accountSteamId`, and `accountName` fields populated. The Flutter provider just needs to stop sending the filter. Then item cards need a badge overlay, and the sell flow needs a "switch account" CTA when `item.accountId != activeAccountId`.

The deep link gap (ACCT-01 success criterion 5) is in `main.dart`: the `_handleDeepLink` method handles `skinkeeper://auth` but has no handler for `skinkeeper://account-linked`. The backend redirects to `skinkeeper://account-linked?steamId=...` on successful link — the app never handles it, so the accounts list never refreshes.

**Primary recommendation:** Four discrete tasks — (1) uncomment premium gate in `auth.ts`, (2) fix inventory provider to drop account filter + show all-account data, (3) add account badge to `ItemCard` with tap-to-switch, (4) add account-switch CTA to sell sheet + fix `account-linked` deep link handler.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| ACCT-01 | User can link additional Steam accounts from settings (QR or credentials auth) | Backend link endpoint exists; state param flow works; deep link callback `skinkeeper://account-linked` is not handled in Flutter — must be wired in `main.dart` `_handleDeepLink` |
| ACCT-03 | Inventory shows items from all linked accounts with account badge/label | Backend already returns multi-account items when no `?accountId` filter; `InventoryItem` model already has `accountId`/`accountSteamId`/`accountName` fields; only Flutter provider and ItemCard need changes |
| ACCT-04 | User can sell items from any linked account (session cookies per account) | `sellOperations.ts` already accepts `accountId` and uses it to resolve the session; Flutter sell sheet just needs to pass `item.accountId` and show switch-account CTA when item is not from active account |
| ACCT-05 | Free tier limited to 1 account; premium unlocks unlimited accounts | Premium gate is already written in `auth.ts` lines 218–236 but commented out with TODO — uncomment and test |
</phase_requirements>

---

## Standard Stack

### Core (all already in project)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| flutter_riverpod | ^2.x | State management | All providers already use it |
| go_router | ^x | Navigation / deep links | Router already wired |
| cached_network_image | ^x | Avatar images | Already used for item images |

### No new dependencies needed
All required libraries are already in `pubspec.yaml`. This phase is pure logic and UI changes.

---

## Architecture Patterns

### Current Inventory Flow (single-account)
```
InventoryNotifier.build()
  → _activeAccountId (from authStateProvider)
  → GET /api/inventory?accountId={id}   ← filter applied
  → items for active account only
```

### Target Inventory Flow (all-accounts)
```
InventoryNotifier.build()
  → GET /api/inventory                  ← no filter; all accounts returned
  → items include account_id, account_steam_id, account_name
  → ItemCard shows account badge when user has >1 account
```

The backend already supports this: `inventory.ts` only applies `accountFilter` when `filterAccountId` is set and valid.

### Account Badge Pattern
Account badge = small circular avatar (16-20px) overlaid on item card corner.
- Source: `item.accountSteamId` → `item.accountName` (initials fallback)
- Tap: call `AccountsNotifier.setActive(item.accountId!)` then `ref.invalidate(inventoryProvider)`
- Only shown when `SteamUser.accountCount > 1`

### Sell Flow Account Context
Current flow: `SellBottomSheet` → `startOperation()` → `POST /api/market/sell-operation` with `{items}` only.
The backend resolves `accountId` from request body, fallback to `getActiveAccountId(userId)`.

Target: pass `accountId: item.accountId` in the sell operation request body.
When `item.accountId != activeAccountId`, show warning banner + "Switch Account" button instead of / alongside sell buttons.

### Premium Gate Pattern
The check already exists and is well-structured. In `backend/src/routes/auth.ts` lines 218–236:
```typescript
// TODO: re-enable premium gate after testing
// const { rows: userRow } = await pool.query(
//   `SELECT is_premium FROM users WHERE id = $1`,
//   [req.userId]
// );
// const isPremium = userRow[0]?.is_premium ?? false;
//
// if (!isPremium) {
//   const { rows: countRow } = await pool.query(
//     `SELECT COUNT(*)::int as cnt FROM steam_accounts WHERE user_id = $1`,
//     [req.userId]
//   );
//   if (countRow[0].cnt >= 1) {
//     res.status(403).json({
//       error: "premium_required",
//       message: "Upgrade to Premium to link multiple Steam accounts",
//     });
//     return;
//   }
// }
```
Just uncomment this block. The Flutter side: `AccountsNotifier.startLinkAccount()` receives the 403; the accounts screen must catch `DioException` with status 403 and push `/premium`.

### Deep Link Gap (ACCT-01)
`main.dart._handleDeepLink` handles `skinkeeper://auth` and `skinkeeper://portfolio` but NOT `skinkeeper://account-linked`.

Backend sends: `res.redirect('skinkeeper://account-linked?steamId=${steamId}')` on successful link.

Fix: add handler in `_handleDeepLink`:
```dart
if (uri.host == 'account-linked') {
  ref.invalidate(accountsProvider);
  ref.invalidate(inventoryProvider);
  // optionally: show snackbar "Account linked!"
}
```

### Anti-Patterns to Avoid
- **Don't re-fetch inventory with individual account loops**: the backend already JOINs all accounts for the user; one fetch is sufficient.
- **Don't store active account in a separate local provider**: use `authStateProvider.valueOrNull?.activeAccountId` as the source of truth.
- **Don't show account badge when single account**: guard with `accountCount > 1` to avoid visual noise for most users.
- **Don't block sell on non-active account**: show CTA but allow switch-then-sell in one tap (good UX).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Avatar image with fallback | Custom network image widget | `CachedNetworkImage` with `errorBuilder` showing initials | Already used for item/sticker images |
| Premium gate check | Duplicate DB query | Existing commented-out block in `auth.ts` | Already correct, just uncomment |
| Account context in sell | New accountId tracking provider | Pass `item.accountId` directly from `InventoryItem` model | Model already has the field |
| Account list refresh | Manual API call | `ref.invalidate(accountsProvider)` | Riverpod invalidation already triggers rebuild |

---

## Common Pitfalls

### Pitfall 1: Cache Contamination After Account Switch
**What goes wrong:** `CacheService.putInventory()` caches all-account items. Next launch, `InventoryNotifier.build()` serves cached items from all accounts — correct. But if user switches active account, the cache is cleared by `AccountsNotifier.setActive()` which calls `CacheService.clearAccountData()`. The next `_refreshInBackground()` will re-fetch all accounts. This is fine.
**Watch for:** The `_accountQuery` getter in `InventoryNotifier` currently returns `{accountId: id}` — this must be changed to return `{}` (empty) so the refresh POST also fetches all accounts' inventories.

### Pitfall 2: Group Display with Cross-Account Items
**What goes wrong:** `groupedInventoryProvider` groups items by `marketHashName`. Two accounts might both have "AK-47 | Redline (FT)". These will be grouped together in the grid with `x2` count — but they belong to different accounts. When the user tries to sell both from the quick sell sheet, the backend will use account context from `item.accountId` of the first item.
**How to avoid:** Group items by `marketHashName + accountId` when in multi-account mode, OR show the account badge prominently on grouped items. The simplest approach: keep existing grouping, but in the sell sheet, group items by `accountId` and issue separate sell operations per account if needed.
**Warning signs:** Sell operation fails with "item not found" for half of a cross-account batch.

### Pitfall 3: `sessionStatusProvider` Checks Active Account Only
**What goes wrong:** `SellBottomSheet` checks `sessionStatusProvider` which calls `GET /session/status` which returns status for the active account only. An item from account B (non-active) might appear sellable even if account B has no session.
**How to avoid:** When showing sell sheet for a non-active-account item, check the session status for that specific account via `GET /auth/accounts/:accountId/session/status` (endpoint already exists). Or: just show the "Switch Account" CTA — after switching, `sessionStatusProvider` will re-evaluate for the new active account.

### Pitfall 4: `InventoryNotifier._accountQuery` Still Applied to Refresh
**What goes wrong:** `_refreshInBackground()` and `refresh()` both call `api.post('/inventory/refresh', queryParameters: _accountQuery)`. If `_accountQuery` returns `{}`, the refresh fetches all accounts — correct behavior. But the backend refresh loop already handles this: `POST /api/inventory/refresh` without `?accountId` refreshes ALL accounts for the user.
**Confirm:** The backend `POST /inventory/refresh` route loops over all accounts when no `filterAccountId` is provided. Verified: yes, it does.

### Pitfall 5: Deep Link `skinkeeper://account-linked` Not Handled
**What goes wrong:** User links a second account via browser → browser opens `skinkeeper://account-linked?steamId=...` → app receives it in `_handleDeepLink` → no matching handler → nothing happens. Accounts list never refreshes.
**How to avoid:** Add the `account-linked` handler in `main.dart._handleDeepLink` before other checks.

---

## Code Examples

### Drop Account Filter in Inventory Provider
```dart
// Source: lib/features/inventory/inventory_provider.dart
// BEFORE:
int? get _activeAccountId =>
    ref.read(authStateProvider).valueOrNull?.activeAccountId;

Map<String, dynamic> get _accountQuery {
  final id = _activeAccountId;
  return id != null ? {'accountId': '$id'} : {};
}

// AFTER (multi-account merge):
Map<String, dynamic> get _accountQuery => {};
// Remove _activeAccountId getter entirely — not used for fetching
```

### Account Badge Overlay on ItemCard
```dart
// Add to item_card.dart Stack children, guarded by multi-account check:
// (accountCount passed in as parameter from grid, read from authStateProvider)
if (showAccountBadge && item.accountSteamId != null)
  Positioned(
    bottom: 4,
    left: 4,
    child: GestureDetector(
      onTap: onAccountBadgeTap,
      child: Container(
        width: 20,
        height: 20,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          border: Border.all(color: AppTheme.surface, width: 1.5),
          color: AppTheme.primary.withValues(alpha: 0.8),
        ),
        child: ClipOval(
          child: item.accountSteamId != null
            ? CachedNetworkImage(
                imageUrl: 'https://avatars.steamstatic.com/${item.accountSteamId}_medium.jpg',
                fit: BoxFit.cover,
                errorBuilder: (_, _, _) => Center(
                  child: Text(
                    (item.accountName ?? '?').substring(0, 1).toUpperCase(),
                    style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold),
                  ),
                ),
              )
            : Center(
                child: Text(
                  (item.accountName ?? '?').substring(0, 1).toUpperCase(),
                  style: const TextStyle(fontSize: 9, fontWeight: FontWeight.bold),
                ),
              ),
        ),
      ),
    ),
  ),
```

Note: Steam avatar URL format uses the SteamID64 directly. The `accountSteamId` field is the Steam64 ID string. However, the avatar URL from the profile is already stored in `steam_accounts.avatar_url`. The backend inventory query already returns `sa.display_name as account_name` but does NOT currently join `sa.avatar_url`. The backend query in `inventory.ts` must be updated to also return `sa.avatar_url as account_avatar_url`.

### Premium Gate Uncomment (backend/src/routes/auth.ts)
Lines 217-236: remove the comment markers around the existing premium check block. No logic changes needed.

Flutter response handling in `accounts_provider.dart`:
```dart
Future<void> startLinkAccount() async {
  final api = ref.read(apiClientProvider);
  // BEFORE: no error handling for 403
  final response = await api.post('/auth/accounts/link');
  return response.data as Map<String, dynamic>;
}

// AFTER: handle 403 premium_required
Future<Map<String, dynamic>> startLinkAccount() async {
  final api = ref.read(apiClientProvider);
  try {
    final response = await api.post('/auth/accounts/link');
    return response.data as Map<String, dynamic>;
  } on DioException catch (e) {
    if (e.response?.statusCode == 403) {
      final body = e.response?.data as Map<String, dynamic>?;
      if (body?['error'] == 'premium_required') {
        throw PremiumRequiredException();
      }
    }
    rethrow;
  }
}
```

The linked accounts screen catches `PremiumRequiredException` and calls `context.push('/premium')`.

### Deep Link Handler for account-linked
```dart
// Source: lib/main.dart _handleDeepLink
void _handleDeepLink(Uri uri) {
  // ... existing handlers ...

  // skinkeeper://account-linked?steamId=XXX
  if (uri.host == 'account-linked') {
    ref.invalidate(accountsProvider);
    ref.invalidate(inventoryProvider);
  }
}
```

### Sell Sheet Cross-Account CTA
```dart
// In SellBottomSheet._buildHeader or near sell buttons:
// item.accountId is available from widget.items.first.accountId
// activeAccountId from ref.watch(authStateProvider).valueOrNull?.activeAccountId
final activeAccountId = ref.watch(
  authStateProvider.select((u) => u.valueOrNull?.activeAccountId),
);
final item = widget.items.first;
final isNonActiveAccount = item.accountId != null &&
    item.accountId != activeAccountId;

if (isNonActiveAccount)
  _buildSwitchAccountBanner(context, ref, item),
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `?accountId` filter on every inventory fetch | No filter — all accounts merged | This phase | Enables ACCT-03 |
| Premium gate commented out | Gate active, 403 on free + >1 account | This phase | Enables ACCT-05 |
| Sell always uses active account | Sell passes `item.accountId` | This phase | Enables ACCT-04 |
| `account-linked` deep link unhandled | Handler added to invalidate providers | This phase | Enables ACCT-01 criterion 5 |

---

## Open Questions

1. **Avatar URL in inventory response**
   - What we know: `inventory.ts` SELECT does not include `sa.avatar_url`
   - What's unclear: whether to add it to the inventory query or derive it from the Steam CDN using `accountSteamId`
   - Recommendation: Add `sa.avatar_url as account_avatar_url` to the inventory query — it's already stored per `steam_account`. Simpler than constructing CDN URLs which require knowing the avatar hash.

2. **GroupedInventory cross-account items**
   - What we know: Items from different accounts with the same `marketHashName` are currently grouped together
   - What's unclear: Should they be grouped or shown separately?
   - Recommendation: Keep grouping (consistent with existing UX) but show the multi-account badge on grouped items. When selling from a group with mixed accounts, split by account and issue per-account sell operations. For this phase, take the simpler path: if a group contains items from multiple accounts, use the active account for selling and show a warning if any items belong to non-active accounts.

3. **`linkedAccountsProvider` in session_provider.dart**
   - What we know: `AccountsNotifier.setActive()` calls `ref.invalidate(linkedAccountsProvider)` but this provider is not defined in the files reviewed
   - What's unclear: Where `linkedAccountsProvider` is defined and if it needs updates for this phase
   - Recommendation: Search for this provider before planning — likely in `settings/linked_accounts_screen.dart` or similar. Low risk: it's just invalidated on account switch.

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (backend) | Vitest + supertest |
| Framework (Flutter) | flutter_test + mocktail |
| Backend config file | `backend/package.json` (scripts: test, test:coverage) |
| Flutter config file | none — uses `flutter test` |
| Quick run (backend) | `cd backend && npm test -- --run` |
| Full suite (backend) | `cd backend && npm run test:coverage` |
| Quick run (Flutter) | `flutter test test/features/` |
| Full suite (Flutter) | `flutter test --coverage` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ACCT-05 | `POST /auth/accounts/link` returns 403 for free user with 1+ account | integration | `cd backend && npm test -- --run src/routes/__tests__/auth.test.ts` | ✅ (auth.test.ts exists — needs new test case) |
| ACCT-05 | `POST /auth/accounts/link` returns 200 for premium user | integration | `cd backend && npm test -- --run src/routes/__tests__/auth.test.ts` | ✅ (needs new test case) |
| ACCT-03 | `GET /api/inventory` without filter returns items from all accounts with account fields | integration | `cd backend && npm test -- --run src/routes/__tests__/inventory.test.ts` | ❌ Wave 0 |
| ACCT-04 | Sell operation uses `item.accountId` session when provided | unit | `cd backend && npm test -- --run src/services/__tests__/sellOperations.test.ts` | ✅ (needs accountId test case) |
| ACCT-01 | `account-linked` deep link invalidates accounts/inventory providers | widget | `flutter test test/features/settings/` | ❌ Wave 0 (manual-verify acceptable) |

### Sampling Rate
- **Per task commit:** `cd backend && npm test -- --run`
- **Per wave merge:** `cd backend && npm run test:coverage && flutter test test/features/`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/routes/__tests__/inventory.test.ts` — integration tests for multi-account inventory GET
- [ ] Add test cases to `backend/src/routes/__tests__/auth.test.ts` for ACCT-05 premium gate (file exists, just needs cases)
- [ ] Deep link `account-linked` handler: manual verify acceptable (E2E; no widget test for deep links in Flutter test harness)

---

## Sources

### Primary (HIGH confidence)
- Direct inspection of `backend/src/routes/auth.ts` — premium gate block at lines 217–236
- Direct inspection of `backend/src/routes/inventory.ts` — multi-account query and account fields returned
- Direct inspection of `lib/features/inventory/inventory_provider.dart` — `_accountQuery` getter sends `?accountId`
- Direct inspection of `lib/models/inventory_item.dart` — `accountId`, `accountSteamId`, `accountName` fields exist
- Direct inspection of `lib/features/inventory/widgets/item_card.dart` — no account badge present
- Direct inspection of `lib/main.dart` — `_handleDeepLink` missing `account-linked` handler
- Direct inspection of `backend/src/services/sellOperations.ts` — `createOperation` accepts optional `accountId`
- Direct inspection of `backend/src/routes/market.ts` — `POST /sell-operation` passes `accountId` to `createOperation`

### Secondary (MEDIUM confidence)
- `lib/features/settings/accounts_provider.dart` — `AccountsNotifier.startLinkAccount()` posts to `/auth/accounts/link` with no 403 handling
- `lib/features/auth/session_provider.dart` — session status checks active account only
- `.planning/STATE.md` — decision log confirms multi-account is PREMIUM only

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing
- Architecture: HIGH — based on direct code reading, not inference
- Pitfalls: HIGH — identified from actual code gaps, not hypothetical

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable codebase, no fast-moving dependencies)
