import { pool } from "../db/pool.js";
import { sendPush, isFirebaseReady } from "./firebase.js";

interface ActiveAlert {
  id: number;
  user_id: number;
  market_hash_name: string;
  condition: string;
  threshold: number;
  source: string;
  cooldown_minutes: number;
  last_triggered_at: string | null;
}

interface TriggeredAlert {
  alert: ActiveAlert;
  price: number;
  message: string;
}

/**
 * Evaluate all active alerts against newly saved prices.
 * Called after every savePrices() — source-specific.
 */
export async function evaluateAlerts(
  prices: Map<string, number>,
  source: string
): Promise<void> {
  if (!isFirebaseReady() || prices.size === 0) return;

  const itemNames = [...prices.keys()];
  if (itemNames.length === 0) return;

  // Fetch active alerts matching these items + source
  const placeholders = itemNames.map((_, i) => `$${i + 1}`).join(",");
  const { rows: alerts } = await pool.query<ActiveAlert>(
    `SELECT id, user_id, market_hash_name, condition, threshold::float AS threshold,
            source, cooldown_minutes, last_triggered_at
     FROM price_alerts
     WHERE is_active = TRUE
       AND market_hash_name IN (${placeholders})
       AND (source = $${itemNames.length + 1} OR source = 'any')`,
    [...itemNames, source]
  );

  if (alerts.length === 0) return;

  const triggered: TriggeredAlert[] = [];

  for (const alert of alerts) {
    // Cooldown check
    if (alert.last_triggered_at) {
      const cooldownMs = alert.cooldown_minutes * 60_000;
      const lastTriggered = new Date(alert.last_triggered_at).getTime();
      if (Date.now() - lastTriggered < cooldownMs) continue;
    }

    const currentPrice = prices.get(alert.market_hash_name);
    if (currentPrice == null || currentPrice <= 0) continue;

    let shouldTrigger = false;
    let message = "";

    switch (alert.condition) {
      case "above":
        if (currentPrice >= alert.threshold) {
          shouldTrigger = true;
          message = `${alert.market_hash_name} is now $${currentPrice.toFixed(2)} (above $${alert.threshold.toFixed(2)}) on ${source}`;
        }
        break;

      case "below":
        if (currentPrice <= alert.threshold) {
          shouldTrigger = true;
          message = `${alert.market_hash_name} is now $${currentPrice.toFixed(2)} (below $${alert.threshold.toFixed(2)}) on ${source}`;
        }
        break;

      case "changePct": {
        // Get previous price for this item+source
        const { rows: prevRows } = await pool.query(
          `SELECT price_usd::float AS price
           FROM price_history
           WHERE market_hash_name = $1 AND source = $2 AND price_usd > 0
           ORDER BY recorded_at DESC
           OFFSET 1 LIMIT 1`,
          [alert.market_hash_name, source]
        );
        if (prevRows.length > 0) {
          const prevPrice = prevRows[0].price;
          const pctChange = Math.abs(
            ((currentPrice - prevPrice) / prevPrice) * 100
          );
          if (pctChange >= alert.threshold) {
            const direction = currentPrice > prevPrice ? "up" : "down";
            shouldTrigger = true;
            message = `${alert.market_hash_name} moved ${direction} ${pctChange.toFixed(1)}% to $${currentPrice.toFixed(2)} on ${source}`;
          }
        }
        break;
      }
    }

    if (shouldTrigger) {
      triggered.push({ alert, price: currentPrice, message });
    }
  }

  if (triggered.length === 0) return;

  // Group by user for batch notification
  const byUser = new Map<number, TriggeredAlert[]>();
  for (const t of triggered) {
    const list = byUser.get(t.alert.user_id) ?? [];
    list.push(t);
    byUser.set(t.alert.user_id, list);
  }

  for (const [userId, userAlerts] of byUser) {
    const { rows: devices } = await pool.query(
      `SELECT fcm_token FROM user_devices WHERE user_id = $1`,
      [userId]
    );
    const tokens = devices.map((d: any) => d.fcm_token as string);
    if (tokens.length === 0) continue;

    for (const ta of userAlerts) {
      const { successCount, failedTokens } = await sendPush(
        tokens,
        "Price Alert",
        ta.message,
        {
          type: "price_alert",
          alertId: String(ta.alert.id),
          marketHashName: ta.alert.market_hash_name,
        }
      );

      // Record in history
      await pool.query(
        `INSERT INTO alert_history (alert_id, user_id, source, price_usd, message)
         VALUES ($1, $2, $3, $4, $5)`,
        [ta.alert.id, userId, source, ta.price, ta.message]
      );

      // Update last triggered
      await pool.query(
        `UPDATE price_alerts SET last_triggered_at = NOW() WHERE id = $1`,
        [ta.alert.id]
      );

      // Clean up stale tokens
      for (const token of failedTokens) {
        await pool.query(
          `DELETE FROM user_devices WHERE user_id = $1 AND fcm_token = $2`,
          [userId, token]
        );
      }

      if (successCount > 0) {
        console.log(
          `[Alerts] Sent: "${ta.message}" to user ${userId} (${successCount} devices)`
        );
      }
    }
  }
}
