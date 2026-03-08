---
phase: 4
slug: multi-source-pricing
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.0.18 |
| **Config file** | None — Wave 0 installs vitest.config.ts |
| **Quick run command** | `cd backend && npx vitest run` |
| **Full suite command** | `cd backend && npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd backend && npx vitest run`
- **After every plan wave:** Run `cd backend && npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 01 | 1 | PRICE-01 | unit | `cd backend && npx vitest run src/services/__tests__/csfloat.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-02 | 01 | 1 | PRICE-01 | unit | `cd backend && npx vitest run src/services/__tests__/dmarket.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-03 | 01 | 1 | PRICE-01 | unit | `cd backend && npx vitest run src/services/__tests__/priceJob.test.ts` | ❌ W0 | ⬜ pending |
| 04-01-04 | 01 | 1 | PRICE-03 | integration | `cd backend && npx vitest run src/routes/__tests__/prices.test.ts` | ❌ W0 | ⬜ pending |
| 04-02-01 | 02 | 2 | PRICE-02 | manual | Flutter widget — visual verification | N/A | ⬜ pending |
| 04-02-02 | 02 | 2 | PRICE-03 | manual | Flutter price detail screen — visual | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `backend/vitest.config.ts` — vitest configuration
- [ ] `backend/src/services/__tests__/csfloat.test.ts` — CSFloat fetcher unit tests with mocked axios
- [ ] `backend/src/services/__tests__/dmarket.test.ts` — DMarket fetcher + Ed25519 signing unit tests
- [ ] `backend/src/services/__tests__/priceJob.test.ts` — Cron job orchestration tests
- [ ] `backend/src/routes/__tests__/prices.test.ts` — Price routes integration tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Item card shows best price with source label | PRICE-02 | Flutter UI rendering | Open inventory, verify price + source badge on each item |
| Cross-market comparison table | PRICE-03 | Flutter UI layout | Open item detail, verify 4-source price table |
| Price history multi-line chart | PRICE-03 | Flutter chart rendering | Open price detail, verify lines per source |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
