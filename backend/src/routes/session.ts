import { Router, Response } from "express";
import { SteamSessionService } from "../services/steamSession.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";

const router = Router();

// All session routes require authentication
router.use(authMiddleware);

// ─── QR Code Flow ──────────────────────────────────────────────────────

/**
 * POST /api/session/qr/start
 * Start a new QR login session.
 * Returns: { qrImage: string (data URL), nonce: string }
 */
router.post("/qr/start", async (req: AuthRequest, res: Response) => {
  try {
    const result = await SteamSessionService.startQRSession(req.userId!);
    res.json(result);
  } catch (err) {
    console.error("QR start error:", err);
    res.status(500).json({ error: "Failed to start QR session" });
  }
});

/**
 * GET /api/session/qr/poll/:nonce
 * Poll a QR login session for status.
 * Returns: { status: 'pending' | 'authenticated' | 'expired' }
 */
router.get("/qr/poll/:nonce", async (req: AuthRequest, res: Response) => {
  try {
    const nonce = req.params.nonce as string;
    const result = await SteamSessionService.pollQRSession(
      nonce,
      req.userId!
    );
    res.json(result);
  } catch (err) {
    console.error("QR poll error:", err);
    res.status(500).json({ error: "Failed to poll QR session" });
  }
});

// ─── Credential + Guard Flow ───────────────────────────────────────────

/**
 * POST /api/session/login
 * Start a credential login. Body: { username, password }
 * Returns: { nonce: string, guardRequired: boolean }
 */
router.post("/login", async (req: AuthRequest, res: Response) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }

    const result = await SteamSessionService.startCredentialLogin(
      req.userId!,
      username,
      password
    );
    res.json(result);
  } catch (err) {
    console.error("Login error:", err);
    // Don't leak Steam error details
    res.status(401).json({ error: "Login failed" });
  }
});

/**
 * POST /api/session/guard
 * Submit a Steam Guard code. Body: { nonce, code }
 * Returns: { status: 'authenticated' } or { status: 'pending', message: '...' }
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
 * POST /api/session/token
 * Submit a clientjstoken. Body: { steamLoginSecure }
 * Returns: { status: 'authenticated' } or 400
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

    const result = await SteamSessionService.handleClientToken(req.userId!, {
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

// ─── Session Status ────────────────────────────────────────────────────

/**
 * GET /api/session/status
 * Check the current Steam session status.
 * Returns: { status: 'valid' | 'expiring' | 'expired' | 'none' }
 */
router.get("/status", async (req: AuthRequest, res: Response) => {
  try {
    const status = await SteamSessionService.getSessionStatus(req.userId!);
    res.json({ status });
  } catch (err) {
    console.error("Session status error:", err);
    res.status(500).json({ error: "Failed to check session status" });
  }
});

export default router;
