import crypto from "crypto";
import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { verifySteamOpenId, getSteamProfile } from "../services/steam.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { SteamSessionService } from "../services/steamSession.js";

const router = Router();

/** Generate a short alphanumeric referral code and ensure it's set on the user. */
async function ensureReferralCode(userId: number): Promise<string> {
  const { rows } = await pool.query(
    "SELECT referral_code FROM users WHERE id = $1",
    [userId]
  );
  if (rows[0]?.referral_code) return rows[0].referral_code;

  const code = crypto.randomBytes(4).toString("hex").toUpperCase(); // 8 chars
  await pool.query(
    "UPDATE users SET referral_code = $1 WHERE id = $2 AND referral_code IS NULL",
    [code, userId]
  );
  return code;
}

/** Apply referral: link referred user to referrer. Only works on first login. */
async function applyReferral(userId: number, referralCode: string): Promise<void> {
  if (!referralCode) return;
  const { rows } = await pool.query(
    "SELECT id FROM users WHERE referral_code = $1 AND id != $2",
    [referralCode.toUpperCase(), userId]
  );
  if (rows.length === 0) return;
  await pool.query(
    "UPDATE users SET referred_by = $1 WHERE id = $2 AND referred_by IS NULL",
    [rows[0].id, userId]
  );
  console.log(`[Referral] User ${userId} referred by user ${rows[0].id} (code: ${referralCode})`);
}

// POST /api/auth/refresh — renew JWT before it expires
router.post("/refresh", async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      res.status(401).json({ error: "No token" });
      return;
    }
    const oldToken = authHeader.substring(7);

    // Verify with ignoreExpiration — allow recently expired tokens (up to 7 days past expiry)
    let decoded: any;
    try {
      decoded = jwt.verify(oldToken, process.env.JWT_SECRET!, { ignoreExpiration: true });
    } catch {
      res.status(401).json({ code: "TOKEN_EXPIRED", error: "Token invalid" });
      return;
    }

    // Check if token is too old (expired more than 7 days ago)
    const exp = decoded.exp * 1000; // to milliseconds
    const maxGracePeriod = 7 * 24 * 60 * 60 * 1000; // 7 days
    if (Date.now() - exp > maxGracePeriod) {
      res.status(401).json({ code: "TOKEN_EXPIRED", error: "Token too old to refresh" });
      return;
    }

    // Issue new token
    const newToken = jwt.sign(
      { userId: decoded.userId },
      process.env.JWT_SECRET!,
      { expiresIn: "30d" }
    );

    res.json({ token: newToken });
  } catch (err) {
    console.error("Token refresh error:", err);
    res.status(500).json({ error: "Failed to refresh token" });
  }
});

