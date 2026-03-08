# Project Research Summary

**Project:** SkinTracker - Steam Session Auth & Enhanced Selling
**Domain:** Steam CS2 skin inventory management and marketplace selling (mobile-first)
**Researched:** 2026-03-08
**Confidence:** MEDIUM

## Executive Summary

SkinTracker is a mobile-first CS2 skin selling tool with an existing Express.js + PostgreSQL backend and Flutter frontend. The app already handles OpenID login, inventory tracking, price collection, and basic selling -- but session authentication is the critical gap. Without proper Steam session cookies, all sell operations are either broken or require a clunky manual token-paste workflow. The research is unanimous: DoctorMcKay's `steam-session` library is the only serious option for Steam authentication in Node.js. QR code login should be the primary auth method (cleanest UX, no credential liability), with clientjstoken as fallback. The login+password+SteamGuard flow is viable but carries credential-transit risk and should be deprioritized.

The recommended approach is to build a centralized `SteamSessionService` on the backend that owns the entire session lifecycle -- creation via multiple methods, validation, storage, refresh, and expiry. This replaces the current duplicated `getUserSession()` pattern across route files. All sell operations should pass through a `requireSteamSession` middleware that validates cookies before use. The architecture research strongly recommends HTTP polling over WebSockets for QR auth (simpler, no new dependencies) and keeping batch sells synchronous for now (50-item cap means 75s max wait).

The most dangerous risks are: (1) the existing SQL injection vulnerability in `getTransactionStats` which must be fixed before storing more credential types, (2) fabricated `sessionid` cookies that cause all sell operations to fail silently, (3) plaintext credential storage in PostgreSQL, and (4) Steam rate limiting that can soft-ban user accounts. The fabricated sessionid issue is particularly insidious -- the current code generates random sessionids that Steam rejects as CSRF failures, but the error is masked by generic error handling. Fixing this is a prerequisite for any sell operation to work reliably.

## Key Findings

### Recommended Stack

The existing stack (Express.js, PostgreSQL, Flutter) stays unchanged. Four packages need to be added to the backend.

**Core technologies:**
- `steam-session` (^1.x): Steam authentication via QR code, credentials+SteamGuard, and token exchange -- the only maintained library for Steam's IAuthenticationService protobuf API
- `steamcommunity` (^3.x): Steam Community web operations with proper cookie/session/CSRF management and mobile confirmation handling -- strongly recommended to replace raw axios calls for sell operations
- `steam-totp` (^2.x): Generate Steam Guard TOTP codes for the credentials+guard auth flow
- `qrcode` (^1.5.x): Server-side QR code image generation from challenge URLs (send base64 PNG to Flutter)

**Flutter-side:** `qr_flutter` for native QR rendering (alternative to backend-rendered images), `webview_flutter` if clientjstoken WebView capture is needed.

**What NOT to use:** `steam-user` (overkill game client), `passport-steam` (OpenID only, no session cookies), manual protobuf implementations, separate cookie-jar libraries.

**Version caveat:** All `steam-*` package versions are from training data. Run `npm view <package> version` before installing.

### Expected Features

**Must have (table stakes):**
- Steam session auth via QR code (primary) and clientjstoken (fallback) -- unlocks all selling
- Session validity indicator (green/yellow/red) and expiry detection with re-auth prompting
- Quick sell (undercut lowest by 1 kopek/cent) with clear price preview
- Custom price sell with fee calculator showing buyer-pays vs seller-receives
- Enhanced batch sell with per-item progress feedback (not just a spinner)
- Session expiry handling -- detect 401/403 and prompt re-auth, not generic errors

**Should have (differentiators):**
- "Sell all duplicates" one-tap action (low effort, high convenience)
- Login+SteamGuard as third auth method (backup for users who cannot use QR)
- Sell queue with retry for failed batch items

**Defer to v2+:**
- Smart pricing with market depth analysis (high complexity)
- Listing management (view/cancel active listings -- different API surface)
- Profit/loss tracking per item
- Push notifications for price alerts (needs Firebase)
- Float value display

**Anti-features (explicitly do not build):** Third-party marketplace selling, trade offer automation, storing Steam passwords, price prediction/ML, automated selling bots.

**Key competitive insight:** There is no dominant mobile tool for Steam Market selling. Desktop browser extensions dominate. Mobile-first is the differentiator itself.

### Architecture Approach

