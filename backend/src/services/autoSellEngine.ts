/**
 * autoSellEngine.ts — P3 auto-sell feature.
 *
 * ─── Responsibilities ────────────────────────────────────────────────────
 *   1. Every 15 min, scan all enabled auto_sell_rules
 *   2. For each rule, compare current market price vs trigger
 *   3. If triggered (and cooldown passed), either:
 *      - notify_only: send push immediately, log execution
 *      - auto_list:   create a `pending_window` execution and schedule the
 *                     actual listing 60 seconds later; user can cancel via
 *                     in-app handler or POST /executions/:id/cancel
 *
 * ─── Safety rails (DO NOT RELAX without architect sign-off) ──────────────
 *   - Default mode: notify_only
 *   - 60-second cancel window on every auto_list fire
 *   - MIN_PRICE_MULTIPLIER (0.5) — reject listing if target < 0.5 * current
 *   - MAX_PRICE_MULTIPLIER (5.0) — already in sellOperations.ts
 *   - Rule cooldown (default 6h) — prevents oscillation spam
 *   - Advisory lock (pg_try_advisory_lock) — single concurrent eval cluster-wide
 *
 * ─── Open items (deferred) ───────────────────────────────────────────────
 *   - P3.5 (domain-expert): replace `market_max` with histogram top-of-book
 *   - P9: per-rule float / phase filters, "sell all" mode, lowest-float pick
 *   - DevOps-2: setTimeout(60s) doesn't survive instance shutdown mid-window;
 *     drainOnStartup is the safety net. A real job queue (BullMQ) is a
 *     follow-up for horizontal scaling.
 */

import cron from "node-cron";
import { pool } from "../db/pool.js";
import { log } from "../utils/logger.js";
import { sendPush, isFirebaseReady } from "./firebase.js";
import { createOperation } from "./sellOperations.js";

// ─── Constants ───────────────────────────────────────────────────────────

/** Floor multiplier vs current market — refuse listings below this. */
const MIN_PRICE_MULTIPLIER = 0.5;
/** 60 seconds between fire and actual listing, for user to tap "Undo". */
const CANCEL_WINDOW_MS = 60_000;
/** Default cooldown if rule.cooldown_minutes is somehow NULL (schema has default). */
const DEFAULT_COOLDOWN_MINUTES = 360;
/**
 * Max age for a current_prices row to be considered "live" enough to fire on.
 * Prices come from a 15-min crawler cycle, so 30 min = 2 cycles tolerance.
 * Anything older means the crawler is wedged or the item dropped off the
 * leaderboard — listing on stale data risks selling well below current
 * market (HIGH-3).
 */
const PRICE_FRESHNESS_MAX_AGE_MIN = 30;
/**
 * Mid-window recheck guard: if the market price moves more than this between
 * trigger time and listing time (60s later), abort the listing. Catches
 * pump-and-dump bots and flash crashes that would otherwise let the engine
 * dump at a price 50%+ off the trigger (HIGH-2).
 */
const MID_WINDOW_PRICE_DRIFT_MAX = 0.30;
/**
 * Allowed band for `percent_of_market` strategies. Below 70% means user is
 * intentionally undercutting hard — almost always a typo. Above 99% will be
 * ignored by Steam's rounding anyway. Engine refuses outside this band.
 */
const PERCENT_OF_MARKET_MIN = 70;
const PERCENT_OF_MARKET_MAX = 99;
/**
 * Postgres advisory lock key — chosen as an arbitrary 32-bit int unique
 * to this engine. Prevents two API instances running evaluateRules in
 * parallel (would fire the same rule twice and double-list).
 */
const ADVISORY_LOCK_KEY = 848502;

// ─── Types ───────────────────────────────────────────────────────────────

type TriggerType = "above" | "below";
type SellStrategy = "fixed" | "market_max" | "percent_of_market";
type RuleMode = "notify_only" | "auto_list";

interface AutoSellRule {
  id: number;
  user_id: number;
  account_id: number;
  market_hash_name: string;
  trigger_type: TriggerType;
  trigger_price_usd: number;
  sell_price_usd: number | null;
  sell_strategy: SellStrategy;
  mode: RuleMode;
  enabled: boolean;
  cooldown_minutes: number;
  last_fired_at: string | null;
  times_fired: number;
}