// Universal Link callback — iOS opens the app, web fallback saves to localStorage
router.get("/callback", (req: Request, res: Response) => {
  const token = req.query.token as string | undefined;
  const error = req.query.error as string | undefined;
  // If iOS Universal Link works, the app opens and this page never loads.
  // If it doesn't, show a page that tries skinkeeper:// as fallback.
  res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>SkinKeeper</title></head>
<body style="background:#0a0e1a;color:white;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0">
<div style="text-align:center">
${token ? `<h2>✅ Login successful</h2><p style="color:#999">Opening SkinKeeper...</p>
<script>window.location='skinkeeper://auth?token=${encodeURIComponent(token)}';</script>
<p style="margin-top:20px"><a href="skinkeeper://auth?token=${encodeURIComponent(token)}" style="color:#8b5cf6">Tap here to open SkinKeeper</a></p>`
: `<h2 style="color:#ff5252">Login failed</h2><p>${error || 'Unknown error'}</p>`}
</div></body></html>`);
});

// In-memory store for pending Steam login results (nonce → token)
const pendingLogins = new Map<string, { token?: string; error?: string; createdAt: number }>();

// Cleanup entries older than 10 minutes (check every minute)
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of pendingLogins) {
    if (now - val.createdAt > 10 * 60 * 1000) pendingLogins.delete(key);
  }
}, 60 * 1000);

// GET /api/auth/steam/poll/:nonce — App polls this after opening Steam login
router.get("/steam/poll/:nonce", async (req: Request, res: Response) => {
  const nonce = req.params.nonce as string;
  const entry = pendingLogins.get(nonce);
  if (!entry) {
    res.json({ status: "pending" });
    return;
  }
  if (entry.token) {
    console.log(`[Auth] Nonce poll completed for ${nonce.substring(0, 8)}...`);
    pendingLogins.delete(nonce);
    res.json({ status: "authenticated", token: entry.token });
    return;
  }
  if (entry.error) {
    pendingLogins.delete(nonce);
    res.json({ status: "error", error: entry.error });
    return;
  }
  res.json({ status: "pending" });
});

// GET /api/auth/steam/callback
// Steam redirects here after OpenID login — verify, create JWT, redirect to app deep link
router.get("/steam/callback", async (req: Request, res: Response) => {
  try {
    const params = req.query as Record<string, string>;
    const steamId = await verifySteamOpenId(params);
    const profile = await getSteamProfile(steamId);

    // Check if this is a link-account flow (state param contains userId)
    const state = params.state;
    if (state?.startsWith("link:")) {
      const userId = parseInt(state.split(":")[1]);
      if (userId) {
        // Link additional account
        await pool.query(
          `INSERT INTO steam_accounts (user_id, steam_id, display_name, avatar_url)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (user_id, steam_id) DO UPDATE SET display_name = $3, avatar_url = $4`,
          [userId, steamId, profile.personaname, profile.avatarfull]
        );
        res.redirect(`skinkeeper://account-linked?steamId=${steamId}`);
        return;
      }
    }

    // Normal login flow: upsert user
    const { rows } = await pool.query(
      `INSERT INTO users (steam_id, display_name, avatar_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (steam_id)
       DO UPDATE SET display_name = $2, avatar_url = $3
       RETURNING id, steam_id, display_name, avatar_url, is_premium, premium_until`,
      [steamId, profile.personaname, profile.avatarfull]
    );
    const user = rows[0];

    // Also create a steam_accounts entry for the primary account
    await pool.query(
      `INSERT INTO steam_accounts (user_id, steam_id, display_name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, steam_id) DO UPDATE SET display_name = $3, avatar_url = $4`,
      [user.id, steamId, profile.personaname, profile.avatarfull]
    );

    // Set active_account_id if not set
    await pool.query(
      `UPDATE users SET active_account_id = sa.id
       FROM steam_accounts sa
       WHERE users.id = $1 AND sa.user_id = $1 AND sa.steam_id = $2
         AND users.active_account_id IS NULL`,
      [user.id, steamId]
    );

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET!,
      { expiresIn: "30d" }
    );

    // Polling-based login: nonce comes as direct query param
    const nonce = params.nonce;
    if (nonce) {
      console.log(`[Auth] Storing token for nonce: ${nonce.substring(0, 8)}...`);
      pendingLogins.set(nonce, { token, createdAt: Date.now() });
      res.send(`<html><body style="background:#0a0e1a;color:white;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2 style="font-size:28px">✅</h2><h2>Login successful!</h2><p style="color:#999;margin-top:12px">Go back to SkinKeeper</p></div></body></html>`);
      return;
    }

    // Universal Link redirect — iOS intercepts this HTTPS URL and opens the app
    const baseUrl = process.env.BASE_URL || "https://api.skinkeeper.store";
    res.redirect(`${baseUrl}/auth/callback?token=${encodeURIComponent(token)}`);
  } catch (err) {
    console.error("Steam callback error:", err);
    const nonce = (req.query as any).nonce;
    if (nonce) {
      pendingLogins.set(nonce, { error: "auth_failed", createdAt: Date.now() });
      res.send(`<html><body style="background:#0a0e1a;color:#ff5252;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><div style="text-align:center"><h2>Login failed</h2><p>Return to SkinKeeper and try again</p></div></body></html>`);
      return;
    }
    const baseUrl = process.env.BASE_URL || "https://api.skinkeeper.store";
    res.redirect(`${baseUrl}/auth/callback?error=auth_failed`);
  }
});

