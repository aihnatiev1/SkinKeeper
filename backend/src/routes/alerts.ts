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

// GET /api/alerts — list user's alerts (free tier allowed for managing existing alerts)
router.get(
  "/",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, market_hash_name, condition, threshold::float, source,
                is_active, cooldown_minutes, last_triggered_at, created_at
         FROM price_alerts
         WHERE user_id = $1
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
            message: "Upgrade to PRO to create more than 5 price alerts",
          });
          return;
        }
        res.status(400).json({ error: "Maximum 20 alerts reached" });
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
  /* requirePremium — disabled for testing */
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
