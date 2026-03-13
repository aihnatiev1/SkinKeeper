---
phase: 16
slug: multi-account-gap-closure
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 16 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (backend)** | Vitest + supertest |
| **Framework (Flutter)** | flutter_test + mocktail |
| **Backend config file** | `backend/package.json` (scripts: test, test:coverage) |
| **Flutter config file** | none — uses `flutter test` |
| **Quick run (backend)** | `cd backend && npm test -- --run` |
| **Full suite (backend)** | `cd backend && npm run test:coverage` |
| **Quick run (Flutter)** | `flutter test test/features/` |
| **Full suite (Flutter)** | `flutter test --coverage` |
| **Estimated runtime** | ~60 seconds (backend), ~30 seconds (Flutter) |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npm test -- --run`
- **After every plan wave:** Run `cd backend && npm run test:coverage && flutter test test/features/`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 16-01-01 | 01 | 1 | ACCT-05 | integration | `cd backend && npm test -- --run src/routes/__tests__/auth.test.ts` | ✅ | ⬜ pending |
| 16-01-02 | 01 | 1 | ACCT-03 | integration | `cd backend && npm test -- --run src/routes/__tests__/inventory.test.ts` | ❌ W0 | ⬜ pending |
| 16-02-01 | 02 | 2 | ACCT-03 | static | `flutter analyze lib/features/inventory/` | ✅ | ⬜ pending |
| 16-02-02 | 02 | 2 | ACCT-01/05 | static | `flutter analyze lib/features/settings/ lib/main.dart` | ✅ | ⬜ pending |
| 16-03-01 | 03 | 3 | ACCT-03 | static | `flutter analyze lib/features/inventory/` | ✅ | ⬜ pending |
| 16-03-02 | 03 | 3 | ACCT-04 | static | `flutter analyze lib/features/inventory/widgets/sell_bottom_sheet.dart` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/routes/__tests__/inventory.test.ts` — integration tests for multi-account inventory GET (ACCT-03)
- [ ] Add test cases to `backend/src/routes/__tests__/auth.test.ts` for ACCT-05 premium gate (file exists, needs new cases)

*Deep link `account-linked` handler (ACCT-01): manual verify acceptable — no Flutter test harness for deep links.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `account-linked` deep link refreshes accounts list in app | ACCT-01 | Deep links require device/emulator; no Flutter test harness support | 1. Open app, 2. Tap "Link account", 3. Complete Steam OpenID in browser, 4. Confirm app refreshes accounts list automatically |
| Account badge shows correct avatar/initials per item | ACCT-03 | Visual UI; no screenshot test configured | Open inventory with 2 linked accounts; confirm badge color/initials differ per account |
| Premium paywall shown when free user tries to link 2nd account | ACCT-05 | Requires free-tier test account | Use non-premium account; tap Link New Account; confirm paywall screen appears |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