// POST /api/auth/steam/verify
router.post("/steam/verify", async (req: Request, res: Response) => {
  try {
    const params = req.body as Record<string, string>;
    const steamId = await verifySteamOpenId(params);
    const profile = await getSteamProfile(steamId);

    const { rows } = await pool.query(
      `INSERT INTO users (steam_id, display_name, avatar_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (steam_id)
       DO UPDATE SET display_name = $2, avatar_url = $3
       RETURNING id, steam_id, display_name, avatar_url, is_premium, premium_until`,
      [steamId, profile.personaname, profile.avatarfull]
    );
    const user = rows[0];

    await pool.query(
      `INSERT INTO steam_accounts (user_id, steam_id, display_name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, steam_id) DO UPDATE SET display_name = $3, avatar_url = $4`,
      [user.id, steamId, profile.personaname, profile.avatarfull]
    );

    // Set active_account_id if not set
    await pool.query(
      `UPDATE users SET active_account_id = sa.id
       FROM steam_accounts sa
       WHERE users.id = $1 AND sa.user_id = $1 AND sa.steam_id = $2
         AND users.active_account_id IS NULL`,
      [user.id, steamId]
    );

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET!,
      { expiresIn: "30d" }
    );

    res.json({
      token,
      user: {
        steam_id: steamId,
        display_name: profile.personaname,
        avatar_url: profile.avatarfull,
        is_premium: user.is_premium,
        premium_until: user.premium_until,
      },
    });
  } catch (err) {
    console.error("Auth error:", err);
    res.status(401).json({ error: "Authentication failed" });
  }
});

// GET /api/auth/me
router.get("/me", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { rows } = await pool.query(
      `SELECT
         COALESCE(sa.steam_id, u.steam_id) AS steam_id,
         COALESCE(sa.display_name, u.display_name) AS display_name,
         COALESCE(sa.avatar_url, u.avatar_url) AS avatar_url,
         u.is_premium, u.premium_until,
         u.active_account_id,
         (SELECT COUNT(*)::int FROM steam_accounts WHERE user_id = u.id) AS account_count
       FROM users u
       LEFT JOIN steam_accounts sa ON sa.id = u.active_account_id
       WHERE u.id = $1`,
      [req.userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    console.error("Get user error:", err);
    res.status(500).json({ error: "Internal error" });
  }
});

// ─── Referral System ─────────────────────────────────────────────────────

// GET /api/auth/referral — get current user's referral code + stats
router.get("/referral", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const code = await ensureReferralCode(req.userId!);
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS referral_count FROM users WHERE referred_by = $1",
      [req.userId]
    );
    res.json({
      code,
      referralCount: rows[0]?.referral_count ?? 0,
      shareUrl: `https://skinkeeper.store/ref/${code}`,
    });
  } catch (err) {
    console.error("Referral error:", err);
    res.status(500).json({ error: "Failed to get referral info" });
  }
});

// POST /api/auth/referral/apply — apply a referral code (called once after first login)
router.post("/referral/apply", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { code } = req.body;
    if (!code || typeof code !== "string") {
      res.status(400).json({ error: "Referral code required" });
      return;
    }
    await applyReferral(req.userId!, code);
    res.json({ success: true });
  } catch (err) {
    console.error("Apply referral error:", err);
    res.status(500).json({ error: "Failed to apply referral" });
  }
});

// ─── Account Management ─────────────────────────────────────────────────

