import { Router, Response } from "express";
import { pool } from "../db/pool.js";
import {
  authMiddleware,
  requirePremium,
  AuthRequest,
} from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { createAlertSchema, toggleAlertSchema, registerDeviceSchema } from "../middleware/schemas.js";

const router = Router();

// GET /api/alerts — list user's alerts (excludes watchlist items)
router.get(
  "/",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, market_hash_name, condition, threshold::float, source,
                is_active, cooldown_minutes, last_triggered_at, created_at
         FROM price_alerts
         WHERE user_id = $1 AND (is_watchlist = FALSE OR is_watchlist IS NULL)
         ORDER BY created_at DESC`,
        [req.userId]
      );
      res.json({ alerts: rows });
    } catch (err) {
      console.error("Alerts fetch error:", err);
      res.status(500).json({ error: "Failed to fetch alerts" });
    }
  }
);

// POST /api/alerts — create alert (tier-based limit: 5 free / 20 premium)
router.post(
  "/",
  authMiddleware,
  validateBody(createAlertSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { market_hash_name, condition, threshold, source, cooldown_minutes } =
        req.body;

      const alertSource = source;
      const cooldown = cooldown_minutes;

      // Query premium status first, then apply tier-based limit
      const { rows: userRows } = await pool.query(
        `SELECT is_premium FROM users WHERE id = $1`,
        [req.userId]
      );
      const isPremium = userRows[0]?.is_premium ?? false;
      const maxAlerts = isPremium ? 20 : 5;

      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM price_alerts WHERE user_id = $1`,
        [req.userId]
      );
      if (countRows[0].cnt >= maxAlerts) {
        if (!isPremium) {
          res.status(403).json({
            error: "premium_required",
            code: "PREMIUM_REQUIRED",
            message: "Upgrade to PRO to create more than 5 price alerts",
          });
          return;
        }
        res.status(400).json({ error: "Maximum 20 alerts reached" });
        return;
      }

      // Prevent duplicate alerts (same item + condition + threshold + source)
      const { rows: existing } = await pool.query(
        `SELECT id FROM price_alerts
         WHERE user_id = $1 AND market_hash_name = $2 AND condition = $3
           AND threshold = $4 AND source = $5 AND is_active = TRUE`,
        [req.userId, market_hash_name, condition, threshold, alertSource]
      );
      if (existing.length > 0) {
        res.status(409).json({ error: "Identical alert already exists" });
        return;
      }

      const { rows } = await pool.query(
        `INSERT INTO price_alerts (user_id, market_hash_name, condition, threshold, source, cooldown_minutes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, market_hash_name, condition, threshold, source, is_active, cooldown_minutes, created_at`,
        [req.userId, market_hash_name, condition, threshold, alertSource, cooldown]
      );

      res.status(201).json(rows[0]);
    } catch (err) {
      console.error("Alert create error:", err);
      res.status(500).json({ error: "Failed to create alert" });
    }
  }
);

// GET /api/alerts/history — triggered alert history (BEFORE /:id) (PREMIUM)
router.get(
  "/history",
  authMiddleware,
  requirePremium,
  async (req: AuthRequest, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
      const { rows } = await pool.query(
        `SELECT ah.id, ah.alert_id, ah.source, ah.price_usd, ah.message, ah.sent_at,
                pa.market_hash_name, pa.condition, pa.threshold
         FROM alert_history ah
         JOIN price_alerts pa ON pa.id = ah.alert_id
         WHERE ah.user_id = $1
         ORDER BY ah.sent_at DESC
         LIMIT $2`,
        [req.userId, limit]
      );
      res.json({ history: rows });
    } catch (err) {
      console.error("Alert history error:", err);
      res.status(500).json({ error: "Failed to fetch alert history" });
    }
  }
);

// POST /api/alerts/device — register FCM token (no premium needed)
router.post(
  "/device",
  authMiddleware,
  validateBody(registerDeviceSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { fcm_token, platform, push_prefs } = req.body;

      await pool.query(
        `INSERT INTO user_devices (user_id, fcm_token, platform, push_prefs)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, fcm_token)
         DO UPDATE SET updated_at = NOW(), push_prefs = COALESCE($4, user_devices.push_prefs)`,
        [req.userId, fcm_token, platform, push_prefs ? JSON.stringify(push_prefs) : null]
      );

      res.json({ success: true });
    } catch (err) {
      console.error("Device register error:", err);
      res.status(500).json({ error: "Failed to register device" });
    }
  }
);

// DELETE /api/alerts/device — unregister FCM token
router.delete(
  "/device",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { fcm_token } = req.body;
      await pool.query(
        `DELETE FROM user_devices WHERE user_id = $1 AND fcm_token = $2`,
        [req.userId, fcm_token]
      );
      res.json({ success: true });
    } catch (err) {
      console.error("Device unregister error:", err);
      res.status(500).json({ error: "Failed to unregister device" });
    }
  }
);

