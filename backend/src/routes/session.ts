import { Router, Response } from "express";
import { SteamSessionService } from "../services/steamSession.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { pool } from "../db/pool.js";

const router = Router();

// All session routes require authentication
router.use(authMiddleware);

/**
 * Resolve accountId from query param or fall back to active account.
 */
async function resolveAccountId(req: AuthRequest): Promise<number> {
  const paramId = parseInt(req.query.accountId as string);
  if (paramId && !isNaN(paramId)) return paramId;
  return SteamSessionService.getActiveAccountId(req.userId!);
}

function isLinkMode(req: AuthRequest): boolean {
  return req.query.linkMode === "true";
}

// ─── QR Code Flow ──────────────────────────────────────────────────────

/**
 * POST /api/session/qr/start?accountId=X&linkMode=true
 * Start a new QR login session. In linkMode, creates a new account on success.
 */
router.post("/qr/start", async (req: AuthRequest, res: Response) => {
  try {
    const linkMode = isLinkMode(req);
    // In link mode, use 0 as placeholder accountId (account created on poll success)
    const accountId = linkMode ? 0 : await resolveAccountId(req);
    const result = await SteamSessionService.startQRSession(accountId);

    // Tag pending session with link mode info
    if (linkMode) {
      const pending = (SteamSessionService as any).pendingSessions.get(result.nonce);
      if (pending) {
        pending.linkMode = true;
        pending.userId = req.userId;
      }
    }

    res.json(result);
  } catch (err) {
    console.error("QR start error:", err);
    res.status(500).json({ error: "Failed to start QR session" });
  }
});

/**
 * GET /api/session/qr/poll/:nonce?accountId=X&linkMode=true
 * Poll a QR login session for status.
 */
router.get("/qr/poll/:nonce", async (req: AuthRequest, res: Response) => {
  try {
    const nonce = req.params.nonce as string;
    const pending = (SteamSessionService as any).pendingSessions.get(nonce);

    if (!pending) {
      res.json({ status: "expired" });
      return;
    }

    // Link mode: handle account creation on auth success
    if (pending.linkMode && pending.status === "authenticated" && pending.cookies) {
      try {
        const { accountId, steamId } = await SteamSessionService.linkNewAccount(
          pending.userId!,
          pending.cookies,
          "qr",
          pending.loginSession.refreshToken || null
        );
        (SteamSessionService as any).pendingSessions.delete(nonce);
        res.json({ status: "authenticated", accountId, steamId });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
      return;
    }

    if (pending.linkMode) {
      // Still pending or expired — return status without accountId check
      if (pending.status === "expired") {
        (SteamSessionService as any).pendingSessions.delete(nonce);
        res.json({ status: "expired" });
        return;
      }
      res.json({ status: "pending" });
      return;
    }

    // Normal mode
    const accountId = await resolveAccountId(req);
    const result = await SteamSessionService.pollQRSession(nonce, accountId);
    res.json(result);
  } catch (err) {
    console.error("QR poll error:", err);
    res.status(500).json({ error: "Failed to poll QR session" });
  }
});

// ─── Credential + Guard Flow ───────────────────────────────────────────

/**
 * POST /api/session/login?accountId=X&linkMode=true
 * Start a credential login. Body: { username, password }
 */
router.post("/login", async (req: AuthRequest, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    const linkMode = isLinkMode(req);
    const accountId = linkMode ? 0 : await resolveAccountId(req);
    const result = await SteamSessionService.startCredentialLogin(
      accountId,
      username,
      password
    );

    // Tag pending session with link mode info
    if (linkMode) {
      const pending = (SteamSessionService as any).pendingSessions.get(result.nonce);
      if (pending) {
        pending.linkMode = true;
        pending.userId = req.userId;
      }
    }

    res.json(result);
  } catch (err) {
    console.error("Login error:", err);
    res.status(401).json({ error: "Login failed" });
  }
});

/**
 * POST /api/session/guard
 * Submit a Steam Guard code. Body: { nonce, code }
 */
router.post("/guard", async (req: AuthRequest, res: Response) => {
  try {
    const { nonce, code } = req.body;

    if (!nonce || !code) {
      res.status(400).json({ error: "Nonce and code are required" });
      return;
    }

    const pending = (SteamSessionService as any).pendingSessions.get(nonce);

    // Link mode guard: submit code, then link account on success
    if (pending?.linkMode) {
      const result = await SteamSessionService.submitGuardCode(nonce, code);
      if (result) {
        try {
          const { accountId, steamId } = await SteamSessionService.linkNewAccount(
            pending.userId!,
            result,
            "credentials",
            pending.loginSession.refreshToken || null
          );
          res.json({ status: "authenticated", accountId, steamId });
        } catch (err: any) {
          res.status(400).json({ error: err.message });
        }
      } else {
        res.json({
          status: "pending",
          message: "Code may be incorrect, try again",
        });
      }
      return;
    }

    // Normal mode
    const result = await SteamSessionService.submitGuardCode(nonce, code);

    if (result) {
      res.json({ status: "authenticated" });
    } else {
      res.json({
        status: "pending",
        message: "Code may be incorrect, try again",
      });
    }
  } catch (err) {
    console.error("Guard submit error:", err);
    res.status(500).json({ error: "Failed to submit guard code" });
  }
});

// ─── Client JS Token Flow ──────────────────────────────────────────────