// ─── Entry point ─────────────────────────────────────────────────────────

/**
 * Main cron entry. Scans all enabled rules, evaluates each sequentially.
 * Sequential (not parallel) to keep Steam API pressure predictable.
 *
 * Wrapped in a Postgres advisory lock so multiple API instances sharing a
 * DB never race. If lock is held, the run is skipped — the next 15-min
 * tick will pick it up.
 */
export async function evaluateRules(): Promise<void> {
  const { rows } = await pool.query<{ locked: boolean }>(
    `SELECT pg_try_advisory_lock($1) AS locked`,
    [ADVISORY_LOCK_KEY]
  );
  const locked = rows[0]?.locked === true;
  if (!locked) {
    log.warn("auto_sell_eval_skipped_locked", { lockKey: ADVISORY_LOCK_KEY });
    return;
  }

  try {
    const { rows: ruleRows } = await pool.query<AutoSellRule>(
      `SELECT id, user_id, account_id, market_hash_name, trigger_type,
              trigger_price_usd::float AS trigger_price_usd,
              sell_price_usd::float AS sell_price_usd,
              sell_strategy, mode, enabled, cooldown_minutes,
              last_fired_at, times_fired
         FROM auto_sell_rules
        WHERE enabled = TRUE AND cancelled_at IS NULL`
    );

    if (ruleRows.length === 0) {
      // Still drain expired pending_window rows in case a previous run died
      await drainExpiredCancelWindows();
      return;
    }

    log.info("auto_sell_eval_start", { ruleCount: ruleRows.length });

    let fired = 0;
    let skipped = 0;
    for (const rule of ruleRows) {
      try {
        const didFire = await evaluateRule(rule);
        if (didFire) fired++;
        else skipped++;
      } catch (err) {
        log.error("auto_sell_eval_rule_failed", { ruleId: rule.id }, err);
      }
    }

    log.info("auto_sell_eval_done", { fired, skipped });

    // Also drain any pending cancel-window executions that have expired
    await drainExpiredCancelWindows();
  } finally {
    await pool.query(`SELECT pg_advisory_unlock($1)`, [ADVISORY_LOCK_KEY]);
  }
}

// ─── Single-rule evaluation ──────────────────────────────────────────────

/** Evaluate one rule; returns true if it fired. */
async function evaluateRule(rule: AutoSellRule): Promise<boolean> {
  // Cooldown check — mirrors alertEngine.ts pattern
  if (rule.last_fired_at) {
    const cooldownMs = (rule.cooldown_minutes || DEFAULT_COOLDOWN_MINUTES) * 60_000;
    const lastMs = new Date(rule.last_fired_at).getTime();
    if (Date.now() - lastMs < cooldownMs) return false;
  }

  const currentPrice = await getCurrentMarketPrice(rule.market_hash_name);
  if (currentPrice === null || currentPrice <= 0) {
    // HIGH-3: most likely cause is `current_prices.updated_at` past the
    // freshness window. Skipping is the safe default — better to miss a
    // fire than to fire on stale data.
    log.info("auto_sell_skip_stale_price", {
      ruleId: rule.id,
      marketHashName: rule.market_hash_name,
    });
    return false;
  }

  if (!shouldFire(rule, currentPrice)) return false;

  await fireRule(rule, currentPrice);
  return true;
}

/** Pure trigger predicate — easy to test in isolation. */
export function shouldFire(
  rule: Pick<AutoSellRule, "trigger_type" | "trigger_price_usd">,
  currentPrice: number
): boolean {
  if (rule.trigger_type === "above") return currentPrice >= rule.trigger_price_usd;
  if (rule.trigger_type === "below") return currentPrice <= rule.trigger_price_usd;
  return false;
}

/**
 * Pure pricing function — exported for unit tests.
 * Returns the intended list price for a given rule + current market price.
 */
export function computeIntendedListPrice(
  rule: Pick<AutoSellRule, "sell_strategy" | "sell_price_usd">,
  currentPrice: number
): number | null {
  switch (rule.sell_strategy) {
    case "fixed":
      return rule.sell_price_usd;
    case "market_max":
      // P3.5: replace with histogram-based undercut (top of book - 0.01).
      // For now, undercut current price by 1% — safe default for 80% of items.
      return currentPrice * 0.99;
    case "percent_of_market":
      if (rule.sell_price_usd === null) return null;
      return currentPrice * (rule.sell_price_usd / 100);
    default:
      return null;
  }
}

