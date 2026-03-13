---
phase: 18
slug: backend-error-propagation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 18 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (backend)** | Vitest + supertest |
| **Framework (Flutter)** | flutter_test + mocktail |
| **Config file** | `backend/vitest.config.ts` |
| **Quick run (backend)** | `cd backend && npx vitest run src/routes/__tests__/trades.test.ts src/routes/__tests__/market.test.ts` |
| **Full suite (backend)** | `cd backend && npx vitest run` |
| **Flutter test** | `flutter test test/core/api_client_test.dart` |
| **Estimated runtime** | ~30 seconds (backend quick), ~90 seconds (full suite) |

---

## Sampling Rate

- **After every task commit:** `cd backend && npx vitest run src/routes/__tests__/trades.test.ts src/routes/__tests__/market.test.ts`
- **After every plan wave:** `cd backend && npx vitest run`
- **Before `/gsd:verify-work`:** Full backend suite green + Flutter api_client_test green
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 18-01-01 | 01 | 1 | REFAC-05-gap | integration | `cd backend && npx vitest run src/routes/__tests__/trades.test.ts` | ✅ | ⬜ pending |
| 18-01-02 | 01 | 1 | REFAC-05-gap | integration | `cd backend && npx vitest run src/routes/__tests__/market.test.ts` | ✅ | ⬜ pending |
| 18-02-01 | 02 | 2 | REFAC-03-gap | unit | `cd backend && npx vitest run src/services/__tests__/steamSession.test.ts` | ❌ W0 | ⬜ pending |
| 18-02-02 | 02 | 2 | REFAC-05-gap | integration | `cd backend && npx vitest run` | ✅ | ⬜ pending |
| 18-03-01 | 03 | 3 | REFAC-05-gap | unit | `flutter test test/core/api_client_test.dart` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/src/services/__tests__/steamSession.test.ts` — unit tests for `extractSessionId()` / `validateSession()` using `steamRequest()` (REFAC-03-gap)
- [ ] `test/core/api_client_test.dart` — Flutter unit test verifying `sessionExpiredController` fires on 401+SESSION_EXPIRED (REFAC-05-gap end-to-end)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Live Steam session expiry returns 401 in app | REFAC-05-gap | Requires real Steam session to expire | 1. Log in, 2. Invalidate Steam cookies server-side, 3. Trigger a trade action, 4. Confirm app shows "session expired" banner (not a crash) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (backend quick run)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
