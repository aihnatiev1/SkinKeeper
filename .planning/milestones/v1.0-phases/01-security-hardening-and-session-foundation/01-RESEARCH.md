# Phase 1: Security Hardening and Session Foundation - Research

**Researched:** 2026-03-08
**Domain:** SQL injection fix, credential encryption at rest, Steam session management, session validation
**Confidence:** HIGH

## Summary

Phase 1 addresses five requirements across two domains: security vulnerabilities (SEC-01, SEC-02, SEC-03) and session infrastructure (SESS-01, SESS-02). The security work is straightforward -- fix a SQL injection via parameterized queries, encrypt credentials with AES-256-GCM using Node.js built-in `node:crypto`, and extract real Steam `sessionid` from actual Steam responses instead of fabricating random bytes. The session work consolidates two duplicated `getUserSession()` helpers into a single `SteamSessionService` class and adds pre-operation session validation.

All five requirements are backend-only changes. No Flutter modifications are needed in this phase. The work uses only built-in Node.js APIs (`node:crypto` for encryption, `pg` parameterized queries for SQL injection) -- no new npm dependencies are required. The `steam-session` library (needed for Phase 2 auth flows) is NOT required for this phase; the current session storage and validation can be hardened with existing tools.

**Primary recommendation:** Fix SEC-01 (SQL injection) first since it is the direct exploit path to the plaintext credentials that SEC-02 addresses. Then encrypt credentials at rest (SEC-02). Then fix the fabricated sessionid (SEC-03) and build the centralized SteamSessionService (SESS-02) together, since the service is where the real sessionid extraction logic belongs. Finally, add session validation (SESS-01) as a middleware/method on the service.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SEC-01 | Fix SQL injection in `getTransactionStats` query | Exact vulnerability identified at `transactions.ts:243-244`. Fix is parameterized queries with `$N` placeholders -- same pattern already used in `getTransactions()` in the same file. |
| SEC-02 | Encrypt stored session credentials in database | AES-256-GCM via `node:crypto` built-in. Encrypt `steam_session_id`, `steam_login_secure`, `steam_access_token` columns. Key from `ENCRYPTION_KEY` env var. |
| SEC-03 | Use real Steam sessionid from Steam's session state | Current code at `market.ts:126,135` generates `crypto.randomBytes(12)`. Must extract `sessionid` from Steam's `Set-Cookie` header after authenticating. |
| SESS-01 | App validates Steam session before sell operations | Lightweight validation: hit `steamcommunity.com/market/` with session cookies, check for redirect to login page. Return `SESSION_EXPIRED` error code. |
| SESS-02 | Centralized SteamSessionService replaces duplicated helpers | Two identical `getUserSession()` at `routes/market.ts:239-249` and `routes/transactions.ts:117-127`. Consolidate into `services/steamSession.ts`. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:crypto` | built-in (Node 20+) | AES-256-GCM encryption for credentials at rest | No external dependency needed. Provides `createCipheriv`, `createDecipheriv` with GCM auth tags. |
| `pg` | ^8.20.0 (already installed) | Parameterized SQL queries | Already in use. Supports `$1`, `$2` parameterized queries that prevent SQL injection. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `axios` | ^1.13.6 (already installed) | Session validation HTTP calls to Steam | Already in use. Needed for lightweight Steam endpoint checks during session validation. |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:crypto` AES-256-GCM | `encrypt-at-rest` npm package | Adds dependency for minimal convenience. `node:crypto` is sufficient and has zero supply-chain risk. |
| Raw `pg` parameterized queries | Query builder (knex, drizzle) | Overkill for fixing one function. The rest of the codebase uses raw `pg` consistently. |

**Installation:**
```bash
# No new packages needed for Phase 1
# All requirements are met by existing dependencies + node:crypto built-in
```

## Architecture Patterns

### Recommended Project Structure
```
backend/src/
├── services/
│   ├── steamSession.ts    # NEW: SteamSessionService (SESS-02)
│   ├── crypto.ts          # NEW: encrypt/decrypt helpers (SEC-02)
│   ├── market.ts          # Existing: uses SteamSessionService
│   ├── transactions.ts    # Existing: fix SQL injection (SEC-01)
│   └── ...
├── routes/
│   ├── market.ts          # Remove getUserSession(), import from service
│   └── transactions.ts    # Remove getUserSession(), import from service
└── db/
    └── migrate.ts         # Add session_expires_at column
```

