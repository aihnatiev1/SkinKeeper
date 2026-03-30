/**
 * Price Change Notifier — sends push notifications when inventory items
 * have significant price movements (±10%+ in 24h).
 *
 * Runs every 4 hours. Max 3 notifications per user per run to avoid spam.
 */

import { pool } from "../db/pool.js";
import { sendPush, isFirebaseReady } from "./firebase.js";

const MAX_NOTIFICATIONS_PER_USER = 3;
const MIN_CHANGE_PCT = 10; // ±10% threshold

export async function checkPriceChanges(): Promise<void> {
  if (!isFirebaseReady()) return;

  // Find items with significant 24h price changes that belong to users with push tokens.
  // Join: inventory_items → current_prices (now) → price_history (24h ago)
  const { rows } = await pool.query(`
    WITH user_items AS (
      SELECT DISTINCT sa.user_id, ii.market_hash_name
      FROM inventory_items ii
      JOIN active_steam_accounts sa ON ii.steam_account_id = sa.id
      WHERE EXISTS (SELECT 1 FROM user_devices ud WHERE ud.user_id = sa.user_id)
    ),
    price_now AS (
      SELECT market_hash_name, price_usd::float AS price
      FROM current_prices
      WHERE source = 'steam' AND price_usd > 0
        AND updated_at > NOW() - INTERVAL '6 hours'
    ),
    price_24h AS (
      SELECT DISTINCT ON (market_hash_name)
        market_hash_name, price_usd::float AS price
      FROM price_history
      WHERE source = 'steam' AND price_usd > 0
        AND recorded_at BETWEEN NOW() - INTERVAL '28 hours' AND NOW() - INTERVAL '20 hours'
      ORDER BY market_hash_name, recorded_at DESC
    )
    SELECT
      ui.user_id,
      ui.market_hash_name,
      pn.price AS current_price,
      p24.price AS old_price,
      ROUND(((pn.price - p24.price) / p24.price * 100)::numeric, 1) AS change_pct
    FROM user_items ui
    JOIN price_now pn ON pn.market_hash_name = ui.market_hash_name
    JOIN price_24h p24 ON p24.market_hash_name = ui.market_hash_name
    WHERE p24.price > 0
      AND ABS((pn.price - p24.price) / p24.price * 100) >= $1
    ORDER BY ui.user_id, ABS((pn.price - p24.price) / p24.price * 100) DESC
  `, [MIN_CHANGE_PCT]);

  if (rows.length === 0) return;

  // Group by user, cap at MAX_NOTIFICATIONS_PER_USER
  const byUser = new Map<number, typeof rows>();
  for (const row of rows) {
    const list = byUser.get(row.user_id) ?? [];
    if (list.length < MAX_NOTIFICATIONS_PER_USER) {
      list.push(row);
      byUser.set(row.user_id, list);
    }
  }

  let totalSent = 0;

  for (const [userId, items] of byUser) {
    const { rows: devices } = await pool.query(
      `SELECT fcm_token FROM user_devices WHERE user_id = $1`,
      [userId]
    );
    const tokens = devices.map((d: any) => d.fcm_token as string);
    if (tokens.length === 0) continue;

    for (const item of items) {
      const direction = item.change_pct > 0 ? "up" : "down";
      const arrow = item.change_pct > 0 ? "\u2191" : "\u2193"; // ↑ ↓
      const shortName = item.market_hash_name.includes(" | ")
        ? item.market_hash_name.split(" | ")[1].split(" (")[0]
        : item.market_hash_name;

      const title = `${shortName} ${arrow} ${Math.abs(item.change_pct)}%`;
      const body = `$${item.old_price.toFixed(2)} \u2192 $${item.current_price.toFixed(2)} (${direction} in 24h)`;

      const { successCount, failedTokens } = await sendPush(
        tokens,
        title,
        body,
        {
          type: "price_change",
          marketHashName: item.market_hash_name,
          changePct: String(item.change_pct),
        }
      );

      // Cleanup failed tokens
      for (const token of failedTokens) {
        await pool.query(
          `DELETE FROM user_devices WHERE user_id = $1 AND fcm_token = $2`,
          [userId, token]
        );
      }

      if (successCount > 0) totalSent++;
    }
  }

  if (totalSent > 0) {
    console.log(`[PriceNotify] Sent ${totalSent} price change notifications to ${byUser.size} users`);
  }
}
