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
        // If this steam_id is already linked to another user, move it
        await pool.query(
          `DELETE FROM steam_accounts WHERE steam_id = $1 AND user_id != $2`,
          [steamId, userId]
        );
        await pool.query(
          `INSERT INTO steam_accounts (user_id, steam_id, display_name, avatar_url, status)
           VALUES ($1, $2, $3, $4, 'active')
           ON CONFLICT (user_id, steam_id) DO UPDATE SET display_name = $3, avatar_url = $4, status = 'active'`,
          [userId, steamId, profile.personaname, profile.avatarfull]
        );
        res.redirect(`skinkeeper://account-linked?steamId=${steamId}`);
        return;
      }
    }

    // Find user — steam_accounts is the source of truth, all accounts are equal
    const { rows: existingAcct } = await pool.query(
      `SELECT sa.user_id FROM steam_accounts sa WHERE sa.steam_id = $1 LIMIT 1`,
      [steamId]
    );

    let user: any;
    if (existingAcct.length > 0) {
      // This Steam ID is linked to an existing user — log into that user
      const { rows } = await pool.query(
        `SELECT id, steam_id, display_name, avatar_url, is_premium, premium_until
         FROM users WHERE id = $1`,
        [existingAcct[0].user_id]
      );
      user = rows[0];
    } else {
      // Not linked anywhere — check users.steam_id fallback, or create new user
      const { rows } = await pool.query(
        `INSERT INTO users (steam_id, display_name, avatar_url)
         VALUES ($1, $2, $3)
         ON CONFLICT (steam_id)
         DO UPDATE SET display_name = $2, avatar_url = $3
         RETURNING id, steam_id, display_name, avatar_url, is_premium, premium_until`,
        [steamId, profile.personaname, profile.avatarfull]
      );
      user = rows[0];
    }

    // Ensure steam_accounts entry exists for the login account
    await pool.query(
      `INSERT INTO steam_accounts (user_id, steam_id, display_name, avatar_url, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (user_id, steam_id) DO UPDATE SET display_name = $3, avatar_url = $4, status = 'active'`,
      [user.id, steamId, profile.personaname, profile.avatarfull]
    );

    // Set active account to the one used for login
    await pool.query(
      `UPDATE users SET active_account_id = sa.id
       FROM steam_accounts sa
       WHERE users.id = $1 AND sa.user_id = $1 AND sa.steam_id = $2`,
      [user.id, steamId]
    );

    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET!,
      { expiresIn: "30d" }
    );

    // Try to auto-refresh Steam session if we have a refresh token
    try {
      const { rows: acctRows } = await pool.query(
        `SELECT id FROM steam_accounts WHERE user_id = $1 AND steam_id = $2`,
        [user.id, steamId]
      );
      if (acctRows[0]) {
        const refreshResult = await SteamSessionService.refreshSession(acctRows[0].id);
        console.log(`[Auth] Auto-refresh Steam session for account ${acctRows[0].id}:`, refreshResult);
      }
    } catch (err) {
      console.warn(`[Auth] Auto-refresh Steam session failed (non-fatal):`, err);
    }

    // Polling-based login: nonce comes as direct query param
    const nonce = params.nonce;
    if (nonce) {
      console.log(`[Auth] Storing token for nonce: ${nonce.substring(0, 8)}...`);
      pendingLogins.set(nonce, { token, createdAt: Date.now() });
      // If opened in a popup, show success page; the opener tab is polling.
      // If same-window redirect (mobile fallback), redirect back to login page
      // so polling can resume from sessionStorage nonce.
      const webAppUrl = process.env.WEB_APP_URL || "https://skinkeeper.store";
      const isPopup = params.popup === "1";
      if (isPopup) {
        // Redirect popup back to same-origin page so window.close() works
        res.redirect(`${webAppUrl}/login/success`);
      } else {
        // Mobile same-window redirect — go back to login page
        res.redirect(`${webAppUrl}/login`);
      }
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

    // Find user — steam_accounts is the source of truth, all accounts are equal
    const { rows: existingAcct } = await pool.query(
      `SELECT sa.user_id FROM steam_accounts sa WHERE sa.steam_id = $1 LIMIT 1`,
      [steamId]
    );

    let user: any;
    if (existingAcct.length > 0) {
      const { rows } = await pool.query(
        `SELECT id, steam_id, display_name, avatar_url, is_premium, premium_until
         FROM users WHERE id = $1`,
        [existingAcct[0].user_id]
      );
      user = rows[0];
    } else {
      const { rows } = await pool.query(
        `INSERT INTO users (steam_id, display_name, avatar_url)
         VALUES ($1, $2, $3)
         ON CONFLICT (steam_id)
         DO UPDATE SET display_name = $2, avatar_url = $3
         RETURNING id, steam_id, display_name, avatar_url, is_premium, premium_until`,
        [steamId, profile.personaname, profile.avatarfull]
      );
      user = rows[0];
    }

    await pool.query(
      `INSERT INTO steam_accounts (user_id, steam_id, display_name, avatar_url, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (user_id, steam_id) DO UPDATE SET display_name = $3, avatar_url = $4, status = 'active'`,
      [user.id, steamId, profile.personaname, profile.avatarfull]
    );

    // Set active_account_id to the login account
    await pool.query(
      `UPDATE users SET active_account_id = sa.id
       FROM steam_accounts sa
       WHERE users.id = $1 AND sa.user_id = $1 AND sa.steam_id = $2`,
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

/**
 * POST /api/auth/desktop
 * Desktop app login via steamLoginSecure cookie (captured after QR steam-user connect).
 * No existing JWT required — this IS the login endpoint for the desktop.
 */
router.post("/desktop", async (req: Request, res: Response) => {
  try {
    const { steamLoginSecure, sessionId } = req.body;
    if (!steamLoginSecure) {
      res.status(400).json({ error: "steamLoginSecure is required" });
      return;
    }

    // Extract Steam ID from the cookie (it encodes the Steam ID)
    const steamId = SteamSessionService.extractSteamIdFromCookie(steamLoginSecure);
    if (!steamId) {
      res.status(401).json({ error: "Could not extract Steam ID from session cookie" });
      return;
    }

    // Fetch Steam profile
    const profile = await getSteamProfile(steamId);

    // Find or create user
    const { rows: existingAcct } = await pool.query(
      `SELECT sa.user_id FROM steam_accounts sa WHERE sa.steam_id = $1 LIMIT 1`,
      [steamId]
    );

    let userId: number;
    if (existingAcct.length > 0) {
      userId = existingAcct[0].user_id;
    } else {
      const { rows } = await pool.query(
        `INSERT INTO users (steam_id, display_name, avatar_url)
         VALUES ($1, $2, $3)
         ON CONFLICT (steam_id)
         DO UPDATE SET display_name = $2, avatar_url = $3
         RETURNING id`,
        [steamId, profile.personaname, profile.avatarfull]
      );
      userId = rows[0].id;
    }

    // Upsert steam_account
    await pool.query(
      `INSERT INTO steam_accounts (user_id, steam_id, display_name, avatar_url, status)
       VALUES ($1, $2, $3, $4, 'active')
       ON CONFLICT (user_id, steam_id) DO UPDATE SET display_name = $3, avatar_url = $4, status = 'active'`,
      [userId, steamId, profile.personaname, profile.avatarfull]
    );

    // Set active account
    await pool.query(
      `UPDATE users SET active_account_id = sa.id
       FROM steam_accounts sa
       WHERE users.id = $1 AND sa.user_id = $1 AND sa.steam_id = $2`,
      [userId, steamId]
    );

    // Save Steam session so backend can use it for trades
    if (sessionId) {
      try {
        const { rows: acctRows } = await pool.query(
          `SELECT id FROM steam_accounts WHERE user_id = $1 AND steam_id = $2`,
          [userId, steamId]
        );
        if (acctRows[0]) {
          await SteamSessionService.saveSession(acctRows[0].id, { steamLoginSecure, sessionId });
        }
      } catch (err) {
        console.warn("[Desktop auth] Session save failed (non-fatal):", err);
      }
    }

    const token = jwt.sign({ userId }, process.env.JWT_SECRET!, { expiresIn: "30d" });
    console.log(`[Desktop auth] Login OK — steamId=${steamId}, userId=${userId}`);
    res.json({ token });
  } catch (err) {
    console.error("[Desktop auth] Error:", err);
    res.status(500).json({ error: "Desktop authentication failed" });
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
         (SELECT COUNT(*)::int FROM active_steam_accounts WHERE user_id = u.id) AS account_count
       FROM users u
       LEFT JOIN active_steam_accounts sa ON sa.id = u.active_account_id
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
              sa.status,
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
        status: a.status,
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

    // Verify the account belongs to this user and is active
    const { rows } = await pool.query(
      `SELECT id FROM active_steam_accounts WHERE id = $1 AND user_id = $2`,
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

// DELETE /api/auth/accounts/:accountId — Disable an account (soft-delete)
router.delete("/accounts/:accountId", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const accountId = parseInt(req.params.accountId as string);

    // Verify the account belongs to this user
    const { rows: accounts } = await pool.query(
      `SELECT id, status FROM steam_accounts WHERE user_id = $1 ORDER BY added_at`,
      [req.userId]
    );

    const target = accounts.find((a) => a.id === accountId);
    if (!target) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const isLast = accounts.length <= 1;

    // Clear active_account_id if this was the active account
    const { rows: userRow } = await pool.query(
      `SELECT active_account_id FROM users WHERE id = $1`,
      [req.userId]
    );
    if (userRow[0]?.active_account_id === accountId) {
      const next = accounts.find((a) => a.id !== accountId);
      await pool.query(
        `UPDATE users SET active_account_id = $1 WHERE id = $2`,
        [next?.id ?? null, req.userId]
      );
    }

    // Hard delete — removes account and cascades to inventory_items etc.
    await pool.query(
      `DELETE FROM steam_accounts WHERE id = $1 AND user_id = $2`,
      [accountId, req.userId]
    );

    res.json({ success: true, lastAccountRemoved: isLast });
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
      // Move account from another user if already linked elsewhere
      await pool.query(
        `DELETE FROM steam_accounts WHERE steam_id = $1 AND user_id != $2`,
        [steamId, pending.linkUserId]
      );
      const { rows: saRows } = await pool.query(
        `INSERT INTO steam_accounts (user_id, steam_id, display_name, avatar_url, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (user_id, steam_id) DO UPDATE SET display_name = $3, avatar_url = $4, status = 'active'
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

    // Find user — steam_accounts is the source of truth
    const { rows: existingAcct } = await pool.query(
      `SELECT sa.user_id, sa.id as account_id FROM steam_accounts sa WHERE sa.steam_id = $1 LIMIT 1`,
      [steamId]
    );

    let user: any;
    let accountId: number;
    if (existingAcct.length > 0) {
      const { rows } = await pool.query(
        `SELECT id, steam_id, display_name, avatar_url, is_premium, premium_until
         FROM users WHERE id = $1`,
        [existingAcct[0].user_id]
      );
      user = rows[0];
      accountId = existingAcct[0].account_id;
      await pool.query(
        `UPDATE steam_accounts SET display_name = $1, avatar_url = $2, status = 'active' WHERE id = $3`,
        [profile.personaname, profile.avatarfull, accountId]
      );
    } else {
      const { rows } = await pool.query(
        `INSERT INTO users (steam_id, display_name, avatar_url)
         VALUES ($1, $2, $3)
         ON CONFLICT (steam_id)
         DO UPDATE SET display_name = $2, avatar_url = $3
         RETURNING id, steam_id, display_name, avatar_url, is_premium, premium_until`,
        [steamId, profile.personaname, profile.avatarfull]
      );
      user = rows[0];
      const { rows: saRows } = await pool.query(
        `INSERT INTO steam_accounts (user_id, steam_id, display_name, avatar_url, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (user_id, steam_id) DO UPDATE SET display_name = $3, avatar_url = $4, status = 'active'
         RETURNING id`,
        [user.id, steamId, profile.personaname, profile.avatarfull]
      );
      accountId = saRows[0].id;
    }

    // Set active account to the one used for login
    await pool.query(
      `UPDATE users SET active_account_id = $1 WHERE id = $2`,
      [accountId, user.id]
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

    // Find user — steam_accounts is the source of truth
    const { rows: existingAcct } = await pool.query(
      `SELECT sa.user_id, sa.id as account_id FROM steam_accounts sa WHERE sa.steam_id = $1 LIMIT 1`,
      [steamId]
    );

    let user: any;
    let accountId: number;
    if (existingAcct.length > 0) {
      const { rows } = await pool.query(
        `SELECT id, steam_id, display_name, avatar_url, is_premium, premium_until
         FROM users WHERE id = $1`,
        [existingAcct[0].user_id]
      );
      user = rows[0];
      accountId = existingAcct[0].account_id;
      // Update display info
      await pool.query(
        `UPDATE steam_accounts SET display_name = $1, avatar_url = $2 WHERE id = $3`,
        [profile.personaname, profile.avatarfull, accountId]
      );
    } else {
      const { rows } = await pool.query(
        `INSERT INTO users (steam_id, display_name, avatar_url)
         VALUES ($1, $2, $3)
         ON CONFLICT (steam_id)
         DO UPDATE SET display_name = $2, avatar_url = $3
         RETURNING id, steam_id, display_name, avatar_url, is_premium, premium_until`,
        [steamId, profile.personaname, profile.avatarfull]
      );
      user = rows[0];
      const { rows: saRows } = await pool.query(
        `INSERT INTO steam_accounts (user_id, steam_id, display_name, avatar_url, status)
         VALUES ($1, $2, $3, $4, 'active')
         ON CONFLICT (user_id, steam_id) DO UPDATE SET display_name = $3, avatar_url = $4, status = 'active'
         RETURNING id`,
        [user.id, steamId, profile.personaname, profile.avatarfull]
      );
      accountId = saRows[0].id;
    }

    // Set active account to the one used for login
    await pool.query(
      `UPDATE users SET active_account_id = $1 WHERE id = $2`,
      [accountId, user.id]
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

// ─── Demo Account (for App Store Review) ─────────────────────────────────
// POST /api/auth/demo — returns JWT for a pre-seeded demo account
// Protected by DEMO_CODE env var — reviewer enters this code in the app
router.post("/demo", async (req: Request, res: Response) => {
  try {
    const { code } = req.body;
    const demoCode = process.env.DEMO_CODE || "SKINKEEPER_REVIEW_2026";

    if (!code || code !== demoCode) {
      res.status(401).json({ error: "Invalid demo code" });
      return;
    }

    // Demo Steam ID (fake but valid format)
    const demoSteamId = "76561199999999999";
    const demoName = "SkinKeeper Demo";
    const demoAvatar = "https://avatars.steamstatic.com/fef49e7fa7e1997310d705b2a6158ff8dc1cdfeb_full.jpg";

    // Upsert demo user
    const { rows } = await pool.query(
      `INSERT INTO users (steam_id, display_name, avatar_url, is_premium)
       VALUES ($1, $2, $3, FALSE)
       ON CONFLICT (steam_id)
       DO UPDATE SET display_name = $2, avatar_url = $3, is_premium = FALSE
       RETURNING id`,
      [demoSteamId, demoName, demoAvatar]
    );
    const userId = rows[0].id;

    // Upsert demo steam account
    await pool.query(
      `INSERT INTO steam_accounts (user_id, steam_id, display_name, avatar_url)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, steam_id) DO UPDATE SET display_name = $3, avatar_url = $4`,
      [userId, demoSteamId, demoName, demoAvatar]
    );

    // Set active account
    await pool.query(
      `UPDATE users SET active_account_id = sa.id
       FROM steam_accounts sa
       WHERE users.id = $1 AND sa.user_id = $1 AND sa.steam_id = $2`,
      [userId, demoSteamId]
    );

    // Seed demo data — clear and re-seed every login for freshness
    const accountId = (await pool.query(
      `SELECT id FROM steam_accounts WHERE user_id = $1 AND steam_id = $2`, [userId, demoSteamId]
    )).rows[0].id;

    // Clean up old demo data
    await pool.query(`DELETE FROM daily_pl_snapshots WHERE user_id = $1`, [userId]);
    await pool.query(`DELETE FROM alert_history WHERE user_id = $1`, [userId]);
    await pool.query(`DELETE FROM price_alerts WHERE user_id = $1`, [userId]);
    await pool.query(`DELETE FROM item_cost_basis WHERE user_id = $1`, [userId]);
    await pool.query(`DELETE FROM trade_offer_items WHERE offer_id IN (SELECT id FROM trade_offers WHERE user_id = $1)`, [userId]);
    await pool.query(`DELETE FROM trade_offers WHERE user_id = $1`, [userId]);
    await pool.query(`DELETE FROM transactions WHERE user_id = $1`, [userId]);
    await pool.query(`DELETE FROM inventory_items WHERE steam_account_id = $1`, [accountId]);
    {

      const demoItems = [
        { name: "AK-47 | Redline (Field-Tested)", icon: "-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot7HxfDhjxszJemkV09-5lpKKqPrxN7LEmyVQ7MEpiLuSrYmnjQO3-UdsZGHyd4_Bd1RvNQ7T_FDrw-_ng5Pu75iY1zI97bhLsvQz", rarity: "Classified", rarityColor: "#D32CE6", wear: "Field-Tested", floatVal: 0.26148322, price: 46.50, stickers: [{ name: "NiKo | Antwerp 2022" }, { name: "s1mple | Antwerp 2022" }] },
        { name: "AWP | Asiimov (Field-Tested)", icon: "-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpot621FAR17PLfYQJD_9W7m5a0mvLwOq7c2G9SupUijOjAotyg3w2x_0ZkZ2rzd4OXdgRoYQuE8gDtyL_mg5K4tJ7XiSw0WqKv8kM", rarity: "Covert", rarityColor: "#EB4B4B", wear: "Field-Tested", floatVal: 0.31057841, price: 35.20, stickers: [{ name: "Fnatic | Katowice 2015" }] },
        { name: "Desert Eagle | Blaze (Factory New)", icon: "-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgposr-kLAtl7PLJTjtO7dGzh7-HnvD8J_XVkjoFuMYiiLqUrI-k3le3r0s5amj7d9eTI1I-M1rW-Fm_xO-50Jfvot2XnhS4_w8U", rarity: "Restricted", rarityColor: "#8847FF", wear: "Factory New", floatVal: 0.00842107, price: 92.00, stickers: [] },
        { name: "M4A4 | Howl (Field-Tested)", icon: "-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgpou-6kejhjxszFJTwT09S5g4yCmfDLPr7Vn35cppYo0riZp4-t3Q2x_UVpYGr6LIXHJABrYVGB_QS5k72905S_75ycm3t9-n51e4WtYjg", rarity: "Contraband", rarityColor: "#E4AE39", wear: "Field-Tested", floatVal: 0.15723690, price: 1850.00, stickers: [{ name: "Crown (Foil)" }, { name: "Crown (Foil)" }] },
        { name: "Glock-18 | Fade (Factory New)", icon: "-9a81dlWLwJ2UUGcVs_nsVtzdOEdtWwKGZZLQHTxDZ7I56KU0Zwwo4NUX4oFJZEHLbXH5ApeO4YmlhxYQknCRvCo04DEVlxkKgposbaqKAxf0vL3dzxG6eO6nYeDg7miYr7VlWgHscN32LyT8dmm31XgrxdtZzvzJYDGIFM2Y16D-FfvlOu9m9bi66Oq9HyE", rarity: "Restricted", rarityColor: "#8847FF", wear: "Factory New", floatVal: 0.01205438, price: 520.00, stickers: [{ name: "Titan | Katowice 2014" }] },
      ];

      for (const item of demoItems) {
        await pool.query(
          `INSERT INTO inventory_items (steam_account_id, asset_id, market_hash_name, icon_url, rarity, rarity_color, wear, float_value, tradable, stickers)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, TRUE, $9)
           ON CONFLICT DO NOTHING`,
          [accountId, `demo_${Math.random().toString(36).slice(2)}`, item.name, item.icon, item.rarity, item.rarityColor, item.wear, item.floatVal, JSON.stringify(item.stickers)]
        );
      }

      // Seed demo transactions
      const demoTx = [
        { name: "AK-47 | Redline (Field-Tested)", type: "buy", price: 3800, days: 30 },
        { name: "AK-47 | Redline (Field-Tested)", type: "buy", price: 4200, days: 25 },
        { name: "AWP | Asiimov (Field-Tested)", type: "buy", price: 2900, days: 20 },
        { name: "Desert Eagle | Blaze (Factory New)", type: "buy", price: 7500, days: 15 },
        { name: "M4A4 | Howl (Field-Tested)", type: "buy", price: 165000, days: 45 },
        { name: "Glock-18 | Fade (Factory New)", type: "buy", price: 48000, days: 10 },
        { name: "AK-47 | Redline (Field-Tested)", type: "sell", price: 4650, days: 5 },
        { name: "CS:GO Weapon Case", type: "sell", price: 1200, days: 3 },
        { name: "Sticker | NiKo | Antwerp 2022", type: "sell", price: 850, days: 2 },
      ];
      for (const tx of demoTx) {
        const txDate = new Date(Date.now() - tx.days * 86400000).toISOString();
        await pool.query(
          `INSERT INTO transactions (user_id, tx_id, type, market_hash_name, price_cents, tx_date, source, steam_account_id)
           VALUES ($1, $2, $3, $4, $5, $6, 'steam', $7)
           ON CONFLICT DO NOTHING`,
          [userId, `demo_tx_${Math.random().toString(36).slice(2)}`, tx.type, tx.name, tx.price, txDate, accountId]
        );
      }

      // Seed demo trade offers
      const demoTrades = [
        { partner: "76561198012345678", partnerName: "TradeBot", status: "accepted", give: "AK-47 | Redline (Field-Tested)", recv: "AWP | Asiimov (Field-Tested)", days: 7 },
        { partner: "76561198087654321", partnerName: "SkinShark", status: "pending", give: "Glock-18 | Fade (Factory New)", recv: "M4A1-S | Hyper Beast (Minimal Wear)", days: 1 },
      ];
      for (const t of demoTrades) {
        const { rows: offerRows } = await pool.query(
          `INSERT INTO trade_offers (user_id, direction, steam_offer_id, partner_steam_id, partner_name, status, is_quick_transfer, created_at, updated_at)
           VALUES ($1, 'outgoing', $2, $3, $4, $5, FALSE, NOW() - INTERVAL '${t.days} days', NOW() - INTERVAL '${t.days} days')
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [userId, `d${Math.random().toString(36).slice(2, 12)}`, t.partner, t.partnerName, t.status]
        );
        if (offerRows.length > 0) {
          const offerId = offerRows[0].id;
          const shortId = Math.random().toString(36).slice(2, 12);
          await pool.query(
            `INSERT INTO trade_offer_items (offer_id, side, asset_id, market_hash_name)
             VALUES ($1, 'give', $2, $3), ($1, 'receive', $4, $5)
             ON CONFLICT DO NOTHING`,
            [offerId, `dg${shortId}`, t.give, `dr${shortId}`, t.recv]
          );
        }
      }

      // Recalculate cost basis for P&L
      try {
        const { recalculateCostBasis } = await import("../services/profitLoss.js");
        await recalculateCostBasis(userId);
      } catch {}

      // Seed daily P&L snapshots (30 days) — realistic portfolio growth curve
      const totalInvested = 269400; // sum of all buys in cents
      const baseTotalValue = 240000; // starting value ~$2400
      for (let d = 30; d >= 1; d--) {
        // Simulate gradual growth with minor fluctuation
        const progress = (30 - d) / 30;
        const growthFactor = 1 + progress * 0.08; // ~8% growth over 30 days
        const noise = 1 + (Math.sin(d * 1.7) * 0.015); // ±1.5% daily noise
        const dayValue = Math.round(baseTotalValue * growthFactor * noise);
        const unrealized = dayValue - totalInvested;
        const realized = 6700; // from sold items ($46.50 + $12 + $8.50 earned vs cost)
        await pool.query(
          `INSERT INTO daily_pl_snapshots (user_id, snapshot_date, total_invested_cents, total_current_value_cents, realized_profit_cents, unrealized_profit_cents, cumulative_profit_cents)
           VALUES ($1, CURRENT_DATE - $2::int, $3, $4, $5, $6, $7)
           ON CONFLICT DO NOTHING`,
          [userId, d, totalInvested, dayValue, realized, unrealized, realized + unrealized]
        );
      }

      // Seed price alerts (so the alerts screen isn't empty)
      const demoAlerts = [
        { name: "AK-47 | Redline (Field-Tested)", condition: "below", threshold: 40.00, source: "steam", active: true },
        { name: "M4A4 | Howl (Field-Tested)", condition: "above", threshold: 2000.00, source: "steam", active: true },
        { name: "AWP | Asiimov (Field-Tested)", condition: "below", threshold: 30.00, source: "any", active: false },
      ];
      const alertIds: number[] = [];
      for (const a of demoAlerts) {
        const { rows: aRows } = await pool.query(
          `INSERT INTO price_alerts (user_id, market_hash_name, condition, threshold, source, is_active, cooldown_minutes)
           VALUES ($1, $2, $3, $4, $5, $6, 60)
           ON CONFLICT DO NOTHING
           RETURNING id`,
          [userId, a.name, a.condition, a.threshold, a.source, a.active]
        );
        if (aRows.length > 0) alertIds.push(aRows[0].id);
      }

      // Seed watchlist items
      const demoWatchlist = [
        { name: "AWP | Dragon Lore (Factory New)", threshold: 8500.00, icon: "-9a81dlWLwJ2UXnSI7KLp8KJw8KJwPBTifFLlaLImGs0g67mSbqL0gDN4fGJ453VJfSCLxEMuw5Ayo4F1fdnSAfSOrEBbU6lAJ4Ev7OtfAlf0Ob3djGZ0t-6lYyEhfbhJ7rQhmJf7dJ9j-vE8YjwhQ3lqkRuMD33JISUdQ85NArVqQTqx" },
        { name: "★ Karambit | Doppler (Factory New)", threshold: 750.00, icon: "-9a81dlWLwJ2UXnSI7KLp8KJw8KJwPBTifFLlaLImGs0g67mSbqL0gDN4fGJ453VJfSCLxEMuw5Ayo4F1fdnSAfSOrEBbU6lAJ4Ev7OtfAlf0Ob3djGZ0t-6lYyEhfbhJ7rQhmJf7dJ9" },
        { name: "Sticker | Titan | Katowice 2014", threshold: 45000.00, icon: "" },
      ];
      for (const w of demoWatchlist) {
        await pool.query(
          `INSERT INTO price_alerts (user_id, market_hash_name, condition, threshold, source, is_watchlist, icon_url, cooldown_minutes)
           VALUES ($1, $2, 'below', $3, 'any', TRUE, $4, 60)
           ON CONFLICT DO NOTHING`,
          [userId, w.name, w.threshold, w.icon]
        );
      }

      // Seed alert history (so notification history isn't empty)
      if (alertIds.length > 0) {
        const historyEntries = [
          { alertIdx: 0, source: "steam", price: 39.50, message: "AK-47 | Redline (FT) dropped below $40.00 — now $39.50", daysAgo: 3 },
          { alertIdx: 0, source: "steam", price: 38.20, message: "AK-47 | Redline (FT) dropped below $40.00 — now $38.20", daysAgo: 1 },
          { alertIdx: 1, source: "steam", price: 2050.00, message: "M4A4 | Howl (FT) rose above $2,000 — now $2,050", daysAgo: 2 },
        ];
        for (const h of historyEntries) {
          if (alertIds[h.alertIdx]) {
            await pool.query(
              `INSERT INTO alert_history (alert_id, user_id, source, price_usd, message, sent_at)
               VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '${h.daysAgo} days')`,
              [alertIds[h.alertIdx], userId, h.source, h.price, h.message]
            );
          }
        }
      }
    }

    const token = jwt.sign(
      { userId },
      process.env.JWT_SECRET!,
      { expiresIn: "30d" }
    );

    console.log(`[Auth] Demo login for user ${userId}`);
    res.json({ token, user: { steam_id: demoSteamId, display_name: demoName, avatar_url: demoAvatar, is_premium: false } });
  } catch (err) {
    console.error("Demo auth error:", err);
    res.status(500).json({ error: "Demo login failed" });
  }
});

export default router;