### Pattern 1: SteamSessionService (Centralized Session Management)
**What:** A single service class that owns all Steam session operations: get, save, validate, encrypt/decrypt.
**When to use:** Every time any route needs to interact with Steam session state.
**Example:**
```typescript
// backend/src/services/steamSession.ts
import { pool } from "../db/pool.js";
import { encrypt, decrypt } from "./crypto.js";

export interface SteamSession {
  sessionId: string;
  steamLoginSecure: string;
  accessToken?: string;
}

export class SteamSessionService {
  /**
   * Get decrypted session for a user. Returns null if not configured.
   */
  static async getSession(userId: number): Promise<SteamSession | null> {
    const { rows } = await pool.query(
      `SELECT steam_session_id, steam_login_secure, steam_access_token
       FROM users WHERE id = $1`,
      [userId]
    );
    const row = rows[0];
    if (!row?.steam_session_id || !row?.steam_login_secure) return null;

    return {
      sessionId: decrypt(row.steam_session_id),
      steamLoginSecure: decrypt(row.steam_login_secure),
      accessToken: row.steam_access_token ? decrypt(row.steam_access_token) : undefined,
    };
  }

  /**
   * Save session with encryption at rest.
   */
  static async saveSession(
    userId: number,
    session: SteamSession
  ): Promise<void> {
    await pool.query(
      `UPDATE users
       SET steam_session_id = $1,
           steam_login_secure = $2,
           steam_access_token = $3,
           session_updated_at = NOW()
       WHERE id = $4`,
      [
        encrypt(session.sessionId),
        encrypt(session.steamLoginSecure),
        session.accessToken ? encrypt(session.accessToken) : null,
        userId,
      ]
    );
  }

  /**
   * Validate session is still active with Steam.
   * Returns true if session is valid, false if expired.
   */
  static async validateSession(session: SteamSession): Promise<boolean> {
    // Implementation: hit a lightweight Steam endpoint and check response
  }
}
```

### Pattern 2: AES-256-GCM Encryption Helper
**What:** Utility functions for encrypt/decrypt with proper IV and auth tag handling.
**When to use:** Before writing credentials to DB (encrypt) and after reading from DB (decrypt).
**Example:**
```typescript
// backend/src/services/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM
const TAG_LENGTH = 16; // 128-bit auth tag

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) throw new Error("ENCRYPTION_KEY env var not set");
  // Key must be 32 bytes (256 bits). Accept hex-encoded key.
  return Buffer.from(key, "hex");
}

/**
 * Encrypt plaintext. Returns base64 string: iv + authTag + ciphertext
 */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Pack: iv (12) + tag (16) + ciphertext
  const packed = Buffer.concat([iv, tag, encrypted]);
  return packed.toString("base64");
}

/**
 * Decrypt base64 string produced by encrypt().
 */
export function decrypt(packed: string): string {
  const buf = Buffer.from(packed, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}
```

### Pattern 3: SQL Injection Fix (Parameterized Date Filters)
**What:** Replace string interpolation with parameterized queries in `getTransactionStats`.
**When to use:** Always. Never interpolate user input into SQL.
**Example:**
```typescript
// BEFORE (vulnerable):
const dateCondition = dateFrom
  ? `AND tx_date >= '${dateFrom}' AND tx_date <= '${dateTo ?? new Date().toISOString()}'`
  : "";
await pool.query(`SELECT ... WHERE user_id = $1 ${dateCondition}`, [userId]);

// AFTER (safe):
const conditions = ["user_id = $1"];
const params: any[] = [userId];
let idx = 2;

if (dateFrom) {
  conditions.push(`tx_date >= $${idx}`);
  params.push(dateFrom);
  idx++;
  conditions.push(`tx_date <= $${idx}`);
  params.push(dateTo ?? new Date().toISOString());
  idx++;
}

const where = conditions.join(" AND ");
await pool.query(`SELECT ... WHERE ${where}`, params);
```