// GET /api/alerts/search-items?q=AWP+Asiimov — search items from price_history
router.get(
  "/search-items",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    const q = (req.query.q as string || "").trim();
    if (q.length < 2) {
      res.json({ items: [] });
      return;
    }

    try {
      const { rows } = await pool.query(
        `SELECT cp.market_hash_name, cp.price_usd::float AS price,
                (SELECT ii.icon_url FROM inventory_items ii
                 WHERE ii.market_hash_name = cp.market_hash_name AND ii.icon_url IS NOT NULL
                 LIMIT 1) AS icon_url
         FROM current_prices cp
         WHERE cp.market_hash_name ILIKE $1
           AND cp.price_usd > 0
           AND cp.source = 'steam'
         ORDER BY cp.market_hash_name
         LIMIT 15`,
        [`%${q}%`]
      );

      res.json({ items: rows });
    } catch (err) {
      console.error("Item search error:", err);
      res.status(500).json({ error: "Search failed" });
    }
  }
);

// GET /api/alerts/watchlist — get user's watchlist items with current prices
router.get(
  "/watchlist",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT a.id, a.market_hash_name, a.condition, a.threshold::float,
                a.source, a.is_active, a.cooldown_minutes, a.last_triggered_at,
                a.created_at, a.icon_url, a.is_watchlist,
                cp.price_usd::float AS current_price
         FROM price_alerts a
         LEFT JOIN current_prices cp
           ON cp.market_hash_name = a.market_hash_name
           AND cp.source = 'steam'
           AND cp.price_usd > 0
         WHERE a.user_id = $1 AND a.is_watchlist = TRUE
         ORDER BY a.created_at DESC`,
        [req.userId]
      );
      res.json({ items: rows });
    } catch (err) {
      console.error("Watchlist error:", err);
      res.status(500).json({ error: "Failed to load watchlist" });
    }
  }
);

// POST /api/alerts/watchlist — add item to watchlist
router.post(
  "/watchlist",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { marketHashName, targetPrice, source, iconUrl } = req.body;
      if (!marketHashName || !targetPrice) {
        res.status(400).json({ error: "marketHashName and targetPrice required" });
        return;
      }

      const { rows } = await pool.query(
        `INSERT INTO price_alerts (user_id, market_hash_name, condition, threshold, source, is_watchlist, icon_url, cooldown_minutes)
         VALUES ($1, $2, 'below', $3, $4, TRUE, $5, 60)
         RETURNING id`,
        [req.userId, marketHashName, targetPrice, source || "any", iconUrl]
      );

      res.json({ id: rows[0].id, success: true });
    } catch (err) {
      console.error("Watchlist add error:", err);
      res.status(500).json({ error: "Failed to add to watchlist" });
    }
  }
);

// DELETE /api/alerts/watchlist/:id — remove from watchlist
router.delete(
  "/watchlist/:id",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      await pool.query(
        `DELETE FROM price_alerts WHERE id = $1 AND user_id = $2 AND is_watchlist = TRUE`,
        [req.params.id, req.userId]
      );
      res.json({ success: true });
    } catch (err) {
      console.error("Watchlist remove error:", err);
      res.status(500).json({ error: "Failed to remove from watchlist" });
    }
  }
);

// PATCH /api/alerts/:id — toggle active/inactive (free tier allowed)
router.patch(
  "/:id",
  authMiddleware,
  validateBody(toggleAlertSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const { is_active } = req.body;
      const { rows } = await pool.query(
        `UPDATE price_alerts SET is_active = $1
         WHERE id = $2 AND user_id = $3
         RETURNING id, market_hash_name, condition, threshold, source, is_active`,
        [is_active, req.params.id, req.userId]
      );
      if (rows.length === 0) {
        res.status(404).json({ error: "Alert not found" });
        return;
      }
      res.json(rows[0]);
    } catch (err) {
      console.error("Alert toggle error:", err);
      res.status(500).json({ error: "Failed to update alert" });
    }
  }
);

// DELETE /api/alerts/:id (free tier allowed)
router.delete(
  "/:id",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      // Delete history first (no FK cascade), then the alert
      await pool.query(
        `DELETE FROM alert_history WHERE alert_id = $1 AND user_id = $2`,
        [req.params.id, req.userId]
      );
      const { rowCount } = await pool.query(
        `DELETE FROM price_alerts WHERE id = $1 AND user_id = $2`,
        [req.params.id, req.userId]
      );
      if (rowCount === 0) {
        res.status(404).json({ error: "Alert not found" });
        return;
      }
      res.json({ success: true });
    } catch (err) {
      console.error("Alert delete error:", err);
      res.status(500).json({ error: "Failed to delete alert" });
    }
  }
);

export default router;
