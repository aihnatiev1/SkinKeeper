import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { TTLCache } from "../utils/TTLCache.js";
import { registerCache } from "../utils/cacheRegistry.js";

export const DEMO_STEAM_ID = "76561199999999999";

export interface AuthRequest extends Request {
  userId?: number;
  steamId?: string;
  isPremium?: boolean;
  isDemo?: boolean;
}

const demoUserIds = new Set<number>();

export async function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No token provided" });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: number;
      steamId?: string; // legacy — no longer included in new tokens
      exp?: number;
    };
    req.userId = payload.userId;
    req.steamId = payload.steamId;

    // Check if demo user (cached after first lookup)
    if (!demoUserIds.has(payload.userId)) {
      const { rows } = await pool.query(`SELECT steam_id FROM users WHERE id = $1`, [payload.userId]);
      if (rows[0]?.steam_id === DEMO_STEAM_ID) demoUserIds.add(payload.userId);
    }
    req.isDemo = demoUserIds.has(payload.userId);

    // Proactive refresh: if token expires within 3 days, send new one in header
    if (payload.exp) {
      const exp = payload.exp * 1000;
      const threeDays = 3 * 24 * 60 * 60 * 1000;
      if (exp - Date.now() < threeDays) {
        const newToken = jwt.sign(
          { userId: payload.userId },
          process.env.JWT_SECRET!,
          { expiresIn: "30d" }
        );
        res.setHeader("X-New-Token", newToken);
      }
    }

    next();
  } catch {
    res.status(401).json({ error: "Invalid token", code: "TOKEN_EXPIRED" });
  }
}

// TTL cache for premium status (5 min) to avoid DB hit on every request.
//
// IMPORTANT: this cache is in-process. Under PM2 cluster mode (>1 worker)
// each worker holds its own copy, so `invalidatePremiumCache(userId)` only
// clears the worker that called it. The same caveat applies to the ASSN
// webhook handler and the `checkExpiredSubscriptions` cron — both rely on
// per-worker invalidation. Worst case: a user keeps Premium on N-1 workers
// for up to 5 minutes after revocation/expiry. Migrating to Redis is the
// long-term fix; tracked outside this file.
const PREMIUM_CACHE_TTL = 5 * 60 * 1000;
const premiumCache = new TTLCache<number, boolean>(PREMIUM_CACHE_TTL, 500);
registerCache("premiumStatus", premiumCache as unknown as TTLCache<unknown, unknown>);

export async function requirePremium(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  // Check cache first
  const cached = premiumCache.get(req.userId);
  if (cached !== undefined) {
    if (cached) {
      req.isPremium = true;
      next();
      return;
    }
    res.status(403).json({ error: "Premium subscription required", code: "PREMIUM_REQUIRED" });
    return;
  }

  try {
    const { rows } = await pool.query(
      "SELECT is_premium FROM users WHERE id = $1",
      [req.userId]
    );
    const isPremium = rows[0]?.is_premium ?? false;

    // Cache the result
    premiumCache.set(req.userId, isPremium);

    if (isPremium) {
      req.isPremium = true;
      next();
    } else {
      res.status(403).json({ error: "Premium subscription required", code: "PREMIUM_REQUIRED" });
    }
  } catch (err) {
    console.error("Premium check error:", err);
    res.status(500).json({ error: "Failed to check premium status" });
  }
}

/** Clear premium cache for a user (call after subscription changes). */
export function invalidatePremiumCache(userId: number): void {
  premiumCache.delete(userId);
}

/**
 * Gate a route on a feature flag (P9 rollout infrastructure).
 *
 * Independent of requirePremium — a route can use both:
 *   router.post('/x', authMiddleware, requirePremium, requireFeatureFlag('auto_sell'), handler)
 *
 * Default-OFF: if the flag isn't resolved, request is rejected. This is the
 * safe behavior — kill switches must succeed at disabling features even if
 * the flag table somehow isn't populated.
 *
 * Returns 403 with code FEATURE_DISABLED on failure. Flutter clients can
 * surface a "coming soon" / fallback UI on this code.
 */
export function requireFeatureFlag(flagName: string) {
  return async function (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    if (!req.userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    try {
      // Lazy-load to avoid a hot import cycle (featureFlags imports nothing
      // from middleware, but service may be imported elsewhere).
      const { isFeatureEnabled } = await import("../services/featureFlags.js");
      const enabled = await isFeatureEnabled(req.userId, flagName, false);
      if (!enabled) {
        res.status(403).json({
          error: `Feature '${flagName}' is not enabled for this user`,
          code: "FEATURE_DISABLED",
          flag: flagName,
        });
        return;
      }
      next();
    } catch (err) {
      console.error(`Feature flag check error for '${flagName}':`, err);
      res.status(500).json({ error: "Failed to check feature flag" });
    }
  };
}