/**
 * POST /api/session/token?accountId=X&linkMode=true
 * Submit a clientjstoken. Body: { steamLoginSecure }
 */
router.post("/token", async (req: AuthRequest, res: Response) => {
  try {
    const { steamLoginSecure, sessionId: providedSessionId, steamRefreshToken } = req.body;

    if (!steamLoginSecure) {
      res
        .status(400)
        .json({ error: "steamLoginSecure is required" });
      return;
    }

    const method = steamRefreshToken ? "webview" : "clienttoken";
    console.log(`[Token] Received: method=${method}, sls_len=${steamLoginSecure.length}, sid=${!!providedSessionId}, refresh=${!!steamRefreshToken}, linkMode=${isLinkMode(req)}`);

    const linkMode = isLinkMode(req);

    if (linkMode) {
      // Use provided sessionId or extract from Steam
      const sessionId = providedSessionId || await SteamSessionService.extractSessionId(steamLoginSecure);
      if (!sessionId) {
        res.status(400).json({ error: "Could not extract session from token" });
        return;
      }
      const cookies = { sessionId, steamLoginSecure };
      try {
        const { accountId, steamId } = await SteamSessionService.linkNewAccount(
          req.userId!,
          cookies,
          method,
          steamRefreshToken || null
        );
        res.json({ status: "authenticated", accountId, steamId });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
      return;
    }

    // Normal mode — use provided sessionId or extract
    const accountId = await resolveAccountId(req);
    const sessionId = providedSessionId || await SteamSessionService.extractSessionId(steamLoginSecure);
    if (!sessionId) {
      res.status(400).json({ error: "Could not extract session from token" });
      return;
    }

    const session = { sessionId, steamLoginSecure };
    await SteamSessionService.saveSession(accountId, session);
    await pool.query(
      `UPDATE steam_accounts SET session_method = $1, steam_refresh_token = $2 WHERE id = $3`,
      [method, steamRefreshToken ? (await import("../services/crypto.js")).encrypt(steamRefreshToken) : null, accountId]
    );
    console.log(`[Token] Session saved for account ${accountId}: method=${method}, sls_len=${steamLoginSecure.length}`);

    res.json({ status: "authenticated" });
  } catch (err: any) {
    console.error("Token submit error:", err);
    if (err.code === "STEAM_ID_MISMATCH") {
      res.status(409).json({
        error: err.message,
        code: "STEAM_ID_MISMATCH",
        expectedSteamId: err.expectedSteamId,
        actualSteamId: err.actualSteamId,
      });
    } else {
      res.status(500).json({ error: "Failed to process token" });
    }
  }
});

// ─── Session Refresh ──────────────────────────────────────────────────

/**
 * POST /api/session/refresh?accountId=X
 */
router.post("/refresh", async (req: AuthRequest, res: Response) => {
  try {
    const accountId = await resolveAccountId(req);
    const result = await SteamSessionService.refreshSession(accountId);
    const status = await SteamSessionService.getSessionStatus(accountId);
    res.json({ ...result, status });
  } catch (err) {
    console.error("Session refresh error:", err);
    res.status(500).json({ error: "Failed to refresh session" });
  }
});

// ─── Session Status ────────────────────────────────────────────────────

/**
 * GET /api/session/status?accountId=X
 * Returns active account status + per-account breakdown.
 */
router.get("/status", async (req: AuthRequest, res: Response) => {
  try {
    const accountId = await resolveAccountId(req);
    const details = await SteamSessionService.getSessionDetails(accountId);

    // Fetch all accounts with their session details
    const { rows: accounts } = await pool.query(
      `SELECT id, steam_id, display_name, session_updated_at,
              steam_login_secure IS NOT NULL AS has_session
       FROM steam_accounts WHERE user_id = $1 ORDER BY id`,
      [req.userId!]
    );

    const accountStatuses: Array<{
      id: number;
      displayName: string;
      status: string;
      isActive: boolean;
      refreshTokenExpiresAt: string | null;
      refreshTokenExpired: boolean;
    }> = [];

    for (const acc of accounts) {
      const accDetails = await SteamSessionService.getSessionDetails(acc.id);
      accountStatuses.push({
        id: acc.id,
        displayName: acc.display_name || acc.steam_id,
        status: accDetails.status,
        isActive: acc.id === accountId,
        refreshTokenExpiresAt: accDetails.refreshTokenExpiresAt,
        refreshTokenExpired: accDetails.refreshTokenExpired,
      });
    }

    // If access token is expired but refresh token is still alive, try auto-refresh
    if ((details.status === "expired" || details.status === "expiring") && !details.refreshTokenExpired) {
      const refreshResult = await SteamSessionService.refreshSession(accountId);
      if (refreshResult.refreshed) {
        const newDetails = await SteamSessionService.getSessionDetails(accountId);
        details.status = newDetails.status;
        // Update active account in the list too
        const activeAcc = accountStatuses.find(a => a.isActive);
        if (activeAcc) activeAcc.status = newDetails.status;
      }
    }

    res.json({
      status: details.status,
      refreshTokenExpiresAt: details.refreshTokenExpiresAt,
      refreshTokenExpired: details.refreshTokenExpired,
      needsReauth: details.refreshTokenExpired && details.status !== "valid",
      accounts: accountStatuses,
    });
  } catch (err) {
    console.error("Session status error:", err);
    res.status(500).json({ error: "Failed to check session status" });
  }
});

export default router;
