import { pool } from "../db/pool.js";
import { SteamSessionService } from "./steamSession.js";

/**
 * Pre-emptive Steam session refresher.
 *
 * Steam's `steamLoginSecure` cookie carries a short-lived (24h) access token.
 * A separate `steamRefreshToken` lives ~30 days and can mint fresh cookies via
 * `/jwt/finalizelogin`. Browsers do this in the background automatically — we
 * replicate that by running this job every N minutes and refreshing any
 * account whose access-token JWT will expire within `REFRESH_WINDOW_HOURS`.
 *
 * The refresh-token itself may rotate; `refreshSession()` persists the new one
 * back to `steam_accounts.steam_refresh_token` when it changes.
 */

const REFRESH_WINDOW_HOURS = 4; // refresh when <4h of access-token life left
const MAX_CONCURRENT = 3; // be gentle on Steam — sequential-ish

interface CandidateRow {
  id: number;
  session_updated_at: Date | null;
}

async function findRefreshCandidates(): Promise<CandidateRow[]> {
  // Grab every account that (a) has a refresh token and (b) was updated
  // more than (24h - REFRESH_WINDOW_HOURS) ago. Fine-grained expiry is
  // re-checked inside the loop via JWT decode so we never refresh too early.
  const cutoffHours = 24 - REFRESH_WINDOW_HOURS;
  const { rows } = await pool.query(
    `SELECT id, session_updated_at
       FROM steam_accounts
      WHERE steam_refresh_token IS NOT NULL
        AND steam_login_secure IS NOT NULL
        AND (
          session_updated_at IS NULL
          OR session_updated_at < NOW() - ($1 || ' hours')::interval
        )
      ORDER BY session_updated_at ASC NULLS FIRST`,
    [cutoffHours],
  );
  return rows as CandidateRow[];
}

async function refreshOne(accountId: number): Promise<void> {
  const status = await SteamSessionService.getSessionStatus(accountId);
  // Skip accounts that are still fresh (JWT decode said >REFRESH_WINDOW_HOURS)
  // or genuinely expired past the refresh-token grace (caller sees 'none'/'expired').
  if (status === "valid") return;
  if (status === "none") return;

  try {
    const { refreshed, reason } = await SteamSessionService.refreshSession(accountId);
    if (refreshed) {
      console.log(`[SessionRefresh] accountId=${accountId} refreshed OK (was ${status})`);
    } else {
      console.log(`[SessionRefresh] accountId=${accountId} skip — ${reason}`);
    }
  } catch (err) {
    console.error(`[SessionRefresh] accountId=${accountId} failed:`, err);
  }
}

export async function runSessionRefreshSweep(): Promise<{
  scanned: number;
  attempted: number;
}> {
  const candidates = await findRefreshCandidates();
  if (candidates.length === 0) return { scanned: 0, attempted: 0 };

  let attempted = 0;
  for (let i = 0; i < candidates.length; i += MAX_CONCURRENT) {
    const batch = candidates.slice(i, i + MAX_CONCURRENT);
    await Promise.all(
      batch.map((row) => {
        attempted += 1;
        return refreshOne(row.id);
      }),
    );
  }

  return { scanned: candidates.length, attempted };
}
