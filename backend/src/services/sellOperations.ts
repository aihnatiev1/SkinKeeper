import { pool } from "../db/pool.js";
import { SteamSessionService } from "./steamSession.js";
import { sellItem } from "./market.js";
import { recalculateCostBasis } from "./profitLoss.js";

// ─── Types ───────────────────────────────────────────────────────────────

interface SellOperationItemInput {
  assetId: string;
  marketHashName: string;
  priceCents: number;
  accountId?: number;
}

interface SellOperationItem {
  id: number;
  operationId: string;
  assetId: string;
  marketHashName: string | null;
  priceCents: number;
  accountId: number | null;
  status: "queued" | "listing" | "listed" | "failed" | "cancelled";
  errorMessage: string | null;
  requiresConfirmation: boolean;
  updatedAt: string;
}

interface SellOperation {
  id: string;
  userId: number;
  status: "pending" | "in_progress" | "completed" | "cancelled";
  totalItems: number;
  succeeded: number;
  failed: number;
  createdAt: string;
  completedAt: string | null;
  items: SellOperationItem[];
}

interface DailyVolumeInfo {
  count: number;
  limit: number;
  warningAt: number;
  remaining: number;
}

// ─── Constants ───────────────────────────────────────────────────────────

const BASE_DELAY_MS = 3000;
const ERROR_DELAY_MS = 5000;
const CONSECUTIVE_ERROR_DELAY_MS = 10000;
const DAILY_SELL_LIMIT = 200;
const DAILY_SELL_WARNING = 150;

// Track running operations to prevent duplicate processing
const activeOperations = new Set<string>();

// ─── Service ─────────────────────────────────────────────────────────────

/**
 * Create a new sell operation and begin async processing.
 * Returns the operation ID immediately; items are listed in the background.
 */
export async function createOperation(
  userId: number,
  items: SellOperationItemInput[],
  accountId?: number
): Promise<string> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: opRows } = await client.query(
      `INSERT INTO sell_operations (user_id, total_items, steam_account_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [userId, items.length, accountId ?? null]
    );
    const operationId: string = opRows[0].id;

    // Batch insert all items
    const values: unknown[] = [];
    const placeholders: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const offset = i * 5;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5})`
      );
      values.push(
        operationId,
        items[i].assetId,
        items[i].marketHashName,
        items[i].priceCents,
        items[i].accountId ?? null
      );
    }

    await client.query(
      `INSERT INTO sell_operation_items (operation_id, asset_id, market_hash_name, price_cents, account_id)
       VALUES ${placeholders.join(", ")}`,
      values
    );

    await client.query("COMMIT");

    // Fire and forget — processing runs in the background
    processOperation(operationId, userId).catch(async (err) => {
      console.error(`[SellOp ${operationId}] Unhandled processing error:`, err);
      // Mark operation as failed in DB so client can see the error
      try {
        await pool.query(
          `UPDATE sell_operations SET status = 'completed', completed_at = NOW() WHERE id = $1 AND status != 'completed'`,
          [operationId]
        );
        await pool.query(
          `UPDATE sell_operation_items SET status = 'failed', error_message = $1, updated_at = NOW()
           WHERE operation_id = $2 AND status = 'queued'`,
          [err instanceof Error ? err.message : "Unexpected processing error", operationId]
        );
      } catch (dbErr) {
        console.error(`[SellOp ${operationId}] Failed to update DB after crash:`, dbErr);
      }
    });

    return operationId;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Process a sell operation: list each queued item on Steam Market.
 * Runs asynchronously with adaptive delays between items.
 */
