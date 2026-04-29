import { pool } from "../db/pool.js";
import { decrypt } from "./crypto.js";
import { sendPush, isFirebaseReady } from "./firebase.js";

/**
 * Steam refresh-tokens last ~30 days. Once they expire, the 30-min refresh
 * cron can no longer keep the access-token alive — the user has to re-login
 * manually. This notifier warns them ~2 days before that happens, so they
 * can re-login in calm rather than discovering the loss mid-trade.
 *
 * Idempotency: we persist the expiry timestamp we notified for, so the daily
 * cron sending the same warning N times is a no-op after the first.
 */

const NOTIFY_WINDOW_MIN_HOURS = 36; // start warning at ~36h before expiry
const NOTIFY_WINDOW_MAX_HOURS = 72; // don't warn earlier than 72h out

interface CandidateRow {
  id: number;
  user_id: number | null;
  display_name: string | null;
  steam_refresh_token: string | null;
  expiry_notified_for: Date | null;
}

function decodeJwtExpiry(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

function safeDecrypt(value: string): string {
  try {
    return decrypt(value);
  } catch {
    return value;
  }
}

export async function runSessionExpiryNotifierSweep(): Promise<{
  scanned: number;
  notified: number;
}> {
  if (!isFirebaseReady()) return { scanned: 0, notified: 0 };

  const { rows } = await pool.query<CandidateRow>(
    `SELECT id, user_id, display_name, steam_refresh_token, expiry_notified_for
       FROM steam_accounts
      WHERE deleted_at IS NULL
        AND status = 'active'
        AND user_id IS NOT NULL
        AND steam_refresh_token IS NOT NULL`,
  );

  let notified = 0;
  const nowMs = Date.now();
  const minMs = nowMs + NOTIFY_WINDOW_MIN_HOURS * 3600 * 1000;
  const maxMs = nowMs + NOTIFY_WINDOW_MAX_HOURS * 3600 * 1000;

  for (const row of rows) {
    if (!row.steam_refresh_token || row.user_id == null) continue;

    const exp = decodeJwtExpiry(safeDecrypt(row.steam_refresh_token));
    if (exp == null) continue;

    const expMs = exp * 1000;
    if (expMs < minMs || expMs > maxMs) continue;

    // Dedup: if we already notified for this exact expiry, skip
    if (
      row.expiry_notified_for &&
      Math.abs(row.expiry_notified_for.getTime() - expMs) < 60_000
    ) {
      continue;
    }

    const { rows: devices } = await pool.query(
      `SELECT fcm_token FROM user_devices WHERE user_id = $1`,
      [row.user_id],
    );
    const tokens = devices.map((d: { fcm_token: string }) => d.fcm_token);
    if (tokens.length === 0) continue;

    const hoursLeft = Math.round((expMs - nowMs) / 3600 / 1000);
    const label = row.display_name || "your Steam account";
    const { successCount, failedTokens } = await sendPush(
      tokens,
      "Steam session expiring",
      `Sign in again for ${label} within ${hoursLeft}h to keep auto-sync running.`,
      {
        type: "session_expiring",
        accountId: String(row.id),
        expiresAt: new Date(expMs).toISOString(),
      },
    );

    if (successCount > 0) {
      await pool.query(
        `UPDATE steam_accounts SET expiry_notified_for = to_timestamp($1 / 1000.0) WHERE id = $2`,
        [expMs, row.id],
      );
      notified += 1;
      console.log(
        `[SessionExpiry] Warned user ${row.user_id} (account ${row.id}) — ${hoursLeft}h left, ${successCount} devices`,
      );
    }

    for (const token of failedTokens) {
      await pool.query(
        `DELETE FROM user_devices WHERE user_id = $1 AND fcm_token = $2`,
        [row.user_id, token],
      );
    }
  }

  return { scanned: rows.length, notified };
}