// GET /api/auth/accounts — List linked Steam accounts
router.get("/accounts", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { rows: accounts } = await pool.query(
      `SELECT sa.id, sa.steam_id, sa.display_name, sa.avatar_url, sa.added_at,
              sa.steam_login_secure IS NOT NULL as has_session,
              sa.session_updated_at
       FROM steam_accounts sa
       WHERE sa.user_id = $1
       ORDER BY sa.added_at`,
      [req.userId]
    );

    const { rows: userRow } = await pool.query(
      `SELECT active_account_id, is_premium FROM users WHERE id = $1`,
      [req.userId]
    );
    const activeAccountId = userRow[0]?.active_account_id;
    const isPremium = userRow[0]?.is_premium ?? false;

    // Compute session status for each account (lightweight — no Steam API call)
    const enriched = accounts.map((a) => {
      let sessionStatus: string = "none";
      if (a.has_session) {
        if (a.session_updated_at) {
          const hours = (Date.now() - new Date(a.session_updated_at).getTime()) / (1000 * 60 * 60);
          sessionStatus = hours > 24 ? "expired" : hours > 20 ? "expiring" : "valid";
        } else {
          sessionStatus = "valid";
        }
      }
      return {
        id: a.id,
        steamId: a.steam_id,
        displayName: a.display_name,
        avatarUrl: a.avatar_url,
        isActive: a.id === activeAccountId,
        sessionStatus,
        addedAt: a.added_at,
      };
    });

    res.json({
      accounts: enriched,
      maxAccounts: isPremium ? null : 2,
      isPremium,
    });
  } catch (err) {
    console.error("List accounts error:", err);
    res.status(500).json({ error: "Failed to list accounts" });
  }
});

// POST /api/auth/accounts/link — Start linking a new Steam account
router.post("/accounts/link", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const { rows: userRow } = await pool.query(
      `SELECT is_premium FROM users WHERE id = $1`,
      [req.userId]
    );
    const isPremium = userRow[0]?.is_premium ?? false;

    if (!isPremium) {
      const { rows: countRow } = await pool.query(
        `SELECT COUNT(*)::int as cnt FROM steam_accounts WHERE user_id = $1`,
        [req.userId]
      );
      if (countRow[0].cnt >= 2) {
        res.status(403).json({
          error: "premium_required",
          message: "Upgrade to Premium to link more than 2 Steam accounts",
        });
        return;
      }
    }

    // Build OpenID URL with state param to identify this as a link flow
    const returnUrl = `${process.env.BASE_URL || "http://localhost:3000"}/api/auth/steam/callback`;
    const params = new URLSearchParams({
      "openid.ns": "http://specs.openid.net/auth/2.0",
      "openid.mode": "checkid_setup",
      "openid.return_to": returnUrl,
      "openid.realm": returnUrl,
      "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
      "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
      state: `link:${req.userId}`,
    });

    const openIdUrl = `https://steamcommunity.com/openid/login?${params.toString()}`;
    res.json({ url: openIdUrl });
  } catch (err) {
    console.error("Link account error:", err);
    res.status(500).json({ error: "Failed to start account linking" });
  }
});

// PUT /api/auth/accounts/:accountId/active — Set active account
router.put("/accounts/:accountId/active", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const accountId = parseInt(req.params.accountId as string);

    // Verify the account belongs to this user
    const { rows } = await pool.query(
      `SELECT id FROM steam_accounts WHERE id = $1 AND user_id = $2`,
      [accountId, req.userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    await pool.query(
      `UPDATE users SET active_account_id = $1 WHERE id = $2`,
      [accountId, req.userId]
    );

    res.json({ success: true, activeAccountId: accountId });
  } catch (err) {
    console.error("Set active account error:", err);
    res.status(500).json({ error: "Failed to set active account" });
  }
});