// ─── Fire ────────────────────────────────────────────────────────────────

async function fireRule(rule: AutoSellRule, currentPrice: number): Promise<void> {
  const intendedListPrice = computeIntendedListPrice(rule, currentPrice);

  // Safety: MIN multiplier guard. If target is <50% of current market,
  // something is wrong (user typo, stale rule after a price crash, etc.) —
  // refuse to list and downgrade this fire to notify_only.
  // NOTE: MAX multiplier already guarded inside sellOperations.processOperation.
  let effectiveMode: RuleMode = rule.mode;
  let refusalReason: string | null = null;

  // HIGH-2: defense-in-depth for percent_of_market. The Zod refine on
  // create/patch enforces 70..99, but a PATCH can flip `sell_strategy`
  // alone and leave a stale `sell_price_usd` from when strategy was
  // 'fixed' (e.g., 14.50 USD interpreted as 14.5%). Engine refuses any
  // out-of-band percentage so pre-validation rules don't list at 14% of
  // market.
  if (
    rule.sell_strategy === "percent_of_market" &&
    (rule.sell_price_usd == null ||
      rule.sell_price_usd < PERCENT_OF_MARKET_MIN ||
      rule.sell_price_usd > PERCENT_OF_MARKET_MAX)
  ) {
    refusalReason = `percent_of_market value ${rule.sell_price_usd ?? "null"} outside allowed band ${PERCENT_OF_MARKET_MIN}..${PERCENT_OF_MARKET_MAX}. Edit the rule.`;
    log.warn("auto_sell_invalid_percent", {
      ruleId: rule.id,
      percent: rule.sell_price_usd,
    });
    effectiveMode = "notify_only";
  } else if (intendedListPrice !== null) {
    const ratio = intendedListPrice / currentPrice;
    if (ratio < MIN_PRICE_MULTIPLIER) {
      refusalReason = `Intended list price $${intendedListPrice.toFixed(2)} is ${(ratio * 100).toFixed(0)}% of market — refusing to auto-list. Review rule.`;
      effectiveMode = "notify_only";
    }
  }

  if (effectiveMode === "notify_only") {
    await insertExecution({
      rule,
      currentPrice,
      intendedListPrice,
      action: "notified",
      cancelWindowMs: 0,
      errorMessage: refusalReason,
    });
    await sendNotifyOnlyPush(rule, currentPrice, intendedListPrice, refusalReason);
    await bumpRuleFiredCounters(rule.id);
    return;
  }

  // auto_list: insert pending_window row, schedule executeListing after 60s.
  const execId = await insertExecution({
    rule,
    currentPrice,
    intendedListPrice,
    action: "pending_window",
    cancelWindowMs: CANCEL_WINDOW_MS,
  });
  await sendCancelWindowPush(rule, currentPrice, intendedListPrice, execId);
  await bumpRuleFiredCounters(rule.id);

  // In-process scheduled follow-up. drainExpiredCancelWindows() is a safety
  // net in case the process restarts before this fires.
  setTimeout(() => {
    executeListing(execId).catch((err) => {
      log.error("auto_sell_execute_listing_failed", { execId }, err);
    });
  }, CANCEL_WINDOW_MS).unref();
}

// ─── Delayed listing execution ───────────────────────────────────────────

/**
 * Called ~60s after a pending_window execution. If the user hasn't cancelled,
 * hands off to existing sellOperations.createOperation which handles the
 * full Steam Market listing flow (incl. MAX multiplier guard, currency
 * conversion, retry/backoff).
 */
