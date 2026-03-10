import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";

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
      steamId: string;
    };
    req.userId = payload.userId;
    req.steamId = payload.steamId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export function requirePremium(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  pool
    .query("SELECT is_premium FROM users WHERE id = $1", [req.userId])
    .then(({ rows }) => {
      if (rows[0]?.is_premium) {
        req.isPremium = true;
        next();
      } else {
        res.status(403).json({ error: "Premium subscription required" });
      }
    })
    .catch((err) => {
      console.error("Premium check error:", err);
      res.status(500).json({ error: "Failed to check premium status" });
    });
}