// DELETE /api/auth/accounts/:accountId — Unlink an account
router.delete("/accounts/:accountId", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const accountId = parseInt(req.params.accountId as string);

    // Verify the account belongs to this user
    const { rows: accounts } = await pool.query(
      `SELECT id FROM steam_accounts WHERE user_id = $1 ORDER BY added_at`,
      [req.userId]
    );

    const target = accounts.find((a) => a.id === accountId);
    if (!target) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const isLastAccount = accounts.length <= 1;

    // Must clear/update active_account_id BEFORE deleting due to FK constraint
    if (isLastAccount) {
      await pool.query(
        `UPDATE users SET active_account_id = NULL WHERE id = $1`,
        [req.userId]
      );
    } else {
      // If this account is active, switch to another before deleting
      const { rows: userRow } = await pool.query(
        `SELECT active_account_id FROM users WHERE id = $1`,
        [req.userId]
      );
      if (userRow[0]?.active_account_id === accountId) {
        const { rows: remaining } = await pool.query(
          `SELECT id FROM steam_accounts WHERE user_id = $1 AND id != $2 ORDER BY added_at LIMIT 1`,
          [req.userId, accountId]
        );
        if (remaining.length > 0) {
          await pool.query(
            `UPDATE users SET active_account_id = $1 WHERE id = $2`,
            [remaining[0].id, req.userId]
          );
        }
      }
    }

    // Now safe to delete (CASCADE handles inventory_items)
    await pool.query(
      `DELETE FROM steam_accounts WHERE id = $1 AND user_id = $2`,
      [accountId, req.userId]
    );

    if (isLastAccount) {
      // Clean up user-level data when all accounts removed
      await pool.query(`DELETE FROM portfolios WHERE user_id = $1`, [req.userId]);
      await pool.query(`DELETE FROM transactions WHERE user_id = $1`, [req.userId]);
      await pool.query(`DELETE FROM cost_basis WHERE user_id = $1`, [req.userId]);
      await pool.query(`UPDATE users SET active_account_id = NULL WHERE id = $1`, [req.userId]);
      res.json({ success: true, lastAccountRemoved: true });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Unlink account error:", err);
    res.status(500).json({ error: "Failed to unlink account" });
  }
});

// DELETE /api/auth/user — GDPR: permanently delete user and all associated data
router.delete("/user", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    // Clear FK reference before cascade delete
    await pool.query(
      `UPDATE users SET active_account_id = NULL WHERE id = $1`,
      [req.userId]
    );

    // Delete user — CASCADE handles: steam_accounts, inventory_items, transactions,
    // price_alerts, sell_operations, trade_offers, daily_pl_snapshots, user_devices,
    // purchase_receipts, portfolios, item_cost_basis, sell_volume
    const { rows } = await pool.query(
      `DELETE FROM users WHERE id = $1 RETURNING id, steam_id, display_name, created_at`,
      [req.userId]
    );

    if (rows.length === 0) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    console.log(
      `[GDPR] User ${rows[0].id} (steam: ${rows[0].steam_id}, name: ${rows[0].display_name}) deleted. Account created: ${rows[0].created_at}`
    );

    res.json({
      success: true,
      deletedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error("GDPR user deletion error:", err);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

// GET /api/auth/accounts/:accountId/session/status — Session status for specific account
router.get("/accounts/:accountId/session/status", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const accountId = parseInt(req.params.accountId as string);

    // Verify ownership
    const { rows } = await pool.query(
      `SELECT id FROM steam_accounts WHERE id = $1 AND user_id = $2`,
      [accountId, req.userId]
    );
    if (rows.length === 0) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const status = await SteamSessionService.getSessionStatus(accountId);
    res.json({ status });
  } catch (err) {
    console.error("Account session status error:", err);
    res.status(500).json({ error: "Failed to check session status" });
  }
});

// ─── QR Link (Authenticated) ────────────────────────────────────────────
// Start QR session for linking a new account to an existing user.
router.post("/qr/start-link", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const result = await SteamSessionService.startQRSession(0);
    const pending = (SteamSessionService as any).pendingSessions.get(result.nonce);
    if (pending) {
      pending.linkUserId = req.userId;
    }
    res.json(result);
  } catch (err) {
    console.error("QR start-link error:", err);
    res.status(500).json({ error: "Failed to start QR link session" });
  }
});