### Pattern 4: Session Validation Before Operations
**What:** Check Steam session liveness before attempting sell/sync operations.
**When to use:** Before any route handler that calls Steam with session cookies.
**Example:**
```typescript
// In SteamSessionService:
static async validateSession(session: SteamSession): Promise<boolean> {
  try {
    const { status, headers } = await axios.get(
      "https://steamcommunity.com/market/",
      {
        headers: {
          Cookie: `steamLoginSecure=${session.steamLoginSecure}; sessionid=${session.sessionId}`,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        maxRedirects: 0,
        validateStatus: (s) => s < 400,
        timeout: 10000,
      }
    );
    // If Steam redirects to login page, session is expired
    const location = headers["location"] || "";
    if (location.includes("/login")) return false;
    return status === 200;
  } catch {
    return false;
  }
}
```

### Anti-Patterns to Avoid
- **String interpolation in SQL:** Never use template literals with user input in SQL queries. The `getTransactionStats` function is the exact example of what NOT to do. Always use `$N` parameterized queries.
- **Fabricating Steam values:** Never generate random bytes for `sessionid`. It must come from Steam's `Set-Cookie` response. The current `crypto.randomBytes(12).toString("hex")` at `market.ts:126` is wrong.
- **Storing encryption key in code or DB:** The `ENCRYPTION_KEY` must come from environment variables, never hardcoded or stored in the same database as the encrypted data.
- **Encrypting then not decrypting on read:** Every code path that reads `steam_session_id`, `steam_login_secure`, or `steam_access_token` must go through the decrypt helper. Missing a single read path means that code path breaks.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Encryption at rest | Custom cipher construction, custom key derivation | `node:crypto` `createCipheriv` with `aes-256-gcm` | GCM provides authenticated encryption (integrity + confidentiality). Custom schemes invariably miss the auth tag or IV uniqueness. |
| SQL parameterization | String escaping, manual sanitization | `pg` `$1, $2` parameterized queries | Escaping is fragile and locale-dependent. Parameterized queries are immune to injection by design. |
| Session validation | Custom token parsing to check expiry | HTTP request to Steam endpoint | Token expiry times are unreliable (Steam can invalidate early). The only truth is whether Steam accepts the cookies. |

**Key insight:** Every security fix in this phase has a well-established built-in solution. The existing codebase already uses `pg` parameterized queries everywhere except the one vulnerable function. The fix is consistency, not invention.

## Common Pitfalls

### Pitfall 1: Migration Breaks Existing Data
**What goes wrong:** Encrypting the credential columns means existing plaintext values become unreadable. If the migration encrypts in-place but the code hasn't been deployed yet, reads fail. If code deploys first but migration hasn't run, encrypted writes go into a column still expected to be plaintext.
**Why it happens:** Schema migration and code deployment are not atomic.
**How to avoid:** Two-phase approach: (1) Deploy code that can read BOTH plaintext and encrypted values (try decrypt, if it fails treat as plaintext). (2) Run a one-time migration script that reads all plaintext values, encrypts them, and writes back. (3) After migration completes, remove the plaintext fallback.
**Warning signs:** Users suddenly unable to sell after a deployment. `decrypt()` throws on values that aren't base64-encoded.

### Pitfall 2: Missing ENCRYPTION_KEY Crashes Server
**What goes wrong:** `getKey()` throws if `ENCRYPTION_KEY` is not set. If this is called during a request, it returns a 500 error. If called during startup, server won't start.
**Why it happens:** Env var not added to `.env` or deployment config.
**How to avoid:** Validate `ENCRYPTION_KEY` at server startup alongside `JWT_SECRET` and `DATABASE_URL`. Fail fast with a clear message. Generate the key with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.
**Warning signs:** Server crashes on first request that touches session data.

### Pitfall 3: Forgetting a getUserSession() Call Site
**What goes wrong:** After creating `SteamSessionService`, one call site still uses the old inline `getUserSession()` or directly queries the DB. That path reads encrypted data as plaintext, producing garbled session cookies.
**Why it happens:** Search-and-replace misses, or a new code path added during development bypasses the service.
**How to avoid:** After refactoring, `grep -r "getUserSession\|steam_login_secure\|steam_session_id" backend/src/routes/` to verify no direct DB reads remain outside the service. The column names should only appear in `steamSession.ts` and `migrate.ts`.