Introduce a `SteamSessionService` singleton as the single authority for Steam session lifecycle. All auth methods (QR, credentials, clientjstoken) funnel through it. A `requireSteamSession` middleware validates sessions before any Steam-authenticated route. Pending auth flows (QR polling, guard code submission) use nonce-based in-memory tracking with TTL cleanup. Database changes are minimal: add `steam_refresh_token`, `session_validated_at`, and `session_method` columns to the existing `users` table. No new tables needed.

**Major components:**
1. **SteamSessionService** (backend) -- session create/validate/store/retrieve/invalidate across all 3 auth methods
2. **Session Routes** (`/api/session/*`) -- new REST endpoints for auth flows and session status, replacing scattered session logic in market routes
3. **requireSteamSession Middleware** -- pre-validates session on all routes needing Steam cookies, returns `SESSION_EXPIRED` code for frontend handling
4. **SteamAuthFlow** (Flutter) -- unified auth method picker UI orchestrating QR, credentials, and clientjstoken screens
5. **Enhanced SellBottomSheet** (Flutter) -- redesigned with "Quick Sell" and "Sell at Custom Price" buttons plus fee breakdown

### Critical Pitfalls

1. **Fabricated sessionid cookies** -- the current code generates random sessionids that Steam rejects as CSRF failures. Always extract sessionid from Steam's Set-Cookie response during auth. Fix this first.
2. **SQL injection in getTransactionStats** -- existing vulnerability provides a direct path to steal any stored credentials. Must be fixed before adding more auth methods and session storage.
3. **Plaintext credential storage** -- steamLoginSecure and access tokens stored unencrypted in PostgreSQL. Encrypt with AES-256-GCM using a server-side env key before expanding session storage.
4. **Steam rate limiting causes account bans** -- the current 1.5s delay between sells is too aggressive. Increase to 3-5s, add exponential backoff on errors, implement per-user daily caps (warn at 20/hour, cap at 100/day).
5. **Mobile confirmations block automated sells** -- Steam requires out-of-band mobile confirmation for listings. The app must treat "pending confirmation" as a first-class UI state, not pretend items are sold.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Security Hardening and Session Foundation

**Rationale:** The SQL injection vulnerability and plaintext credential storage are blocking risks. They must be fixed before adding any new auth methods that store more sensitive data. The centralized SteamSessionService must exist before any auth flow can be built.
**Delivers:** Secure credential storage, fixed SQL injection, SteamSessionService skeleton with validation logic, session-required middleware, DB schema changes (new columns).
**Addresses:** Session validity checking, session expiry detection, replaces duplicated getUserSession() pattern.
**Avoids:** Pitfalls 2 (fabricated sessionid), 3 (steamLoginSecure format), 5 (plaintext storage), 15 (error swallowing -- establish error taxonomy here).
**Includes:** Migrate existing clientjstoken flow into SteamSessionService with proper sessionid extraction and validation.

### Phase 2: QR Code Authentication

**Rationale:** QR is the recommended primary auth method -- best UX, no credential liability, and Steam actively promotes it. Depends on Phase 1's SteamSessionService being in place.
**Delivers:** Working QR code login flow end-to-end (backend + Flutter). Users can authenticate their Steam session from the app.
**Uses:** `steam-session` (startWithQR, getWebCookies), `qrcode` or `qr_flutter` for rendering.
**Implements:** QR auth data flow, nonce-based pending session tracking, HTTP polling with timeout and auto-refresh.
**Avoids:** Pitfall 9 (QR timeout handling) -- implement countdown timer and auto-refresh.

### Phase 3: Enhanced Selling UX

**Rationale:** With auth working from Phase 2, selling can be properly tested and improved. The sell UX improvements are independent of which auth method was used -- they depend on having a valid session, which Phases 1-2 provide.
**Delivers:** Redesigned sell bottom sheet (Quick Sell + Custom Price), fee calculator in UI, batch sell with per-item progress, "sell all duplicates" shortcut, proper "pending confirmation" state.
**Addresses:** Quick sell, custom price sell, batch sell progress, fee display, confirmation handling, stale inventory after sell.
**Avoids:** Pitfalls 6 (confirmation blocking), 7 (currency mismatch), 8 (stale prices), 11 (stale inventory after sell), 14 (fee rounding).

### Phase 4: Rate Limiting, Batch Hardening, and Session Lifecycle Polish

