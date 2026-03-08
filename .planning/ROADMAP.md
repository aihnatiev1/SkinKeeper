# Roadmap: SkinTracker

## Overview

SkinTracker has a working foundation for inventory tracking, price collection, and basic selling. The critical gap is proper Steam session authentication and secure credential handling. This roadmap first hardens security and builds the session infrastructure, then delivers all three auth methods, and finally enhances the selling experience with the session lifecycle polish needed to make it robust. Three phases, each delivering a coherent capability that unblocks the next.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Security Hardening and Session Foundation** - Fix vulnerabilities, encrypt credentials, build centralized SteamSessionService and validation middleware
- [ ] **Phase 2: Steam Authentication** - Deliver all three auth methods (QR code, ClientJS token, login+Steam Guard) and session status UI
- [ ] **Phase 3: Enhanced Selling and Session Lifecycle** - Redesigned sell UX with quick sell/custom price, batch operations, session auto-refresh, and rate limit awareness

## Phase Details

### Phase 1: Security Hardening and Session Foundation
**Goal**: The app stores credentials securely, rejects SQL injection, uses real Steam session IDs, and has a centralized session service that validates sessions before any authenticated operation
**Depends on**: Nothing (first phase)
**Requirements**: SEC-01, SEC-02, SEC-03, SESS-01, SESS-02
**Success Criteria** (what must be TRUE):
  1. All database queries use parameterized statements with no string interpolation of user input
  2. Stored session credentials (steamLoginSecure, access tokens) are encrypted at rest in PostgreSQL
  3. Steam sessionid used in sell operations comes from Steam's actual session state, not fabricated random bytes
  4. App checks session validity before attempting any sell operation and returns a clear "session expired" response if invalid
  5. A single SteamSessionService handles all session operations, replacing scattered getUserSession() helpers across route files
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — Test infrastructure, SQL injection fix (SEC-01), AES-256-GCM crypto module (SEC-02 foundation)
- [ ] 01-02-PLAN.md — Centralized SteamSessionService with encryption at rest, real sessionid extraction, session validation, route rewiring (SEC-02, SEC-03, SESS-01, SESS-02)

### Phase 2: Steam Authentication
**Goal**: Users can authenticate their Steam session through any of three methods and see their session status in the app
**Depends on**: Phase 1
**Requirements**: AUTH-01, AUTH-02, AUTH-03, AUTH-04
**Success Criteria** (what must be TRUE):
  1. User can scan a QR code with the Steam mobile app and have their session authenticated in the SkinTracker app
  2. User can authenticate via the ClientJS token flow (redirect to /chat/clientjstoken) as a fallback method
  3. User can authenticate via username + password + Steam Guard 2FA code as a third option
  4. User can see whether their current Steam session is valid, expiring soon, or expired directly in the app UI
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD

### Phase 3: Enhanced Selling and Session Lifecycle
**Goal**: Users can sell skins quickly and confidently with clear pricing, batch operations, and a session that stays alive without manual intervention
**Depends on**: Phase 2
**Requirements**: SELL-01, SELL-02, SELL-03, SELL-04, SESS-03, SESS-04
**Success Criteria** (what must be TRUE):
  1. User sees two distinct actions per item: "Sell" (enter custom price) and "Quick Sell" (market minimum minus 1 kopek, one tap)
  2. User sees the Steam + Valve fee breakdown showing seller-receives amount before confirming any sale
  3. User sees per-item progress (queued, listing, listed, failed) during batch sell operations instead of a single spinner
  4. User can sell all duplicate items with one tap via a "Sell all duplicates" shortcut
  5. App auto-refreshes the Steam session before expiry so the user does not encounter unexpected session errors mid-operation
  6. App tracks daily sell volume and warns the user when approaching Steam rate limits to prevent account restrictions

**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD
- [ ] 03-03: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Security Hardening and Session Foundation | 0/2 | Not started | - |
| 2. Steam Authentication | 0/2 | Not started | - |
| 3. Enhanced Selling and Session Lifecycle | 0/3 | Not started | - |