export async function executeListing(executionId: number): Promise<void> {
  // Atomic claim: only one worker can transition pending_window → listed.
  const { rows, rowCount } = await pool.query(
    `UPDATE auto_sell_executions
        SET action = 'listed'
      WHERE id = $1 AND action = 'pending_window'
      RETURNING rule_id, market_hash_name, intended_list_price_usd, actual_price_usd`,
    [executionId]
  );
  if (!rowCount || rowCount === 0) {
    // Already cancelled or already listed — nothing to do.
    return;
  }

  const exec = rows[0];

  // Look up rule + its account so we know which Steam session to use.
  const { rows: ruleRows } = await pool.query<AutoSellRule>(
    `SELECT id, user_id, account_id, market_hash_name, mode
       FROM auto_sell_rules WHERE id = $1`,
    [exec.rule_id]
  );
  const rule = ruleRows[0];
  if (!rule) {
    await pool.query(
      `UPDATE auto_sell_executions
          SET action = 'failed', error_message = 'Rule deleted before execution'
        WHERE id = $1`,
      [executionId]
    );
    return;
  }

  // HIGH-2 (D1): mid-window price drift recheck. Between the original
  // trigger and now (60s+), the market may have moved. If it spiked or
  // crashed by more than MID_WINDOW_PRICE_DRIFT_MAX, abort — the user's
  // intent ("list at this market state") no longer matches reality.
  //
  // We compare against the originally intended list price, falling back to
  // the trigger-time market price if a strategy didn't compute one.
  const intendedAtTrigger = (exec.intended_list_price_usd ?? exec.actual_price_usd) as number;
  if (intendedAtTrigger != null && intendedAtTrigger > 0) {
    const recheckPrice = await getCurrentMarketPrice(rule.market_hash_name);
    if (recheckPrice == null) {
      await pool.query(
        `UPDATE auto_sell_executions
            SET action = 'failed', error_message = 'PRICE_UNAVAILABLE_AT_LISTING'
          WHERE id = $1`,
        [executionId]
      );
      log.warn("auto_sell_listing_aborted_no_price", {
        execId: executionId,
        marketHashName: rule.market_hash_name,
      });
      return;
    }
    const drift = Math.abs(recheckPrice - intendedAtTrigger) / recheckPrice;
    if (drift > MID_WINDOW_PRICE_DRIFT_MAX) {
      await pool.query(
        `UPDATE auto_sell_executions
            SET action = 'failed', error_message = 'PRICE_MOVED_DURING_WINDOW'
          WHERE id = $1`,
        [executionId]
      );
      log.warn("auto_sell_listing_aborted_drift", {
        execId: executionId,
        marketHashName: rule.market_hash_name,
        intendedAtTrigger,
        recheckPrice,
        drift: Number(drift.toFixed(3)),
      });
      // UX: tell the user we backed off so they're not surprised by
      // missing executions on a volatile day.
      await sendPriceMoveCancelledPush(
        rule.user_id,
        rule.market_hash_name,
        intendedAtTrigger,
        recheckPrice
      );
      return;
    }
  }

  // Find the actual inventory asset_id to sell. MVP: newest matching copy on
  // the rule's account (largest asset_id). P9 backlog: domain-expert input on
  // float-prefer ordering for rare patterns.
  const { rows: assetRows } = await pool.query(
    `SELECT asset_id, market_hash_name
       FROM inventory_items
      WHERE steam_account_id = $1 AND market_hash_name = $2 AND tradable = TRUE
      ORDER BY asset_id DESC
      LIMIT 1`,
    [rule.account_id, rule.market_hash_name]
  );
  if (assetRows.length === 0) {
    await pool.query(
      `UPDATE auto_sell_executions
          SET action = 'failed', error_message = 'No tradable asset owned at execution time'
        WHERE id = $1`,
      [executionId]
    );
    return;
  }

  const priceCents = Math.round((exec.intended_list_price_usd ?? exec.actual_price_usd) * 100);

  try {
    // Hand off to sellOperations — its MAX_PRICE_MULTIPLIER guard, retry
    // logic, currency conversion, and per-item state machine apply.
    const { operationId } = await createOperation(rule.user_id, [
      {
        assetId: assetRows[0].asset_id,
        marketHashName: assetRows[0].market_hash_name,
        priceCents,
        accountId: rule.account_id,
        priceCurrencyId: 1, // USD — currency.ts converts to wallet at sell time
      },
    ], rule.account_id);

    await pool.query(
      `UPDATE auto_sell_executions
          SET sell_operation_id = $1
        WHERE id = $2`,
      [operationId, executionId]
    );
  } catch (err) {
    await pool.query(
      `UPDATE auto_sell_executions
          SET action = 'failed', error_message = $1
        WHERE id = $2`,
      [err instanceof Error ? err.message : "Unknown listing error", executionId]
    );
  }
}

