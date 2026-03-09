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

// ─── QR Code Flow ──────────────────────────────────────────────────────

/**
 * POST /api/session/qr/start?accountId=X
 * Start a new QR login session for a specific account.
 */
router.post("/qr/start", async (req: AuthRequest, res: Response) => {
  try {
    const accountId = await resolveAccountId(req);
    const result = await SteamSessionService.startQRSession(accountId);
    res.json(result);
  } catch (err) {
    console.error("QR start error:", err);
    res.status(500).json({ error: "Failed to start QR session" });
  }
});

/**
 * GET /api/session/qr/poll/:nonce?accountId=X
 * Poll a QR login session for status.
 */
router.get("/qr/poll/:nonce", async (req: AuthRequest, res: Response) => {
  try {
    const accountId = await resolveAccountId(req);
    const nonce = req.params.nonce as string;
    const result = await SteamSessionService.pollQRSession(nonce, accountId);
    res.json(result);
  } catch (err) {
    console.error("QR poll error:", err);
    res.status(500).json({ error: "Failed to poll QR session" });
  }
});

// ─── Credential + Guard Flow ───────────────────────────────────────────

/**
 * POST /api/session/login?accountId=X
 * Start a credential login. Body: { username, password }
 */
router.post("/login", async (req: AuthRequest, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    const accountId = await resolveAccountId(req);
    const result = await SteamSessionService.startCredentialLogin(
      accountId,
      username,
      password
    );
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
 * POST /api/session/token?accountId=X
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