### Pitfall 4: Session Validation Adds Latency to Every Sell
**What goes wrong:** Validating the session against Steam before every single sell operation adds ~500ms-1s per request. For bulk sells of 50 items, this is negligible (one check before the batch). But if validation is per-item, it adds 25-50 seconds.
**Why it happens:** Validation placed inside `sellItem()` instead of at the route handler level.
**How to avoid:** Validate ONCE at the start of each sell/bulk-sell route handler. Do not validate per-item within `bulkSell()`. The session won't expire mid-batch (batches take ~75 seconds, sessions last hours).

### Pitfall 5: Real sessionid Extraction Requires an Authenticated Request
**What goes wrong:** To get a real `sessionid` from Steam, you need to make an HTTP request to `steamcommunity.com` with valid `steamLoginSecure` cookies and read the `Set-Cookie` header. But the current `exchangeTokenForSession` function constructs `steamLoginSecure` AND `sessionId` simultaneously -- there's a chicken-and-egg problem.
**Why it happens:** The `sessionid` is set by Steam as a cookie when you visit any Steam Community page while authenticated.
**How to avoid:** Construct `steamLoginSecure` first (format: `steamId%7C%7CaccessToken`). Then make a GET request to `steamcommunity.com` with only `steamLoginSecure` as a cookie. Steam will respond with a `Set-Cookie` header that includes the `sessionid`. Extract and store it.

## Code Examples

### Exact SQL Injection Fix for SEC-01

The vulnerable code is in `backend/src/services/transactions.ts` at lines 243-244:

```typescript
// CURRENT (VULNERABLE) - lines 243-244:
const dateCondition = dateFrom
  ? `AND tx_date >= '${dateFrom}' AND tx_date <= '${dateTo ?? new Date().toISOString()}'`
  : "";

// This is used in THREE queries (lines 247, 258, 267) that all share the same pattern:
// WHERE user_id = $1 ${dateCondition}
```

The fix must update all three queries in `getTransactionStats` to use parameterized dates:

```typescript
export async function getTransactionStats(
  userId: number,
  dateFrom?: string,
  dateTo?: string
): Promise<{ /* same return type */ }> {
  const conditions = ["user_id = $1"];
  const params: any[] = [userId];
  let idx = 2;

  if (dateFrom) {
    conditions.push(`tx_date >= $${idx}`);
    params.push(dateFrom);
    idx++;
    conditions.push(`tx_date <= $${idx}`);
    params.push(dateTo ?? new Date().toISOString());
    idx++;
  }

  const where = conditions.join(" AND ");

  const { rows: stats } = await pool.query(
    `SELECT type, COUNT(*) as count, SUM(price_cents) as total
     FROM transactions
     WHERE ${where}
     GROUP BY type`,
    params
  );

  // ... same for topBought and topSold queries (use same where + params)
}
```

### Extracting Real sessionid from Steam (SEC-03)

```typescript
// In SteamSessionService:
static async extractSessionId(steamLoginSecure: string): Promise<string | null> {
  try {
    const response = await axios.get("https://steamcommunity.com/", {
      headers: {
        Cookie: `steamLoginSecure=${steamLoginSecure}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      maxRedirects: 5,
      timeout: 10000,
    });

    // Extract sessionid from Set-Cookie header
    const cookies = response.headers["set-cookie"];
    if (!cookies) return null;

    for (const cookie of cookies) {
      const match = cookie.match(/sessionid=([^;]+)/);
      if (match) return match[1];
    }
    return null;
  } catch {
    return null;
  }
}
```

### Database Migration for session_updated_at

```sql
-- Add to migrate.ts schema string:
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_updated_at TIMESTAMPTZ;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| String escaping for SQL safety | Parameterized queries (`$1, $2`) | Standard since pg v1+ | Eliminates SQL injection by design |
| Manual AES-CBC + HMAC | AES-256-GCM (authenticated encryption) | GCM widely adopted since Node 10+ | Single primitive provides both confidentiality and integrity |
| Random sessionid for CSRF | Extract real sessionid from Steam cookies | Always was the correct approach | Fabricated IDs fail for write operations on Steam |

**Deprecated/outdated:**
- AES-CBC without HMAC: Does not provide integrity. Use AES-256-GCM instead.
- `crypto.createCipher()` (without `iv`): Deprecated in Node.js. Use `createCipheriv()` with explicit IV.

## Open Questions