// ─── Drain (safety net for restarts) ─────────────────────────────────────

/**
 * Find pending_window executions whose 60s window has elapsed, but setTimeout
 * didn't fire (e.g. process restarted between push and execution).
 *
 * Called both from the cron entry point and once at startup via
 * drainOnStartup() to recover from mid-window crashes.
 */
async function drainExpiredCancelWindows(): Promise<void> {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM auto_sell_executions
      WHERE action = 'pending_window'
        AND cancel_window_expires_at < NOW()`
  );
  for (const r of rows) {
    await executeListing(r.id).catch((err) => {
      log.error("auto_sell_drain_failed", { execId: r.id }, err);
    });
  }
}

/**
 * Run once at process boot. Picks up any pending_window executions whose
 * 60s window already elapsed while the previous process was down.
 *
 * Safe to call concurrently with cron — executeListing's atomic UPDATE ...
 * WHERE action = 'pending_window' guarantees only one worker can transition
 * any given row.
 */
export async function drainOnStartup(): Promise<void> {
  log.info("auto_sell_drain_on_startup");
  await drainExpiredCancelWindows();
}

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Get "current" Steam-source price for an item from current_prices.
 * Steam is the canonical source (matches sellOperations.quickSellPrice path).
 *
 * HIGH-3: only return a price if the row was last refreshed within
 * PRICE_FRESHNESS_MAX_AGE_MIN. The crawler runs every ~15min; allowing two
 * cycles of slack catches a wedged crawler without rejecting brief blips.
 * Anything older means we genuinely don't know the price right now and
 * caller (evaluateRule / executeListing) skips this item rather than
 * acting on a snapshot from yesterday.
 */
async function getCurrentMarketPrice(marketHashName: string): Promise<number | null> {
  const { rows } = await pool.query<{ price_usd: number }>(
    `SELECT price_usd::float AS price_usd
       FROM current_prices
      WHERE market_hash_name = $1
        AND source = 'steam'
        AND price_usd > 0
        AND updated_at > NOW() - ($2 || ' minutes')::interval
      LIMIT 1`,
    [marketHashName, String(PRICE_FRESHNESS_MAX_AGE_MIN)]
  );
  return rows[0]?.price_usd ?? null;
}

interface InsertExecutionParams {
  rule: AutoSellRule;
  currentPrice: number;
  intendedListPrice: number | null;
  action: "notified" | "pending_window";
  cancelWindowMs: number;
  errorMessage?: string | null;
}

async function insertExecution(params: InsertExecutionParams): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO auto_sell_executions
       (rule_id, market_hash_name, trigger_price_usd, actual_price_usd,
        intended_list_price_usd, action, cancel_window_expires_at, error_message)
     VALUES ($1, $2, $3, $4, $5, $6, NOW() + ($7 || ' milliseconds')::interval, $8)
     RETURNING id`,
    [
      params.rule.id,
      params.rule.market_hash_name,
      params.rule.trigger_price_usd,
      params.currentPrice,
      params.intendedListPrice,
      params.action,
      String(params.cancelWindowMs),
      params.errorMessage ?? null,
    ]
  );
  return rows[0].id;
}

async function bumpRuleFiredCounters(ruleId: number): Promise<void> {
  await pool.query(
    `UPDATE auto_sell_rules
        SET times_fired = times_fired + 1,
            last_fired_at = NOW()
      WHERE id = $1`,
    [ruleId]
  );
}

// ─── Push helpers ────────────────────────────────────────────────────────

async function sendNotifyOnlyPush(
  rule: AutoSellRule,
  currentPrice: number,
  intendedListPrice: number | null,
  refusalReason: string | null
): Promise<void> {
  if (!isFirebaseReady()) return;
  const tokens = await getUserFcmTokens(rule.user_id);
  if (tokens.length === 0) return;

  const priceLine = intendedListPrice !== null
    ? ` — would list at $${intendedListPrice.toFixed(2)}`
    : "";
  const title = refusalReason ? "Auto-sell rule refused" : "Auto-sell rule fired";
  const body = refusalReason
    ?? `${rule.market_hash_name} is $${currentPrice.toFixed(2)}${priceLine}. Enable auto-list in Settings to execute automatically.`;

  await sendPush(tokens, title, body, {
    type: "auto_sell_notify",
    ruleId: String(rule.id),
    marketHashName: rule.market_hash_name,
  });
}

