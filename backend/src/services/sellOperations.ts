import { pool } from "../db/pool.js";
import { log } from "../utils/logger.js";
import { SteamSessionService } from "./steamSession.js";
import { sellItem, quickSellPrice, checkAssetListed, getListedAssetIds } from "./market.js";
import { getWalletCurrency } from "./currency.js";
import { recalculateCostBasis } from "./profitLoss.js";
import { refreshPricesOnDemand } from "./steamHistogram.js";

// ─── Types ───────────────────────────────────────────────────────────────

interface SellOperationItemInput {
  assetId: string;
  marketHashName: string;
  priceCents: number;
  accountId?: number;
  priceCurrencyId?: number;
}

interface SellOperationItem {
  id: number;
  operationId: string;
  assetId: string;
  marketHashName: string | null;
  priceCents: number;
  accountId: number | null;
  status: "queued" | "listing" | "listed" | "failed" | "cancelled" | "uncertain";
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
const DAILY_SELL_LIMIT = 100;
const DAILY_SELL_WARNING = 80;
const MAX_PRICE_MULTIPLIER = 5; // fail if client price > 5x market price

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
): Promise<{ operationId: string; skippedAssetIds: string[] }> {
  // Resolve accountId now so account switches during processing don't affect it
  const resolvedAccountId = accountId ?? await SteamSessionService.getActiveAccountId(userId);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const { rows: opRows } = await client.query(
      `INSERT INTO sell_operations (user_id, total_items, steam_account_id)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [userId, items.length, resolvedAccountId]
    );
    const operationId: string = opRows[0].id;

    // Insert items one-by-one with ON CONFLICT to detect duplicates
    // (partial unique index idx_sell_items_active_asset prevents same asset in multiple active ops)
    const insertedAssetIds = new Set<string>();
    for (const item of items) {
      const { rowCount } = await client.query(
        `INSERT INTO sell_operation_items (operation_id, asset_id, market_hash_name, price_cents, account_id, price_currency_id)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (asset_id) WHERE status NOT IN ('failed', 'cancelled')
         DO NOTHING`,
        [operationId, item.assetId, item.marketHashName, item.priceCents, item.accountId ?? null, item.priceCurrencyId ?? null]
      );
      if (rowCount && rowCount > 0) {
        insertedAssetIds.add(item.assetId);
      }
    }

    const skippedAssetIds = items
      .filter((i) => !insertedAssetIds.has(i.assetId))
      .map((i) => i.assetId);

    // Update total_items to reflect actual inserted count
    if (insertedAssetIds.size !== items.length) {
      await client.query(
        `UPDATE sell_operations SET total_items = $1 WHERE id = $2`,
        [insertedAssetIds.size, operationId]
      );
    }

    await client.query("COMMIT");

    if (skippedAssetIds.length > 0) {
      log.warn("sell_items_skipped", { operationId, skippedCount: skippedAssetIds.length });
    }

    // Only process if there are items to sell
    if (insertedAssetIds.size > 0) {
      // Fire-and-forget but ensure cleanup errors are always caught
      void processOperation(operationId, userId).catch((err) => {
        log.error("sell_op_crashed", { operationId }, err);
        // Synchronous-style cleanup: chain promises so inner errors are caught too
        pool.query(
          `UPDATE sell_operations SET status = 'completed', completed_at = NOW() WHERE id = $1 AND status != 'completed'`,
          [operationId]
        )
          .then(() => pool.query(
            `UPDATE sell_operation_items SET status = 'failed', error_message = $1, updated_at = NOW()
             WHERE operation_id = $2 AND status = 'queued'`,
            [err instanceof Error ? err.message : "Unexpected processing error", operationId]
          ))
          .catch((dbErr) => {
            log.error("sell_op_db_cleanup_failed", { operationId }, dbErr);
          });
      });
    } else {
      // All items skipped — mark operation as completed immediately
      await pool.query(
        `UPDATE sell_operations SET status = 'completed', completed_at = NOW() WHERE id = $1`,
        [operationId]
      );
    }

    return { operationId, skippedAssetIds };
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
  // Atomic lock: only one process can transition pending → in_progress.
  // Prevents race condition when two requests trigger processOperation concurrently.
  const { rowCount: claimed } = await pool.query(
    `UPDATE sell_operations SET status = 'in_progress'
     WHERE id = $1 AND status = 'pending'`,
    [operationId]
  );
  if (!claimed || claimed === 0) return; // already processing or cancelled

  activeOperations.add(operationId);

  try {

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

    // Pre-fetch asset IDs already listed/pending on Steam to skip duplicates
    let alreadyListedIds: Set<string> | null = null;
    try {
      const session = await getSession(fallbackAccountId);
      alreadyListedIds = await getListedAssetIds(session);
      if (alreadyListedIds && alreadyListedIds.size > 0) {
        log.info("sell_pending_listings_found", { operationId, count: alreadyListedIds.size });
      }
    } catch (err) {
      log.warn("sell_pending_listings_check_failed", { operationId }, err);
      // Non-fatal: continue without the check — Steam will reject duplicates anyway
    }

    // Load queued items WITH per-item account_id and currency
    const { rows: items } = await pool.query(
      `SELECT id, asset_id, market_hash_name, price_cents, account_id, price_currency_id
       FROM sell_operation_items
       WHERE operation_id = $1 AND status = 'queued'
       ORDER BY id`,
      [operationId]
    );

    // Pre-fetch prices for items that need quickprice (priceCents=0).
    // Runs histogram calls in parallel across proxy slots — much faster than
    // fetching one-by-one inside the sell loop.
    const needsPrice = items.filter((i) => i.price_cents <= 0 && i.market_hash_name);
    if (needsPrice.length > 0) {
      const uniqueNames = [...new Set(needsPrice.map((i) => i.market_hash_name as string))];
      const walletCurrencyId = await getWalletCurrency(fallbackAccountId) ?? 1;
      try {
        await refreshPricesOnDemand(uniqueNames, walletCurrencyId);
        log.info("sell_prices_prefetched", { operationId, count: uniqueNames.length });
      } catch (err) {
        log.warn("sell_prices_prefetch_failed", { operationId }, err);
        // Non-fatal: quickSellPrice will still work via other fallbacks
      }
    }

    let consecutiveErrors = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      // Check if operation was cancelled (consistent read)
      const { rows: opCheck } = await pool.query(
        `SELECT status FROM sell_operations WHERE id = $1 FOR SHARE`,
        [operationId]
      );
      if (opCheck[0]?.status === "cancelled") break;

      // Update item status to 'listing'
      await pool.query(
        `UPDATE sell_operation_items SET status = 'listing', updated_at = NOW() WHERE id = $1`,
        [item.id]
      );

      const itemAccountId: number = item.account_id ?? fallbackAccountId;

      // Resolve wallet currency for this account
      const walletCurrencyId = await getWalletCurrency(itemAccountId) ?? 1;

      // Auto-resolve quick price when client sends priceCents=0
      let priceCents: number = item.price_cents;
      // priceCurrencyId from client: null/undefined = wallet currency, 1 = USD, etc.
      let priceCurrencyId: number = item.price_currency_id ?? walletCurrencyId;
      let priceFromQuickprice = false;
      if (priceCents <= 0 && item.market_hash_name) {
        const qpResult = await quickSellPrice(item.market_hash_name, walletCurrencyId);
        const qp = qpResult?.sellerReceivesCents ?? null;
        if (qp === null || qp <= 0) {
          await pool.query(
            `UPDATE sell_operation_items
             SET status = 'failed', error_message = 'No market price available', updated_at = NOW()
             WHERE id = $1`,
            [item.id]
          );
          await pool.query(
            `UPDATE sell_operations SET failed = failed + 1 WHERE id = $1`,
            [operationId]
          );
          consecutiveErrors++;
          continue;
        }
        priceCents = qp;
        priceCurrencyId = qpResult!.currencyId;
        priceFromQuickprice = true;
        await pool.query(
          `UPDATE sell_operation_items SET price_cents = $1 WHERE id = $2`,
          [priceCents, item.id]
        );
      }

      // Fix: skip items already listed or pending confirmation on Steam
      if (alreadyListedIds?.has(item.asset_id)) {
        await pool.query(
          `UPDATE sell_operation_items
           SET status = 'failed', error_message = 'Item already has a pending listing on Steam. Confirm or cancel it first.', updated_at = NOW()
           WHERE id = $1`,
          [item.id]
        );
        await pool.query(
          `UPDATE sell_operations SET failed = failed + 1 WHERE id = $1`,
          [operationId]
        );
        log.warn("sell_item_already_listed", { operationId, assetId: item.asset_id });
        continue;
      }

      // Fix: price sanity check — reject if price is absurdly above market.
      // Skip when we just resolved priceCents from quickSellPrice ourselves —
      // the price IS the market price, no point hitting Steam histogram twice.
      if (priceCents > 0 && !priceFromQuickprice && item.market_hash_name) {
        const marketPrice = await quickSellPrice(item.market_hash_name, priceCurrencyId);
        if (marketPrice && marketPrice.sellerReceivesCents > 0) {
          const ratio = priceCents / marketPrice.sellerReceivesCents;
          if (ratio > MAX_PRICE_MULTIPLIER) {
            const msg = `Price is ${ratio.toFixed(1)}x above market. Check your price and retry.`;
            await pool.query(
              `UPDATE sell_operation_items
               SET status = 'failed', error_message = $1, updated_at = NOW()
               WHERE id = $2`,
              [msg, item.id]
            );
            await pool.query(
              `UPDATE sell_operations SET failed = failed + 1 WHERE id = $1`,
              [operationId]
            );
            log.warn("sell_price_too_high", { operationId, assetId: item.asset_id, ratio: ratio.toFixed(1) });
            consecutiveErrors++;
            continue;
          }
        }
      }

      try {
        const session = await getSession(itemAccountId);

        const result = await sellItem(session, item.asset_id, priceCents, itemAccountId, priceCurrencyId);

        if (result.success) {
          // Atomic: update item + operation + volume in one shot
          await pool.query(
            `WITH item_upd AS (
               UPDATE sell_operation_items
               SET status = 'listed', requires_confirmation = $1, updated_at = NOW()
               WHERE id = $2
             ), op_upd AS (
               UPDATE sell_operations SET succeeded = succeeded + 1 WHERE id = $3
             )
             INSERT INTO sell_volume (user_id, day, count)
             VALUES ($4, CURRENT_DATE, 1)
             ON CONFLICT (user_id, day) DO UPDATE SET count = sell_volume.count + 1`,
            [result.requiresConfirmation, item.id, operationId, userId]
          );
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
        const errorMsg = err instanceof Error ? err.message : "Unexpected error";

        // Fix 2: Before marking as "failed", check if Steam actually listed the item
        // (network dropout after Steam accepted = phantom listing)
        let finalStatus: "failed" | "listed" | "uncertain" = "failed";
        try {
          const session = await getSession(itemAccountId);
          const listingCheck = await checkAssetListed(session, item.asset_id);
          if (listingCheck === "listed") {
            finalStatus = "listed";
            log.warn("phantom_listing_detected", { operationId, assetId: item.asset_id });
          } else if (listingCheck === "unknown") {
            finalStatus = "uncertain";
          }
        } catch {
          finalStatus = "uncertain";
        }

        if (finalStatus === "listed") {
          await pool.query(
            `UPDATE sell_operation_items SET status = 'listed', updated_at = NOW() WHERE id = $1`,
            [item.id]
          );
          await pool.query(
            `UPDATE sell_operations SET succeeded = succeeded + 1 WHERE id = $1`,
            [operationId]
          );
          await incrementVolume(userId);
          consecutiveErrors = 0;
        } else {
          await pool.query(
            `UPDATE sell_operation_items SET status = $1, error_message = $2, updated_at = NOW() WHERE id = $3`,
            [finalStatus, errorMsg, item.id]
          );
          await pool.query(
            `UPDATE sell_operations SET failed = failed + 1 WHERE id = $1`,
            [operationId]
          );
          consecutiveErrors++;
        }
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
      log.error("cost_basis_recalc_failed", { operationId }, err);
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

/**
 * Cleanup orphaned sell operations stuck in 'pending' or 'in_progress' after crash.
 * Called once on server startup. Marks them as completed + items as failed.
 */
export async function cleanupOrphanedOperations(): Promise<void> {
  const { rowCount } = await pool.query(
    `UPDATE sell_operations SET status = 'completed', completed_at = NOW()
     WHERE status IN ('pending', 'in_progress')
       AND created_at < NOW() - INTERVAL '15 minutes'`
  );
  if (rowCount && rowCount > 0) {
    await pool.query(
      `UPDATE sell_operation_items SET status = 'failed',
              error_message = 'Server restarted during operation', updated_at = NOW()
       WHERE status IN ('queued', 'listing')
         AND operation_id IN (
           SELECT id FROM sell_operations WHERE status = 'completed' AND completed_at > NOW() - INTERVAL '1 minute'
         )`
    );
    console.log(`[SellOps] Cleaned up ${rowCount} orphaned operations`);
  }
}
