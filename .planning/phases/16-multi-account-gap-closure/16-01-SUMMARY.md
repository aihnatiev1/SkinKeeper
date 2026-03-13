# 16-01 Summary: Backend Premium Gate + Inventory Avatar URL

## Completed
- Uncommented premium gate in auth.ts (POST /auth/accounts/link returns 403 for free users with ≥1 account)
- Added sa.avatar_url as account_avatar_url to inventory SELECT query
- Added 3 account_avatar_url test cases to existing backend/src/routes/__tests__/inventory.test.ts
- Added 3 premium gate test cases to auth.test.ts

## Test Results

```
Test Files  23 passed (23)
Tests       221 passed (221)
Duration    29.07s
```

auth.test.ts: 14 tests passed (11 original + 3 new premium gate cases)
inventory.test.ts: 8 tests passed (5 original + 3 new avatar_url cases)

## Files Modified
- backend/src/routes/auth.ts — uncommented premium gate block (~217-236)
- backend/src/routes/__tests__/auth.test.ts — added 3 premium gate test cases
- backend/src/routes/inventory.ts — added sa.avatar_url as account_avatar_url to SELECT
- backend/src/routes/__tests__/inventory.test.ts — added 3 account_avatar_url test cases

## Commit
3bf57f1 feat(16-01): activate premium gate on account linking + add avatar_url to inventory