async function sendCancelWindowPush(
  rule: AutoSellRule,
  currentPrice: number,
  intendedListPrice: number | null,
  executionId: number
): Promise<void> {
  if (!isFirebaseReady()) return;
  const tokens = await getUserFcmTokens(rule.user_id);
  if (tokens.length === 0) return;

  const body = `Listing ${rule.market_hash_name} for $${(intendedListPrice ?? currentPrice).toFixed(2)} in 60 seconds. Tap Undo to cancel.`;

  // Native action categories (UNNotificationCategory / NotificationCompat.Action)
  // are deferred per P3-PLAN §2.4. Users cancel via in-app push handler that
  // calls POST /api/auto-sell/executions/:id/cancel. The `category` field is
  // kept future-compat — when publisher wires native UI, the data payload
  // doesn't need to change.
  //
  // `userId` is included so the Flutter handler can drop pushes that arrived
  // for a different user than the one currently signed in (cold-start
  // edge case after a logout/re-login). Stringified to match FCM data type
  // constraints (everything in the data map must be a string).
  await sendPush(tokens, "Auto-listing in 60s", body, {
    type: "auto_sell_cancel_window",
    userId: String(rule.user_id),
    ruleId: String(rule.id),
    executionId: String(executionId),
    marketHashName: rule.market_hash_name,
    category: "AUTO_SELL_CANCEL",
  });
}

/**
 * HIGH-2 follow-up notification: tell the user we aborted the listing
 * because the market moved more than 30% during the 60s cancel window.
 * Without this, the rule just silently doesn't fire and they wonder why.
 */
async function sendPriceMoveCancelledPush(
  userId: number,
  marketHashName: string,
  intendedPrice: number,
  currentPrice: number
): Promise<void> {
  if (!isFirebaseReady()) return;
  const tokens = await getUserFcmTokens(userId);
  if (tokens.length === 0) return;

  const direction = currentPrice > intendedPrice ? "up" : "down";
  const body =
    `Auto-sell cancelled — ${marketHashName} moved ${direction} ` +
    `from $${intendedPrice.toFixed(2)} to $${currentPrice.toFixed(2)} during the 60s window. ` +
    `Re-arm the rule if you still want to sell.`;
  await sendPush(tokens, "Auto-listing cancelled", body, {
    type: "auto_sell_drift_cancelled",
    userId: String(userId),
    marketHashName,
  });
}

async function getUserFcmTokens(userId: number): Promise<string[]> {
  const { rows } = await pool.query<{ fcm_token: string }>(
    `SELECT fcm_token FROM user_devices WHERE user_id = $1`,
    [userId]
  );
  return rows.map((r) => r.fcm_token);
}

// ─── Cron registration ───────────────────────────────────────────────────

let registered = false;
let scheduledTask: cron.ScheduledTask | null = null;

type HealthReporter = (success: boolean, error?: string) => void;

/**
 * Register the every-15-min cron job. Called from priceJob.startPriceJobs().
 * Idempotent — safe to invoke multiple times.
 *
 * @param onRun Optional callback invoked after every cron tick with success
 *              status. priceJob injects its job-health recorder so the run
 *              shows up in `/api/admin/job-health`. We can't import priceJob
 *              here (circular: priceJob -> engine -> priceJob).
 */
export function registerAutoSellCron(onRun?: HealthReporter): void {
  if (registered) return;
  registered = true;
  scheduledTask = cron.schedule("*/15 * * * *", async () => {
    try {
      await evaluateRules();
      onRun?.(true);
    } catch (err) {
      log.error("auto_sell_cron_failed", {}, err);
      onRun?.(false, err instanceof Error ? err.message : String(err));
    }
  });
  log.info("auto_sell_cron_registered", { schedule: "*/15 * * * *" });
}

/** Stop the cron task — called from stopAllJobs() during graceful shutdown. */
export function stopAutoSellCron(): void {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  registered = false;
}