1. **Backward compatibility during credential encryption migration**
   - What we know: Existing plaintext values in `steam_session_id`, `steam_login_secure`, `steam_access_token` columns need to be encrypted
   - What's unclear: Whether to do a big-bang migration or a gradual transition with dual-read support
   - Recommendation: Implement dual-read (try decrypt, fallback to plaintext) and a one-time migration script. Remove plaintext fallback after confirming all rows are encrypted.

2. **Session validation endpoint choice**
   - What we know: Need a lightweight Steam endpoint that returns quickly and indicates session validity
   - What's unclear: The most reliable endpoint -- `steamcommunity.com/market/` may be slower than needed, or may itself be rate-limited
   - Recommendation: Use `GET https://steamcommunity.com/market/` and check for login redirect. If too slow, try `GET https://steamcommunity.com/my/` (profile page). Cache validation result for 5 minutes per user to avoid hammering Steam.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (recommended -- works with ESM, TypeScript-native, fast) |
| Config file | none -- see Wave 0 |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SEC-01 | `getTransactionStats` uses parameterized queries for date filters | unit | `npx vitest run tests/services/transactions.test.ts -t "parameterized"` | No -- Wave 0 |
| SEC-02 | Encrypt/decrypt roundtrip for session credentials | unit | `npx vitest run tests/services/crypto.test.ts` | No -- Wave 0 |
| SEC-02 | SteamSessionService reads encrypted values correctly | unit | `npx vitest run tests/services/steamSession.test.ts -t "decrypt"` | No -- Wave 0 |
| SEC-03 | sessionid extracted from Steam response, not random bytes | unit | `npx vitest run tests/services/steamSession.test.ts -t "sessionid"` | No -- Wave 0 |
| SESS-01 | Session validation returns false for expired sessions | unit | `npx vitest run tests/services/steamSession.test.ts -t "validate"` | No -- Wave 0 |
| SESS-02 | No getUserSession() exists outside SteamSessionService | integration | `grep -r "getUserSession" backend/src/routes/` (expect 0 matches) | N/A -- grep check |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/vitest.config.ts` -- vitest config for ESM + TypeScript
- [ ] `backend/tests/services/crypto.test.ts` -- encrypt/decrypt unit tests
- [ ] `backend/tests/services/transactions.test.ts` -- parameterized query tests for SEC-01
- [ ] `backend/tests/services/steamSession.test.ts` -- session service tests
- [ ] Install: `npm install -D vitest` in `backend/`
- [ ] Add `"test": "vitest run"` to `backend/package.json` scripts

## Sources

### Primary (HIGH confidence)
- Direct codebase analysis: `backend/src/services/transactions.ts:243-244` (SQL injection), `backend/src/routes/market.ts:126,135` (fabricated sessionid), `backend/src/routes/market.ts:239-249` and `backend/src/routes/transactions.ts:117-127` (duplicated getUserSession)
- `backend/src/db/migrate.ts:73-75` (plaintext credential columns)
- Node.js `crypto` module documentation -- `createCipheriv`, `createDecipheriv`, AES-256-GCM
- [npm steam-session v1.9.4](https://www.npmjs.com/package/steam-session) -- confirmed latest version, verified `getWebCookies()` returns sessionid from Steam
- [AES-256-GCM implementation gist](https://gist.github.com/rjz/15baffeab434b8125ca4d783f4116d81) -- IV + authTag pattern

### Secondary (MEDIUM confidence)
- [DoctorMcKay/node-steam-session GitHub](https://github.com/DoctorMcKay/node-steam-session) -- API surface, events, sessionid handling
- Steam Community sessionid behavior (from community knowledge, verified against codebase's current broken approach)

### Tertiary (LOW confidence)
- Steam session validation endpoint behavior -- specific redirect patterns for expired sessions need runtime verification

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all tools are built-in Node.js or existing dependencies
- Architecture: HIGH -- patterns are straightforward service extraction and well-established crypto
- Pitfalls: HIGH -- pitfalls are derived from direct codebase analysis of existing bugs
- Session validation: MEDIUM -- exact Steam endpoint behavior for validation needs runtime testing

**Research date:** 2026-03-08
**Valid until:** 2026-04-08 (60 days -- this is stable infrastructure, not fast-moving APIs)