// ─── QR Login (Unauthenticated) ─────────────────────────────────────────
// Allow initial app login via QR code — no JWT required.
// On success: upserts user + steam_account, saves session cookies, returns JWT.

router.post("/qr/start", async (req: Request, res: Response) => {
  try {
    const result = await SteamSessionService.startQRSession(0);
    const pending = (SteamSessionService as any).pendingSessions.get(result.nonce);
    if (pending) {
      pending.initialLogin = true;
    }
    res.json(result);
  } catch (err) {
    console.error("QR start (login) error:", err);
    res.status(500).json({ error: "Failed to start QR session" });
  }
});

router.get("/qr/poll/:nonce", async (req: Request, res: Response) => {
  try {
    const nonce = req.params.nonce as string;
    const pending = (SteamSessionService as any).pendingSessions.get(nonce);

    if (!pending) {
      res.json({ status: "expired" });
      return;
    }

    if (pending.status === "expired") {
      (SteamSessionService as any).pendingSessions.delete(nonce);
      res.json({ status: "expired" });
      return;
    }

    if (pending.status !== "authenticated" || !pending.cookies) {
      res.json({ status: "pending" });
      return;
    }

    // Link mode: add to existing user's accounts
    if (pending.linkUserId) {
      const steamId = SteamSessionService.extractSteamIdFromCookie(
        pending.cookies.steamLoginSecure
      );
      if (!steamId) {
        res.status(400).json({ error: "Could not extract Steam ID" });
        return;
      }
      const profile = await getSteamProfile(steamId);
      const { rows: saRows } = await pool.query(
        `INSERT INTO steam_accounts (user_id, steam_id, display_name, avatar_url)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, steam_id) DO UPDATE SET display_name = $3, avatar_url = $4
         RETURNING id`,
        [pending.linkUserId, steamId, profile.personaname, profile.avatarfull]
      );
      await SteamSessionService.saveSession(saRows[0].id, pending.cookies);
      (SteamSessionService as any).pendingSessions.delete(nonce);
      res.json({ status: "account-linked", steamId });
      return;
    }

    // Authenticated — extract steamId, upsert user, save session, return JWT
    const steamId = SteamSessionService.extractSteamIdFromCookie(
      pending.cookies.steamLoginSecure
    );
    if (!steamId) {
      res.status(400).json({ error: "Could not extract Steam ID from session" });
      return;
    }

    const profile = await getSteamProfile(steamId);

    const { rows } = await pool.query(
      `INSERT INTO users (steam_id, display_name, avatar_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (steam_id)
       DO UPDATE SET display_name = $2, avatar_url = $3
       RETURNING id, steam_id, display_name, avatar_url, is_premium, premium_until`,
      [steamId, profile.personaname, profile.avatarfull]
    );
    const user = rows[0];

    const { rows: saRows } = await pool.query(
      `INSERT INTO steam_accounts (user_id, steam_id, display_name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, steam_id) DO UPDATE SET display_name = $3, avatar_url = $4
       RETURNING id`,
      [user.id, steamId, profile.personaname, profile.avatarfull]
    );
    const accountId = saRows[0].id;

    await pool.query(
      `UPDATE users SET active_account_id = sa.id
       FROM steam_accounts sa
       WHERE users.id = $1 AND sa.user_id = $1 AND sa.steam_id = $2
         AND users.active_account_id IS NULL`,
      [user.id, steamId]
    );

    await SteamSessionService.saveSession(accountId, pending.cookies);
    const refreshToken = pending.loginSession.refreshToken;
    await pool.query(
      `UPDATE steam_accounts SET session_method = 'qr', steam_refresh_token = $1 WHERE id = $2`,
      [refreshToken || null, accountId]
    );

    (SteamSessionService as any).pendingSessions.delete(nonce);

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET!,
      { expiresIn: "30d" }
    );

    res.json({
      status: "authenticated",
      token,
      user: {
        steam_id: steamId,
        display_name: profile.personaname,
        avatar_url: profile.avatarfull,
        is_premium: user.is_premium,
        premium_until: user.premium_until,
      },
    });
  } catch (err) {
    console.error("QR poll (login) error:", err);
    res.status(500).json({ error: "Failed to poll QR session" });
  }
});

