---
phase: 1
slug: security-hardening-and-session-foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (ESM + TypeScript-native) |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 1 | SEC-01 | unit | `npx vitest run tests/services/transactions.test.ts -t "parameterized"` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 1 | SEC-02 | unit | `npx vitest run tests/services/crypto.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 1 | SEC-02 | unit | `npx vitest run tests/services/steamSession.test.ts -t "decrypt"` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 1 | SEC-03 | unit | `npx vitest run tests/services/steamSession.test.ts -t "sessionid"` | ❌ W0 | ⬜ pending |
| 01-01-05 | 01 | 1 | SESS-01 | unit | `npx vitest run tests/services/steamSession.test.ts -t "validate"` | ❌ W0 | ⬜ pending |
| 01-01-06 | 01 | 1 | SESS-02 | integration | `grep -r "getUserSession" backend/src/routes/` (expect 0 matches) | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/vitest.config.ts` — vitest config for ESM + TypeScript
- [ ] `backend/tests/services/crypto.test.ts` — encrypt/decrypt unit tests
- [ ] `backend/tests/services/transactions.test.ts` — parameterized query tests for SEC-01
- [ ] `backend/tests/services/steamSession.test.ts` — session service tests
- [ ] Install: `npm install -D vitest` in `backend/`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Steam sessionid comes from real Steam response | SEC-03 | Requires live Steam session | Hit sell endpoint with valid session, verify sessionid in request headers |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