async function processOperation(
  operationId: string,
  userId: number
): Promise<void> {
  if (activeOperations.has(operationId)) return;
  activeOperations.add(operationId);

  try {
    // Mark operation as in_progress
    await pool.query(
      `UPDATE sell_operations SET status = 'in_progress' WHERE id = $1`,
      [operationId]
    );

    // Resolve fallback accountId from the operation
    const { rows: opData } = await pool.query(
      `SELECT steam_account_id FROM sell_operations WHERE id = $1`,
      [operationId]
    );
    const fallbackAccountId: number = opData[0]?.steam_account_id
      ?? await SteamSessionService.getActiveAccountId(userId);

    // Session cache — one session per account, fetched lazily
    const sessionCache = new Map<number, Awaited<ReturnType<typeof SteamSessionService.ensureValidSession>>>();
    const getSession = async (accountId: number) => {
      if (!sessionCache.has(accountId)) {
        const session = await SteamSessionService.ensureValidSession(accountId);
        if (!session) {
          throw new Error("Steam session not available. Please authenticate your Steam session in Settings.");
        }
        sessionCache.set(accountId, session);
      }
      return sessionCache.get(accountId)!;
    };

    // Load queued items WITH per-item account_id
    const { rows: items } = await pool.query(
      `SELECT id, asset_id, market_hash_name, price_cents, account_id
       FROM sell_operation_items
       WHERE operation_id = $1 AND status = 'queued'
       ORDER BY id`,
      [operationId]
    );

    let consecutiveErrors = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Check if operation was cancelled
      const { rows: opCheck } = await pool.query(
        `SELECT status FROM sell_operations WHERE id = $1`,
        [operationId]
      );
      if (opCheck[0]?.status === "cancelled") break;

      // Update item status to 'listing'
      await pool.query(
        `UPDATE sell_operation_items SET status = 'listing', updated_at = NOW() WHERE id = $1`,
        [item.id]
      );

      const itemAccountId: number = item.account_id ?? fallbackAccountId;

      try {
        const session = await getSession(itemAccountId);
        const result = await sellItem(session, item.asset_id, item.price_cents, itemAccountId);

        if (result.success) {
          await pool.query(
            `UPDATE sell_operation_items
             SET status = 'listed', requires_confirmation = $1, updated_at = NOW()
             WHERE id = $2`,
            [result.requiresConfirmation, item.id]
          );
          await pool.query(
            `UPDATE sell_operations SET succeeded = succeeded + 1 WHERE id = $1`,
            [operationId]
          );
          // Note: sell transaction is NOT created here — it will appear
          // via /transactions/sync when the item is actually purchased on Steam Market.
          await incrementVolume(userId);
          consecutiveErrors = 0;
        } else {
          await pool.query(
            `UPDATE sell_operation_items
             SET status = 'failed', error_message = $1, updated_at = NOW()
             WHERE id = $2`,
            [result.message ?? "Unknown error", item.id]
          );
          await pool.query(
            `UPDATE sell_operations SET failed = failed + 1 WHERE id = $1`,
            [operationId]
          );
          consecutiveErrors++;

          // If the error indicates session expiry, refresh and update the cache for this account
          const sessionError =
            result.message?.toLowerCase().includes("login") ||
            result.message?.toLowerCase().includes("expired") ||
            result.message?.toLowerCase().includes("not logged in");

          if (sessionError) {
            try {
              sessionCache.set(itemAccountId, await SteamSessionService.ensureValidSession(itemAccountId));
            } catch {
              // Session refresh failed for this account — fail all remaining items for it
              const { rows: queuedItems } = await pool.query(
                `UPDATE sell_operation_items
                 SET status = 'failed', error_message = 'Session expired and refresh failed', updated_at = NOW()
                 WHERE operation_id = $1 AND status = 'queued' AND (account_id = $2 OR (account_id IS NULL AND $2 = $3))
                 RETURNING id`,
                [operationId, itemAccountId, fallbackAccountId]
              );
              if (queuedItems.length > 0) {
                await pool.query(
                  `UPDATE sell_operations SET failed = failed + $1 WHERE id = $2`,
                  [queuedItems.length, operationId]
                );
              }
              // If no other accounts have remaining items, we can break
              const { rows: stillQueued } = await pool.query(
                `SELECT COUNT(*) as cnt FROM sell_operation_items WHERE operation_id = $1 AND status = 'queued'`,
                [operationId]
              );
              if (parseInt(stillQueued[0]?.cnt ?? "0", 10) === 0) break;
            }
          }
        }
      } catch (err: unknown) {
        const errorMsg =
          err instanceof Error ? err.message : "Unexpected error";
        await pool.query(
          `UPDATE sell_operation_items
           SET status = 'failed', error_message = $1, updated_at = NOW()
           WHERE id = $2`,
          [errorMsg, item.id]
        );
        await pool.query(
          `UPDATE sell_operations SET failed = failed + 1 WHERE id = $1`,
          [operationId]
        );
        consecutiveErrors++;
      }

      // Adaptive delay between items (skip delay after the last item)
      if (i < items.length - 1) {
        let delay = BASE_DELAY_MS;
        if (consecutiveErrors >= 2) {
          delay = CONSECUTIVE_ERROR_DELAY_MS;
        } else if (consecutiveErrors === 1) {
          delay = ERROR_DELAY_MS;
        }
        await new Promise((r) => setTimeout(r, delay));
      }
    }

    // Finalize operation
    const { rows: finalOp } = await pool.query(
      `SELECT status FROM sell_operations WHERE id = $1`,
      [operationId]
    );
    if (finalOp[0]?.status !== "cancelled") {
      await pool.query(
        `UPDATE sell_operations SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [operationId]
      );
    }

    // Recalculate cost basis after sell operation
    try {
      await recalculateCostBasis(userId);
    } catch (err) {
      console.error(`[SellOp ${operationId}] Cost basis recalc failed:`, err);
    }
  } finally {
    activeOperations.delete(operationId);
  }
}

/**
 * Get a sell operation with all its items.
 * Returns null if operation not found or doesn't belong to the user.
 */
export async function getOperation(
  operationId: string,
  userId: number
): Promise<SellOperation | null> {
  const { rows: opRows } = await pool.query(
    `SELECT id, user_id, status, total_items, succeeded, failed, created_at, completed_at
     FROM sell_operations
     WHERE id = $1 AND user_id = $2`,
    [operationId, userId]
  );

  if (opRows.length === 0) return null;
  const op = opRows[0];

  const { rows: itemRows } = await pool.query(
    `SELECT id, operation_id, asset_id, market_hash_name, price_cents,
            account_id, status, error_message, requires_confirmation, updated_at
     FROM sell_operation_items
     WHERE operation_id = $1
     ORDER BY id`,
    [operationId]
  );

  const items: SellOperationItem[] = itemRows.map((r) => ({
    id: r.id,
    operationId: r.operation_id,
    assetId: r.asset_id,
    marketHashName: r.market_hash_name,
    priceCents: r.price_cents,
    accountId: r.account_id ?? null,
    status: r.status,
    errorMessage: r.error_message,
    requiresConfirmation: r.requires_confirmation,
    updatedAt: r.updated_at,
  }));

  return {
    id: op.id,
    userId: op.user_id,
    status: op.status,
    totalItems: op.total_items,
    succeeded: op.succeeded,
    failed: op.failed,
    createdAt: op.created_at,
    completedAt: op.completed_at,
    items,
  };
}

/**
 * Cancel a sell operation. Items already listing/listed are not affected;
 * only queued items are set to 'cancelled'.
 */
export async function cancelOperation(
  operationId: string,
  userId: number
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE sell_operations SET status = 'cancelled'
     WHERE id = $1 AND user_id = $2 AND status IN ('pending', 'in_progress')`,
    [operationId, userId]
  );

  if (!rowCount || rowCount === 0) return false;

  // Cancel remaining queued items
  await pool.query(
    `UPDATE sell_operation_items
     SET status = 'cancelled', updated_at = NOW()
     WHERE operation_id = $1 AND status = 'queued'`,
    [operationId]
  );

  return true;
}

/**
 * Get today's sell volume for a user.
 */
export async function getDailyVolume(
  userId: number
): Promise<DailyVolumeInfo> {
  const { rows } = await pool.query(
    `SELECT count FROM sell_volume WHERE user_id = $1 AND day = CURRENT_DATE`,
    [userId]
  );

  const count = rows[0]?.count ?? 0;

  return {
    count,
    limit: DAILY_SELL_LIMIT,
    warningAt: DAILY_SELL_WARNING,
    remaining: Math.max(0, DAILY_SELL_LIMIT - count),
  };
}

/**
 * Increment today's sell volume counter for a user.
 * Uses upsert to handle first-sell-of-day case.
 */
export async function incrementVolume(userId: number): Promise<void> {
  await pool.query(
    `INSERT INTO sell_volume (user_id, day, count)
     VALUES ($1, CURRENT_DATE, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET count = sell_volume.count + 1`,
    [userId]
  );
}
