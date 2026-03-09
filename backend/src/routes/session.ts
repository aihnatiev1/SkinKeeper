import { Router, Response } from "express";
import { SteamSessionService } from "../services/steamSession.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";

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
    const { steamLoginSecure } = req.body;

    if (!steamLoginSecure) {
      res
        .status(400)
        .json({ error: "steamLoginSecure is required" });
      return;
    }

    const linkMode = isLinkMode(req);

    if (linkMode) {
      // Extract sessionId first
      const sessionId = await SteamSessionService.extractSessionId(steamLoginSecure);
      if (!sessionId) {
        res.status(400).json({ error: "Could not extract session from token" });
        return;
      }
      const cookies = { sessionId, steamLoginSecure };
      try {
        const { accountId, steamId } = await SteamSessionService.linkNewAccount(
          req.userId!,
          cookies,
          "clienttoken",
          null
        );
        res.json({ status: "authenticated", accountId, steamId });
      } catch (err: any) {
        res.status(400).json({ error: err.message });
      }
      return;
    }

    // Normal mode
    const accountId = await resolveAccountId(req);
    const result = await SteamSessionService.handleClientToken(accountId, {
      steamLoginSecure,
    });

    if (result) {
      res.json({ status: "authenticated" });
    } else {
      res
        .status(400)
        .json({ error: "Could not extract session from token" });
    }
  } catch (err) {
    console.error("Token submit error:", err);
    res.status(500).json({ error: "Failed to process token" });
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
 */
router.get("/status", async (req: AuthRequest, res: Response) => {
  try {
    const accountId = await resolveAccountId(req);
    const status = await SteamSessionService.getSessionStatus(accountId);
    res.json({ status });
  } catch (err) {
    console.error("Session status error:", err);
    res.status(500).json({ error: "Failed to check session status" });
  }
});

export default router;
