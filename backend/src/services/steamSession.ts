import { pool } from "../db/pool.js";
import { encrypt, decrypt } from "./crypto.js";
import axios from "axios";
import { LoginSession, EAuthTokenPlatformType } from "steam-session";
import { SessionExpiredError } from "../utils/errors.js";
import { steamRequest } from "../utils/SteamClient.js";
import QRCode from "qrcode";
import crypto from "crypto";
import { detectWalletCurrency } from "./currency.js";

export interface SteamSession {
  sessionId: string;
  steamLoginSecure: string;
  accessToken?: string;
}

interface PendingSession {
  loginSession: LoginSession;
  createdAt: Date;
  accountId: number;
  userId?: number;
  linkMode?: boolean;
  status: "pending" | "guard_required" | "authenticated" | "expired";
  cookies?: SteamSession;
}

const PENDING_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class SteamSessionService {
  private static pendingSessions = new Map<string, PendingSession>();

  // Cleanup expired pending sessions every 60 seconds
  private static cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [nonce, pending] of SteamSessionService.pendingSessions) {
      if (now - pending.createdAt.getTime() > PENDING_TTL_MS) {
        pending.loginSession.cancelLoginAttempt();
        SteamSessionService.pendingSessions.delete(nonce);
      }
    }
  }, 60_000);

  // Prevent the interval from keeping the process alive
  static {
    SteamSessionService.cleanupInterval.unref();
  }

  /**
   * Decrypt a single field with plaintext fallback for migration compatibility.
   */
  private static safeDecrypt(value: string): string {
    try {
      return decrypt(value);
    } catch {
      return value;
    }
  }

  /**
   * Decode a JWT refresh token and return its expiry timestamp (seconds).
   * Returns null if the token is not a valid JWT.
   */
  private static getRefreshTokenExpiry(token: string): number | null {
    try {
      const parts = token.split(".");
      if (parts.length !== 3) return null;
      const payload = JSON.parse(
        Buffer.from(parts[1], "base64url").toString("utf8")
      );
      return typeof payload.exp === "number" ? payload.exp : null;
    } catch {
      return null;
    }
  }

  /**
   * Get detailed session info for an account, including refresh token expiry.
   */
  static async getSessionDetails(accountId: number): Promise<{
    status: "valid" | "expiring" | "expired" | "none";
    refreshTokenExpiresAt: string | null;
    refreshTokenExpired: boolean;
    sessionUpdatedAt: string | null;
  }> {
    const status = await this.getSessionStatus(accountId);

    const { rows } = await pool.query(
      `SELECT steam_refresh_token, session_updated_at
       FROM steam_accounts WHERE id = $1`,
      [accountId]
    );
    const row = rows[0];

    let refreshTokenExpiresAt: string | null = null;
    let refreshTokenExpired = false;

    if (row?.steam_refresh_token) {
      const decrypted = this.safeDecrypt(row.steam_refresh_token);
      const exp = this.getRefreshTokenExpiry(decrypted);
      if (exp) {
        refreshTokenExpiresAt = new Date(exp * 1000).toISOString();
        refreshTokenExpired = Date.now() > exp * 1000;
      }
    } else {
      // No refresh token at all — effectively expired
      refreshTokenExpired = true;
    }

    return {
      status,
      refreshTokenExpiresAt,
      refreshTokenExpired,
      sessionUpdatedAt: row?.session_updated_at
        ? new Date(row.session_updated_at).toISOString()
        : null,
    };
  }

  // ─── Active Account Resolution ────────────────────────────────────────

  /**
   * Get the active steam_accounts.id for a user.
   * Falls back to the first linked account if active_account_id is not set.
   */
  static async getActiveAccountId(userId: number): Promise<number> {
    const { rows } = await pool.query(
      `SELECT active_account_id FROM users WHERE id = $1`,
      [userId]
    );
    if (rows[0]?.active_account_id) return rows[0].active_account_id;

    // Fallback: first linked account
    const { rows: accounts } = await pool.query(
      `SELECT id FROM steam_accounts WHERE user_id = $1 ORDER BY added_at LIMIT 1`,
      [userId]
    );
    if (accounts.length === 0) {
      throw new Error("No linked Steam accounts");
    }

    // Persist the default
    await pool.query(
      `UPDATE users SET active_account_id = $1 WHERE id = $2`,
      [accounts[0].id, userId]
    );
    return accounts[0].id;
  }

  // ─── Session CRUD ─────────────────────────────────────────────────────

  /**
   * Get a Steam session for a specific account, decrypting credentials.
   */
  static async getSession(accountId: number): Promise<SteamSession | null> {
    const { rows } = await pool.query(
      `SELECT steam_session_id, steam_login_secure, steam_access_token
       FROM steam_accounts WHERE id = $1`,
      [accountId]
    );
    const row = rows[0];
    if (!row?.steam_session_id || !row?.steam_login_secure) return null;

    return {
      sessionId: this.safeDecrypt(row.steam_session_id),
      steamLoginSecure: this.safeDecrypt(row.steam_login_secure),
      accessToken: row.steam_access_token
        ? this.safeDecrypt(row.steam_access_token)
        : undefined,
    };
  }

  /**
   * Save a Steam session for a specific account, encrypting all credential fields.
   * Also triggers wallet currency detection in the background.
   */
  static async saveSession(
    accountId: number,
    session: SteamSession
  ): Promise<void> {
    // Validate: session's steam_id must match the account's steam_id
    const sessionSteamId = this.extractSteamIdFromCookie(session.steamLoginSecure);
    if (sessionSteamId) {
      const { rows } = await pool.query(
        `SELECT steam_id FROM steam_accounts WHERE id = $1`,
        [accountId]
      );
      if (rows[0]?.steam_id && rows[0].steam_id !== sessionSteamId) {
        console.error(`[Session] MISMATCH: account ${accountId} has steam_id ${rows[0].steam_id} but session belongs to ${sessionSteamId}. Rejecting save.`);
        throw new Error(`Session steam_id mismatch: expected ${rows[0].steam_id}, got ${sessionSteamId}`);
      }
    }

    await pool.query(
      `UPDATE steam_accounts
       SET steam_session_id = $1,
           steam_login_secure = $2,
           steam_access_token = $3,
           session_updated_at = NOW()
       WHERE id = $4`,
      [
        encrypt(session.sessionId),
        encrypt(session.steamLoginSecure),
        session.accessToken ? encrypt(session.accessToken) : null,
        accountId,
      ]
    );

    // Detect wallet currency in the background (non-blocking)
    detectWalletCurrency(session.steamLoginSecure)
      .then(async (currencyId) => {
        if (currencyId) {
          await pool.query(
            "UPDATE steam_accounts SET wallet_currency = $1 WHERE id = $2",
            [currencyId, accountId]
          );
        }
      })
      .catch((err) => {
        console.warn("[Session] Wallet currency detection failed:", err.message);
      });

    // Auto-fetch trade token in the background (non-blocking)
    import("./tradeOffers.js")
      .then(({ fetchTradeToken }) => fetchTradeToken(session))
      .then(async (token) => {
        if (token) {
          await pool.query(
            "UPDATE steam_accounts SET trade_token = $1 WHERE id = $2",
            [token, accountId]
          );
          console.log(`[Session] Auto-fetched trade token for account ${accountId}`);
        }
      })
      .catch((err) => {
        console.warn("[Session] Trade token fetch failed:", err.message);
      });
  }

  /**
   * Save session method and optional refresh token.
   */
  private static async saveSessionMeta(
    accountId: number,
    method: string,
    refreshToken: string | null
  ): Promise<void> {
    await pool.query(
      `UPDATE steam_accounts
       SET session_method = $1,
           steam_refresh_token = $2
       WHERE id = $3`,
      [
        method,
        refreshToken ? encrypt(refreshToken) : null,
        accountId,
      ]
    );
  }

  // ─── Session Validation ───────────────────────────────────────────────

  /**
   * Extract real sessionid from Steam by making a GET request with steamLoginSecure.
   */
  static async extractSessionId(
    steamLoginSecure: string
  ): Promise<string | null> {
    try {
      const resp = await steamRequest<string>({
        url: "https://steamcommunity.com/",
        cookies: { steamLoginSecure, sessionId: "" },
        followRedirects: true,
        validateStatus: () => true,
        maxRetries: 1,
      });
      const cookies = resp.headers["set-cookie"];
      if (!cookies) return null;
      const cookieArray = Array.isArray(cookies) ? cookies : [cookies];
      for (const cookie of cookieArray) {
        const match = cookie.match(/sessionid=([^;]+)/);
        if (match) return match[1];
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * Validate that a Steam session is still active by checking Steam.
   */
  static async validateSession(session: SteamSession): Promise<boolean> {
    try {
      const resp = await steamRequest({
        url: "https://steamcommunity.com/my/",
        cookies: {
          steamLoginSecure: session.steamLoginSecure,
          sessionId: session.sessionId,
        },
        followRedirects: false,
        validateStatus: () => true,
        maxRetries: 1,
      });
      const status = resp.status;
      const location = (resp.headers?.["location"] || "") as string;
      if (location.includes("/login")) return false;
      return status === 200 || (status === 302 && !location.includes("/login"));
    } catch {
      return false;
    }
  }

  // ─── QR Code Auth Flow ───────────────────────────────────────────────

  /**
   * Start a QR login session for a specific account.
   */
  static async startQRSession(
    accountId: number
  ): Promise<{ qrImage: string; nonce: string }> {
    const loginSession = new LoginSession(EAuthTokenPlatformType.WebBrowser);
    const startResult = await loginSession.startWithQR();

    if (!startResult.qrChallengeUrl) {
      throw new Error("No QR challenge URL returned from Steam");
    }

    const qrImage = await QRCode.toDataURL(startResult.qrChallengeUrl);
    const nonce = crypto.randomUUID();

    const pending: PendingSession = {
      loginSession,
      createdAt: new Date(),
      accountId,
      status: "pending",
    };

    loginSession.on("authenticated", async () => {
      try {
        const cookieStrings = await loginSession.getWebCookies();
        pending.cookies = this.parseCookies(cookieStrings);
        pending.status = "authenticated";
      } catch (err) {
        console.error("Failed to get web cookies after QR auth:", err);
        pending.status = "expired";
      }
    });

    loginSession.on("timeout", () => {
      pending.status = "expired";
    });

    loginSession.on("error", (err) => {
      console.error("QR login session error:", err);
      pending.status = "expired";
    });

    this.pendingSessions.set(nonce, pending);
    return { qrImage, nonce };
  }

  /**
   * Poll a QR session for status. Saves session to the account on success.
   */
  static async pollQRSession(
    nonce: string,
    accountId: number
  ): Promise<{ status: "pending" | "authenticated" | "expired" }> {
    const pending = this.pendingSessions.get(nonce);
    if (!pending || pending.accountId !== accountId) {
      return { status: "expired" };
    }

    if (pending.status === "authenticated" && pending.cookies) {
      await this.saveSession(accountId, pending.cookies);
      const refreshToken = pending.loginSession.refreshToken;
      const accessToken = pending.loginSession.accessToken;
      console.log(`[Session] QR auth complete for account ${accountId}:`);
      console.log(`[Session]   refreshToken: ${refreshToken ? refreshToken.substring(0, 30) + '... (' + refreshToken.length + ' chars)' : 'NULL'}`);
      console.log(`[Session]   accessToken: ${accessToken ? accessToken.substring(0, 30) + '... (' + accessToken.length + ' chars)' : 'NULL'}`);
      if (refreshToken) {
        try {
          const parts = refreshToken.split('.');
          if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
            console.log(`[Session]   refreshToken exp: ${new Date(payload.exp * 1000).toISOString()}, sub: ${payload.sub}`);
          }
        } catch { /* ignore */ }
      }
      await this.saveSessionMeta(accountId, "qr", refreshToken || null);
      this.pendingSessions.delete(nonce);
      return { status: "authenticated" };
    }

    if (pending.status === "expired") {
      this.pendingSessions.delete(nonce);
      return { status: "expired" };
    }

    return { status: "pending" };
  }

  // ─── Credential + Guard Auth Flow ────────────────────────────────────

  /**
   * Start a credential login for a specific account.
   */
  static async startCredentialLogin(
    accountId: number,
    username: string,
    password: string
  ): Promise<{ nonce: string; guardRequired: boolean }> {
    const loginSession = new LoginSession(EAuthTokenPlatformType.WebBrowser);
    const nonce = crypto.randomUUID();

    const pending: PendingSession = {
      loginSession,
      createdAt: new Date(),
      accountId,
      status: "pending",
    };

    loginSession.on("authenticated", async () => {
      try {
        const cookieStrings = await loginSession.getWebCookies();
        pending.cookies = this.parseCookies(cookieStrings);
        pending.status = "authenticated";
      } catch (err) {
        console.error("Failed to get web cookies after credential auth:", err);
        pending.status = "expired";
      }
    });

    loginSession.on("timeout", () => {
      pending.status = "expired";
    });

    loginSession.on("error", (err) => {
      console.error("Credential login session error:", err);
      pending.status = "expired";
    });

    this.pendingSessions.set(nonce, pending);

    const startResult = await loginSession.startWithCredentials({
      accountName: username,
      password,
    });

    const guardRequired = startResult.actionRequired === true;
    if (guardRequired) {
      pending.status = "guard_required";
    }

    return { nonce, guardRequired };
  }

  /**
   * Submit a Steam Guard code for a pending credential login.
   */
  static async submitGuardCode(
    nonce: string,
    code: string
  ): Promise<SteamSession | null> {
    const pending = this.pendingSessions.get(nonce);
    if (!pending || pending.status !== "guard_required") {
      return null;
    }

    try {
      await pending.loginSession.submitSteamGuardCode(code);
    } catch {
      return null;
    }

    const maxWait = 5000;
    const interval = 500;
    let waited = 0;

    while (waited < maxWait) {
      if ((pending.status as string) === "authenticated" && pending.cookies) {
        await this.saveSession(pending.accountId, pending.cookies);
        const refreshToken = pending.loginSession.refreshToken;
        await this.saveSessionMeta(
          pending.accountId,
          "credentials",
          refreshToken || null
        );
        this.pendingSessions.delete(nonce);
        return pending.cookies;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
      waited += interval;
    }

    return null;
  }

  // ─── Client JS Token Flow ───────────────────────────────────────────

  /**
   * Handle a clientjstoken for a specific account.
   */
  static async handleClientToken(
    accountId: number,
    tokenData: { steamLoginSecure: string; steamId?: string }
  ): Promise<SteamSession | null> {
    const sessionId = await this.extractSessionId(tokenData.steamLoginSecure);
    if (!sessionId) return null;

    const session: SteamSession = {
      sessionId,
      steamLoginSecure: tokenData.steamLoginSecure,
    };

    await this.saveSession(accountId, session);
    await this.saveSessionMeta(accountId, "clienttoken", null);
    return session;
  }

  // ─── Session Status ─────────────────────────────────────────────────

  /**
   * Check the current session status for a specific account.
   */
  static async getSessionStatus(
    accountId: number
  ): Promise<"valid" | "expiring" | "expired" | "none"> {
    const { rows } = await pool.query(
      `SELECT steam_login_secure, session_updated_at
       FROM steam_accounts WHERE id = $1`,
      [accountId]
    );

    const row = rows[0];
    if (!row?.steam_login_secure) return "none";

    if (row.session_updated_at) {
      const updatedAt = new Date(row.session_updated_at).getTime();
      const hoursSinceUpdate = (Date.now() - updatedAt) / (1000 * 60 * 60);
      if (hoursSinceUpdate > 20) return "expiring";
      // Trust sessions updated within the last 2 hours — skip live validation
      // to avoid false negatives from Steam rate-limits / timeouts
      if (hoursSinceUpdate < 2) return "valid";
    }

    const session = await this.getSession(accountId);
    if (!session) return "none";

    const isValid = await this.validateSession(session);
    return isValid ? "valid" : "expired";
  }

  // ─── Session Refresh ────────────────────────────────────────────────

  /**
   * Attempt to refresh a Steam session using stored refresh token.
   */
  static async refreshSession(
    accountId: number
  ): Promise<{ refreshed: boolean; reason?: string }> {
    const { rows } = await pool.query(
      `SELECT steam_refresh_token FROM steam_accounts WHERE id = $1`,
      [accountId]
    );

    const row = rows[0];
    if (!row?.steam_refresh_token) {
      return { refreshed: false, reason: "no_refresh_token" };
    }

    const refreshToken = this.safeDecrypt(row.steam_refresh_token);

    try {
      // Use WebBrowser + getWebCookies() which does finalizelogin with refresh token as nonce.
      // refreshAccessToken() fails with AccessDenied for WebBrowser since 2025-04.
      const loginSession = new LoginSession(EAuthTokenPlatformType.WebBrowser);
      loginSession.refreshToken = refreshToken;

      // getWebCookies() for WebBrowser uses finalizelogin (not refreshAccessToken)
      const cookieStrings = await loginSession.getWebCookies();
      const session = this.parseCookies(cookieStrings);

      await this.saveSession(accountId, session);

      if (loginSession.refreshToken && loginSession.refreshToken !== refreshToken) {
        await this.saveSessionMeta(
          accountId,
          "refresh",
          loginSession.refreshToken
        );
      }

      return { refreshed: true };
    } catch (err) {
      console.error(`[Session] Refresh failed for account ${accountId}:`, err);
      return { refreshed: false, reason: "refresh_failed" };
    }
  }

  /**
   * Ensure a specific account has a valid Steam session, refreshing if necessary.
   */
  static async ensureValidSession(accountId: number): Promise<SteamSession> {
    const status = await this.getSessionStatus(accountId);
    console.log(`[Session] ensureValidSession: accountId=${accountId}, status=${status}`);

    if (status === "valid") {
      const session = await this.getSession(accountId);
      if (session) return session;
    }

    if (status === "expiring" || status === "expired") {
      const result = await this.refreshSession(accountId);
      console.log(`[Session] Refresh result for accountId=${accountId}:`, result);
      if (result.refreshed) {
        const session = await this.getSession(accountId);
        if (session) return session;
      }
    }

    console.error(`[Session] ensureValidSession FAILED for accountId=${accountId}, status=${status}`);
    throw new SessionExpiredError("Steam session expired or not configured. Please re-authenticate.");
  }

  // ─── Link Mode Helpers ──────────────────────────────────────────────

  /**
   * Extract Steam ID from steamLoginSecure cookie value.
   * Format: steamId%7C%7C...token... or steamId||...token...
   */
  static extractSteamIdFromCookie(steamLoginSecure: string): string | null {
    // URL-decoded: steamId||token  or URL-encoded: steamId%7C%7Ctoken
    const decoded = decodeURIComponent(steamLoginSecure);
    const parts = decoded.split("||");
    if (parts.length >= 2 && /^\d{17}$/.test(parts[0])) {
      return parts[0];
    }
    return null;
  }

  /**
   * Create a new steam_accounts entry for a linked account and save session.
   * Returns the new account ID.
   */
  static async linkNewAccount(
    userId: number,
    cookies: SteamSession,
    method: string,
    refreshToken: string | null
  ): Promise<{ accountId: number; steamId: string }> {
    const steamId = this.extractSteamIdFromCookie(cookies.steamLoginSecure);
    if (!steamId) {
      throw new Error("Could not extract Steam ID from session cookies");
    }

    // Fetch Steam profile for display name + avatar
    let displayName = steamId;
    let avatarUrl = "";
    try {
      const { getSteamProfile } = await import("./steam.js");
      const profile = await getSteamProfile(steamId);
      displayName = profile.personaname || steamId;
      avatarUrl = profile.avatarfull || "";
    } catch {
      // Non-fatal — use steamId as display name
    }

    // Upsert steam_accounts entry
    const { rows } = await pool.query(
      `INSERT INTO steam_accounts (user_id, steam_id, display_name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, steam_id) DO UPDATE SET display_name = $3, avatar_url = $4
       RETURNING id`,
      [userId, steamId, displayName, avatarUrl]
    );
    const accountId = rows[0].id;

    // Save session credentials
    await this.saveSession(accountId, cookies);
    await this.saveSessionMeta(accountId, method, refreshToken);

    return { accountId, steamId };
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  /**
   * Parse cookie strings from getWebCookies() into a SteamSession.
   */
  private static parseCookies(cookieStrings: string[]): SteamSession {
    let sessionId = "";
    let steamLoginSecure = "";

    for (const rawCookie of cookieStrings) {
      const lower = rawCookie.toLowerCase();

      if (lower.includes("domain=") && !lower.includes("steamcommunity.com")) {
        continue;
      }

      const cookie = rawCookie.split(";")[0].trim();
      const [name, ...valueParts] = cookie.split("=");
      const value = valueParts.join("=");

      if (name === "sessionid" && !sessionId) {
        sessionId = value;
      } else if (name === "steamLoginSecure" && !steamLoginSecure) {
        steamLoginSecure = value;
      }
    }

    if (!sessionId || !steamLoginSecure) {
      throw new Error(
        "Failed to extract required cookies from Steam response"
      );
    }

    return { sessionId, steamLoginSecure };
  }
}
