import { pool } from "../db/pool.js";
import { encrypt, decrypt } from "./crypto.js";
import axios from "axios";
import { LoginSession, EAuthTokenPlatformType } from "steam-session";
import QRCode from "qrcode";
import crypto from "crypto";

export interface SteamSession {
  sessionId: string;
  steamLoginSecure: string;
  accessToken?: string;
}

interface PendingSession {
  loginSession: LoginSession;
  createdAt: Date;
  userId: number;
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
   * During migration period, DB may contain both encrypted and plaintext values.
   */
  private static safeDecrypt(value: string): string {
    try {
      return decrypt(value);
    } catch {
      // Plaintext fallback during migration period
      return value;
    }
  }

  /**
   * Get a user's Steam session from DB, decrypting credentials.
   * Returns null if session not configured.
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
      sessionId: this.safeDecrypt(row.steam_session_id),
      steamLoginSecure: this.safeDecrypt(row.steam_login_secure),
      accessToken: row.steam_access_token
        ? this.safeDecrypt(row.steam_access_token)
        : undefined,
    };
  }

  /**
   * Save a user's Steam session to DB, encrypting all credential fields.
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
   * Extract real sessionid from Steam by making a GET request with steamLoginSecure.
   * Returns the sessionid from Set-Cookie header, or null if not found.
   */
  static async extractSessionId(
    steamLoginSecure: string
  ): Promise<string | null> {
    try {
      const response = await axios.get("https://steamcommunity.com/", {
        headers: {
          Cookie: `steamLoginSecure=${steamLoginSecure}`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
        maxRedirects: 5,
        timeout: 10000,
      });
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

  /**
   * Validate that a Steam session is still active by checking Steam Market.
   * Returns false if Steam redirects to login or on network error.
   */
  static async validateSession(session: SteamSession): Promise<boolean> {
    try {
      const { status, headers } = await axios.get(
        "https://steamcommunity.com/market/",
        {
          headers: {
            Cookie: `steamLoginSecure=${session.steamLoginSecure}; sessionid=${session.sessionId}`,
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          },
          maxRedirects: 0,
          validateStatus: (s: number) => s < 400,
          timeout: 10000,
        }
      );
      const location = headers["location"] || "";
      if (location.includes("/login")) return false;
      return status === 200;
    } catch {
      return false;
    }
  }

  // ─── QR Code Auth Flow ───────────────────────────────────────────────

  /**
   * Start a QR login session. Returns QR image (base64 data URL) and nonce.
   */
  static async startQRSession(
    userId: number
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
      userId,
      status: "pending",
    };

    // Listen for successful authentication
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

    // Listen for timeout
    loginSession.on("timeout", () => {
      pending.status = "expired";
    });

    // Listen for errors to prevent unhandled crashes
    loginSession.on("error", (err) => {
      console.error("QR login session error:", err);
      pending.status = "expired";
    });

    this.pendingSessions.set(nonce, pending);
    return { qrImage, nonce };
  }

  /**
   * Poll a QR session for status. Returns status and saves session on success.
   */
  static async pollQRSession(
    nonce: string,
    userId: number
  ): Promise<{ status: "pending" | "authenticated" | "expired" }> {
    const pending = this.pendingSessions.get(nonce);
    if (!pending || pending.userId !== userId) {
      return { status: "expired" };
    }

    if (pending.status === "authenticated" && pending.cookies) {
      // Save session and refresh token to DB
      await this.saveSession(userId, pending.cookies);
      const refreshToken = pending.loginSession.refreshToken;
      await this.saveSessionMeta(userId, "qr", refreshToken || null);
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
   * Start a credential login. Returns nonce and whether Steam Guard is required.
   */
  static async startCredentialLogin(
    userId: number,
    username: string,
    password: string
  ): Promise<{ nonce: string; guardRequired: boolean }> {
    const loginSession = new LoginSession(EAuthTokenPlatformType.WebBrowser);
    const nonce = crypto.randomUUID();

    const pending: PendingSession = {
      loginSession,
      createdAt: new Date(),
      userId,
      status: "pending",
    };

    // Listen for successful authentication
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

    // Start with credentials -- may throw on invalid password
    const startResult = await loginSession.startWithCredentials({
      accountName: username,
      password,
    });

    // Determine if guard code is required
    const guardRequired = startResult.actionRequired === true;
    if (guardRequired) {
      pending.status = "guard_required";
    }

    return { nonce, guardRequired };
  }

  /**
   * Submit a Steam Guard code for a pending credential login.
   * Returns the session on success, null on failure/timeout.
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
      // Code was incorrect or other error
      return null;
    }

    // Wait up to 5 seconds for authenticated status
    const maxWait = 5000;
    const interval = 500;
    let waited = 0;

    while (waited < maxWait) {
      if ((pending.status as string) === "authenticated" && pending.cookies) {
        await this.saveSession(pending.userId, pending.cookies);
        const refreshToken = pending.loginSession.refreshToken;
        await this.saveSessionMeta(
          pending.userId,
          "credentials",
          refreshToken || null
        );
        this.pendingSessions.delete(nonce);
        return pending.cookies;
      }
      await new Promise((resolve) => setTimeout(resolve, interval));
      waited += interval;
    }

    // Timed out waiting for authentication
    return null;
  }

  // ─── Client JS Token Flow ───────────────────────────────────────────

  /**
   * Handle a clientjstoken -- extract session from steamLoginSecure cookie.
   * Returns session on success, null on failure.
   */
  static async handleClientToken(
    userId: number,
    tokenData: { steamLoginSecure: string; steamId?: string }
  ): Promise<SteamSession | null> {
    const sessionId = await this.extractSessionId(tokenData.steamLoginSecure);
    if (!sessionId) return null;

    const session: SteamSession = {
      sessionId,
      steamLoginSecure: tokenData.steamLoginSecure,
    };

    await this.saveSession(userId, session);
    await this.saveSessionMeta(userId, "clienttoken", null);
    return session;
  }

  // ─── Session Status ─────────────────────────────────────────────────

  /**
   * Check the current session status for a user.
   * Returns: 'valid' | 'expiring' | 'expired' | 'none'
   */
  static async getSessionStatus(
    userId: number
  ): Promise<"valid" | "expiring" | "expired" | "none"> {
    const { rows } = await pool.query(
      `SELECT steam_login_secure, session_updated_at
       FROM users WHERE id = $1`,
      [userId]
    );

    const row = rows[0];
    if (!row?.steam_login_secure) return "none";

    // Check if session is approaching expiry (>20 hours old)
    if (row.session_updated_at) {
      const updatedAt = new Date(row.session_updated_at).getTime();
      const hoursSinceUpdate = (Date.now() - updatedAt) / (1000 * 60 * 60);
      if (hoursSinceUpdate > 20) return "expiring";
    }

    // Validate session by checking with Steam
    const session = await this.getSession(userId);
    if (!session) return "none";

    const isValid = await this.validateSession(session);
    return isValid ? "valid" : "expired";
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  /**
   * Parse cookie strings from getWebCookies() into a SteamSession.
   * Cookie format: 'name=value'
   */
  private static parseCookies(cookieStrings: string[]): SteamSession {
    let sessionId = "";
    let steamLoginSecure = "";

    for (const cookie of cookieStrings) {
      const [name, ...valueParts] = cookie.split("=");
      const value = valueParts.join("="); // Handle values with = in them

      if (name === "sessionid") {
        sessionId = value;
      } else if (name === "steamLoginSecure") {
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

  /**
   * Save session method and optional refresh token to DB.
   */
  private static async saveSessionMeta(
    userId: number,
    method: string,
    refreshToken: string | null
  ): Promise<void> {
    await pool.query(
      `UPDATE users
       SET session_method = $1,
           steam_refresh_token = $2
       WHERE id = $3`,
      [
        method,
        refreshToken ? encrypt(refreshToken) : null,
        userId,
      ]
    );
  }
}