**Rationale:** With selling working, harden it against rate limits and session edge cases. This is the "make it robust" phase.
**Delivers:** Adaptive rate limiting (3-5s delays, exponential backoff), per-user daily sell caps, session auto-refresh using refresh tokens, session status indicator in app, proactive session validation on app resume.
**Avoids:** Pitfall 4 (rate limit bans), Pitfall 12 (multi-account session confusion).

### Phase 5: Credential Login + Steam Guard (Optional)

**Rationale:** This is the lowest-priority auth method. QR code and clientjstoken cover most users. Credentials+Guard adds complexity and credential-transit liability. Build only if user feedback demands it.
**Delivers:** Username+password+2FA auth flow as a third option.
**Avoids:** Pitfall 10 (credential transit) -- consider client-side auth to Steam directly from Flutter.

### Phase Ordering Rationale

- **Security before features:** The SQL injection and plaintext storage are unacceptable risks when the next step is storing more credentials. Phase 1 is non-negotiable as first.
- **Auth before selling:** All sell improvements depend on reliable session cookies. QR auth (Phase 2) must precede sell UX (Phase 3).
- **Happy path before hardening:** Get selling working first (Phase 3), then make it robust (Phase 4). Users need to see value before edge cases are polished.
- **Credentials auth last:** It is the riskiest auth method with the least UX advantage. Defer until proven necessary.
- **Architecture drives grouping:** The SteamSessionService is the foundation everything builds on, so it ships first with basic validation. Auth methods layer on top. Sell UX layers on top of auth.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (QR Auth):** The `steam-session` API details are from training data. Verify current package API surface before implementation. The core pattern is stable but method signatures may have evolved.
- **Phase 3 (Enhanced Selling):** Currency detection and wallet currency handling need investigation during implementation. The mechanism to detect a user's Steam wallet currency is not fully documented.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Security + Session Foundation):** AES-256-GCM encryption, Express middleware, SQL parameterization -- all well-documented patterns.
- **Phase 4 (Rate Limiting + Polish):** Exponential backoff and session refresh are established patterns.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | `steam-session` is definitively the right library, but version numbers and exact API surface need npm verification. All packages are from training data. |
| Features | MEDIUM-HIGH | Feature priorities are well-grounded in codebase analysis (existing code shows what is partially built). Competitor landscape is from training data and may have shifted. |
| Architecture | HIGH | Patterns are derived directly from codebase analysis. SteamSessionService, middleware, and data flows are concrete and actionable. Build order is dependency-driven. |
| Pitfalls | HIGH | Most pitfalls were identified from direct code analysis (fabricated sessionid, SQL injection, plaintext storage). Domain pitfalls (rate limits, confirmations) are well-established community knowledge. |

**Overall confidence:** MEDIUM-HIGH

### Gaps to Address

- **Steam package versions:** Run `npm view steam-session steamcommunity steam-totp version` before implementation to verify current stable versions and API compatibility.
- **Currency handling:** How to detect a user's Steam wallet currency during session establishment is not fully documented. Investigate during Phase 3 planning.
- **Multi-account session schema:** The current `users` table stores session data per-user, not per-linked-account. If multi-account selling is a priority, the schema may need a separate `steam_sessions` table keyed by (user_id, steam_id). Validate during Phase 1.
- **Mobile confirmation automation:** Whether to support automated confirmations via shared secret is a design decision with security implications. Defer decision to after Phase 3 ships.
- **`steamcommunity` TypeScript types:** The package does not ship its own types. Plan for either a minimal `.d.ts` file or `@ts-ignore` pragmas.

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: `backend/src/services/market.ts`, `backend/src/routes/market.ts`, `backend/src/services/transactions.ts`, `backend/src/db/migrate.ts`, Flutter UI files
- Known issues from `.planning/codebase/CONCERNS.md`

### Secondary (MEDIUM confidence)
- DoctorMcKay's GitHub repositories and npm packages (steam-session, steamcommunity, steam-totp) -- API details from training data
- Steam IAuthenticationService architecture (2023 auth overhaul) -- general patterns stable, specific details may have evolved
- Steam trading bot community conventions (delays, session handling, cookie formats)

### Tertiary (LOW confidence)
- Competitor feature sets (Steam Inventory Helper, CSFloat, Buff163) -- from training data, may have changed
- Specific Steam rate limit thresholds -- undocumented by Valve, based on community consensus

---
*Research completed: 2026-03-08*
*Ready for roadmap: yes*
