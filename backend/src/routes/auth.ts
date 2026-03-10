import { Router, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { verifySteamOpenId, getSteamProfile } from "../services/steam.js";
import { authMiddleware, AuthRequest } from "../middleware/auth.js";
import { SteamSessionService } from "../services/steamSession.js";

const router = Router();

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
      { userId: user.id, steamId },
      process.env.JWT_SECRET!,
      { expiresIn: "30d" }
    );

    const deepLink = `skinkeeper://auth?token=${encodeURIComponent(token)}`;
    res.redirect(deepLink);
  } catch (err) {
    console.error("Steam callback error:", err);
    res.redirect("skinkeeper://auth?error=auth_failed");
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
      { userId: user.id, steamId },
      process.env.JWT_SECRET!,
      { expiresIn: "30d" }
    );

    res.json({
      token,
      user: {
        steam_id: user.steam_id,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
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
      `SELECT u.steam_id, u.display_name, u.avatar_url, u.is_premium, u.premium_until,
              u.active_account_id,
              (SELECT COUNT(*)::int FROM steam_accounts WHERE user_id = u.id) as account_count
       FROM users u WHERE u.id = $1`,
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
      maxAccounts: isPremium ? null : 1,
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
    // TODO: re-enable premium gate after testing
    // const { rows: userRow } = await pool.query(
    //   `SELECT is_premium FROM users WHERE id = $1`,
    //   [req.userId]
    // );
    // const isPremium = userRow[0]?.is_premium ?? false;
    //
    // if (!isPremium) {
    //   const { rows: countRow } = await pool.query(
    //     `SELECT COUNT(*)::int as cnt FROM steam_accounts WHERE user_id = $1`,
    //     [req.userId]
    //   );
    //   if (countRow[0].cnt >= 1) {
    //     res.status(403).json({
    //       error: "premium_required",
    //       message: "Upgrade to Premium to link multiple Steam accounts",
    //     });
    //     return;
    //   }
    // }

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

    // Delete (CASCADE handles inventory_items)
    await pool.query(
      `DELETE FROM steam_accounts WHERE id = $1 AND user_id = $2`,
      [accountId, req.userId]
    );

    if (isLastAccount) {
      // Clear active account — frontend should redirect to login
      await pool.query(
        `UPDATE users SET active_account_id = NULL WHERE id = $1`,
        [req.userId]
      );
      res.json({ success: true, lastAccountRemoved: true });
      return;
    }

    // If deleted account was active, switch to first remaining
    const { rows: userRow } = await pool.query(
      `SELECT active_account_id FROM users WHERE id = $1`,
      [req.userId]
    );
    if (userRow[0]?.active_account_id === accountId) {
      const { rows: remaining } = await pool.query(
        `SELECT id FROM steam_accounts WHERE user_id = $1 ORDER BY added_at LIMIT 1`,
        [req.userId]
      );
      if (remaining.length > 0) {
        await pool.query(
          `UPDATE users SET active_account_id = $1 WHERE id = $2`,
          [remaining[0].id, req.userId]
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Unlink account error:", err);
    res.status(500).json({ error: "Failed to unlink account" });
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
      { userId: user.id, steamId },
      process.env.JWT_SECRET!,
      { expiresIn: "30d" }
    );

    res.json({
      status: "authenticated",
      token,
      user: {
        steam_id: user.steam_id,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
        is_premium: user.is_premium,
        premium_until: user.premium_until,
      },
    });
  } catch (err) {
    console.error("QR poll (login) error:", err);
    res.status(500).json({ error: "Failed to poll QR session" });
  }
});

export default router;
