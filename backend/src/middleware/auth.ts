import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { TTLCache } from "../utils/TTLCache.js";
import { registerCache } from "../utils/cacheRegistry.js";

export interface AuthRequest extends Request {
  userId?: number;
  steamId?: string;
  isPremium?: boolean;
}

export function authMiddleware(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
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

// TTL cache for premium status (5 min) to avoid DB hit on every request
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
    res.status(403).json({ error: "Premium subscription required" });
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
      res.status(403).json({ error: "Premium subscription required" });
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
