import { pool } from "../db/pool.js";
import { encrypt, decrypt } from "./crypto.js";
import axios from "axios";

export interface SteamSession {
  sessionId: string;
  steamLoginSecure: string;
  accessToken?: string;
}

export class SteamSessionService {
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
}