// ─── Client Token Login (Unauthenticated) ────────────────────────────
// Allow initial app login via clientjstoken — no JWT required.
// On success: upserts user + steam_account, saves session cookies, returns JWT.

router.post("/token", async (req: Request, res: Response) => {
  try {
    const { steamLoginSecure, sessionId: providedSessionId, steamRefreshToken } = req.body;

    if (!steamLoginSecure) {
      res.status(400).json({ error: "steamLoginSecure is required" });
      return;
    }

    const method = steamRefreshToken ? "webview" : "clienttoken";
    console.log(`[Auth/Token] Received: method=${method}, sls_len=${steamLoginSecure.length}, sid=${!!providedSessionId}, refresh=${!!steamRefreshToken}`);

    // Extract steamId from the token
    const steamId = SteamSessionService.extractSteamIdFromCookie(steamLoginSecure);
    if (!steamId) {
      res.status(400).json({ error: "Could not extract Steam ID from token" });
      return;
    }

    // Use provided sessionId or extract from Steam
    const sessionId = providedSessionId || await SteamSessionService.extractSessionId(steamLoginSecure);
    if (!sessionId) {
      res.status(400).json({ error: "Invalid or expired token. Make sure you are logged in to Steam." });
      return;
    }

    const profile = await getSteamProfile(steamId);

    // Upsert user
    const { rows } = await pool.query(
      `INSERT INTO users (steam_id, display_name, avatar_url)
       VALUES ($1, $2, $3)
       ON CONFLICT (steam_id)
       DO UPDATE SET display_name = $2, avatar_url = $3
       RETURNING id, steam_id, display_name, avatar_url, is_premium, premium_until`,
      [steamId, profile.personaname, profile.avatarfull]
    );
    const user = rows[0];

    // Upsert steam_account
    const { rows: saRows } = await pool.query(
      `INSERT INTO steam_accounts (user_id, steam_id, display_name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, steam_id) DO UPDATE SET display_name = $3, avatar_url = $4
       RETURNING id`,
      [user.id, steamId, profile.personaname, profile.avatarfull]
    );
    const accountId = saRows[0].id;

    // Set active account if not set
    await pool.query(
      `UPDATE users SET active_account_id = sa.id
       FROM steam_accounts sa
       WHERE users.id = $1 AND sa.user_id = $1 AND sa.steam_id = $2
         AND users.active_account_id IS NULL`,
      [user.id, steamId]
    );

    // Save session
    await SteamSessionService.saveSession(accountId, {
      sessionId,
      steamLoginSecure,
    });

    // Save method + refresh token
    const { encrypt } = await import("../services/crypto.js");
    await pool.query(
      `UPDATE steam_accounts SET session_method = $1, steam_refresh_token = $2 WHERE id = $3`,
      [method, steamRefreshToken ? encrypt(steamRefreshToken) : null, accountId]
    );

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET!,
      { expiresIn: "30d" }
    );

    res.json({
      status: "authenticated",
      token,
      user: {
        steam_id: steamId,
        display_name: profile.personaname,
        avatar_url: profile.avatarfull,
        is_premium: user.is_premium,
        premium_until: user.premium_until,
      },
    });
  } catch (err: any) {
    console.error("Token login error:", err);
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

export default router;
