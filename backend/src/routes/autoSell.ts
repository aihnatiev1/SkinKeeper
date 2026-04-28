/**
 * autoSell.ts — P3 auto-sell feature routes.
 *
 * ─── Endpoints ───────────────────────────────────────────────────────────
 *   POST   /rules                       Create rule (PREMIUM)
 *   GET    /rules                       List current user's rules
 *   PATCH  /rules/:id                   Toggle enabled / change mode (PREMIUM)
 *   DELETE /rules/:id                   Soft-delete rule (open to lapsed)
 *   GET    /executions                  History; filters: rule_id, limit
 *   POST   /executions/:id/cancel       Cancel during 60s window
 *
 * ─── Premium gating policy (P3-PLAN §2.5) ────────────────────────────────
 *   - POST + PATCH require active premium — lapsed users can't create or
 *     modify rules.
 *   - GET + DELETE intentionally open so lapsed users can still see and
 *     clean up their rules without being held hostage.
 *
 * ─── Limit ───────────────────────────────────────────────────────────────
 *   MAX_RULES_PER_USER_PREMIUM = 10 (matches P1/P2 scaling pattern).
 */

import { Router, Response } from "express";
import { z } from "zod";
import { pool } from "../db/pool.js";
import {
  authMiddleware,
  requirePremium,
  requireFeatureFlag,
  AuthRequest,
} from "../middleware/auth.js";
import { validateBody, validateQuery } from "../middleware/validate.js";

const router = Router();

// ─── Schemas ─────────────────────────────────────────────────────────────

// HIGH-2 (D2): percent_of_market band. Anything below 70 is almost
// certainly a typo (1.5 USD becoming 1.5% of market = pennies). Above 99
// is meaningless because Steam rounds. Engine has its own defense-in-depth
// check on top of this — see autoSellEngine.fireRule.
const PERCENT_OF_MARKET_MIN = 70;
const PERCENT_OF_MARKET_MAX = 99;

const createRuleSchema = z
  .object({
    account_id: z.number().int().positive(),
    market_hash_name: z.string().min(1).max(255),
    trigger_type: z.enum(["above", "below"]),
    trigger_price_usd: z.number().positive().max(100_000),
    sell_price_usd: z.number().positive().max(100_000).optional(),
    sell_strategy: z.enum(["fixed", "market_max", "percent_of_market"]).default("fixed"),
    mode: z.enum(["notify_only", "auto_list"]).default("notify_only"),
    cooldown_minutes: z.number().int().min(15).max(10_080).default(360), // 15m..7d
  })
  .refine(
    (v) => {
      if (v.sell_strategy !== "percent_of_market") return true;
      return (
        v.sell_price_usd != null &&
        v.sell_price_usd >= PERCENT_OF_MARKET_MIN &&
        v.sell_price_usd <= PERCENT_OF_MARKET_MAX
      );
    },
    {
      message: `percent_of_market requires sell_price_usd between ${PERCENT_OF_MARKET_MIN} and ${PERCENT_OF_MARKET_MAX}`,
      path: ["sell_price_usd"],
    }
  );

const patchRuleSchema = z
  .object({
    enabled: z.boolean().optional(),
    mode: z.enum(["notify_only", "auto_list"]).optional(),
    trigger_price_usd: z.number().positive().max(100_000).optional(),
    sell_price_usd: z.number().positive().max(100_000).nullable().optional(),
    sell_strategy: z.enum(["fixed", "market_max", "percent_of_market"]).optional(),
    cooldown_minutes: z.number().int().min(15).max(10_080).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "At least one field required" })
  // PATCH validates the band only when the caller is explicitly supplying
  // both fields. A PATCH that flips strategy alone (without resending
  // sell_price_usd) cannot validate against an unknown stored value — the
  // engine-side guard in fireRule covers that path.
  .refine(
    (v) => {
      if (v.sell_strategy !== "percent_of_market") return true;
      if (v.sell_price_usd == null) return true;
      return (
        v.sell_price_usd >= PERCENT_OF_MARKET_MIN &&
        v.sell_price_usd <= PERCENT_OF_MARKET_MAX
      );
    },
    {
      message: `percent_of_market requires sell_price_usd between ${PERCENT_OF_MARKET_MIN} and ${PERCENT_OF_MARKET_MAX}`,
      path: ["sell_price_usd"],
    }
  );

const listExecutionsQuerySchema = z.object({
  rule_id: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// Stats period — default 30d, capped at 1y. The 1y query is heavier (more
// rows + GROUP BY DATE) so we don't make it the default. Clients pick from
// {7, 30, 90, 365} via chips but anything in [1, 365] is accepted.
const statsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

// ─── Premium limits ──────────────────────────────────────────────────────

const MAX_RULES_PER_USER_PREMIUM = 10;

/**
 * Defense-in-depth: even though `patchRuleSchema` already validates shape,
 * the dynamic UPDATE construction below should NEVER interpolate column
 * names that didn't make it through this allowlist. New mutable columns
 * must be added here AND to the Zod schema.
 */
const ALLOWED_PATCH_COLUMNS: ReadonlySet<string> = new Set([
  "enabled",
  "mode",
  "trigger_price_usd",
  "sell_price_usd",
  "sell_strategy",
  "cooldown_minutes",
]);

// ─── Routes ──────────────────────────────────────────────────────────────

/**
 * POST /api/auto-sell/rules — create rule (PREMIUM + feature flag).
 *
 * P0-2: gated behind the `auto_sell` feature flag so we can kill-switch
 * rule creation during a misbehaving rollout. DELETE and cancel are
 * intentionally NOT gated — if we kill-switch the feature, users must
 * still be able to clean up rules they created and cancel any in-flight
 * pending_window listings.
 */
router.post(
  "/rules",
  authMiddleware,
  requirePremium,
  requireFeatureFlag("auto_sell"),
  validateBody(createRuleSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const body = req.body as z.infer<typeof createRuleSchema>;

      // Verify the account belongs to the user — critical to prevent IDOR.
      const { rows: acct } = await pool.query(
        `SELECT id FROM steam_accounts WHERE id = $1 AND user_id = $2`,
        [body.account_id, req.userId]
      );
      if (acct.length === 0) {
        res.status(404).json({ error: "Account not found or not yours" });
        return;
      }

      // Enforce limit
      const { rows: countRows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM auto_sell_rules
          WHERE user_id = $1 AND cancelled_at IS NULL`,
        [req.userId]
      );
      if (countRows[0].cnt >= MAX_RULES_PER_USER_PREMIUM) {
        res.status(400).json({
          error: `Maximum ${MAX_RULES_PER_USER_PREMIUM} auto-sell rules reached`,
        });
        return;
      }

      // strategy=fixed requires sell_price_usd. Enforced by DB check, but
      // reject early for a better error message.
      if (body.sell_strategy === "fixed" && body.sell_price_usd == null) {
        res.status(400).json({ error: "sell_price_usd required when sell_strategy=fixed" });
        return;
      }

      const { rows } = await pool.query(
        `INSERT INTO auto_sell_rules
           (user_id, account_id, market_hash_name, trigger_type,
            trigger_price_usd, sell_price_usd, sell_strategy, mode, cooldown_minutes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, user_id, account_id, market_hash_name, trigger_type,
                   trigger_price_usd::float, sell_price_usd::float, sell_strategy,
                   mode, enabled, cooldown_minutes, created_at, last_fired_at, times_fired`,
        [
          req.userId,
          body.account_id,
          body.market_hash_name,
          body.trigger_type,
          body.trigger_price_usd,
          body.sell_price_usd ?? null,
          body.sell_strategy,
          body.mode,
          body.cooldown_minutes,
        ]
      );

      res.status(201).json(rows[0]);
    } catch (err) {
      console.error("Auto-sell rule create error:", err);
      res.status(500).json({ error: "Failed to create auto-sell rule" });
    }
  }
);

/** GET /api/auto-sell/rules — list current user's rules. */
router.get(
  "/rules",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT id, account_id, market_hash_name, trigger_type,
                trigger_price_usd::float, sell_price_usd::float, sell_strategy,
                mode, enabled, cooldown_minutes, created_at, last_fired_at, times_fired
           FROM auto_sell_rules
          WHERE user_id = $1 AND cancelled_at IS NULL
          ORDER BY created_at DESC`,
        [req.userId]
      );
      res.json({ rules: rows });
    } catch (err) {
      console.error("Auto-sell rules fetch error:", err);
      res.status(500).json({ error: "Failed to fetch auto-sell rules" });
    }
  }
);

/**
 * PATCH /api/auto-sell/rules/:id — toggle enabled / change mode / tweak
 * prices (PREMIUM + feature flag). Same gating rationale as POST: kill-
 * switch must stop new behaviors; DELETE stays open for cleanup.
 */
router.patch(
  "/rules/:id",
  authMiddleware,
  requirePremium,
  requireFeatureFlag("auto_sell"),
  validateBody(patchRuleSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "Invalid rule id" });
        return;
      }
      const body = req.body as z.infer<typeof patchRuleSchema>;

      // Build dynamic UPDATE. Allowlist guards against injection even though
      // Zod already validated shape — column names in SQL string MUST come
      // from a closed set. New mutable cols → add to ALLOWED_PATCH_COLUMNS.
      const set: string[] = [];
      const vals: unknown[] = [];
      let i = 1;
      for (const [col, val] of Object.entries(body)) {
        if (val === undefined) continue;
        if (!ALLOWED_PATCH_COLUMNS.has(col)) continue;
        set.push(`${col} = $${i++}`);
        vals.push(val);
      }
      if (set.length === 0) {
        res.status(400).json({ error: "No fields to update" });
        return;
      }
      vals.push(id, req.userId);

      const { rows, rowCount } = await pool.query(
        `UPDATE auto_sell_rules
            SET ${set.join(", ")}
          WHERE id = $${i++} AND user_id = $${i}
          RETURNING id, account_id, market_hash_name, trigger_type,
                    trigger_price_usd::float, sell_price_usd::float, sell_strategy,
                    mode, enabled, cooldown_minutes, created_at, last_fired_at, times_fired`,
        vals
      );
      if (!rowCount || rowCount === 0) {
        res.status(404).json({ error: "Rule not found" });
        return;
      }
      res.json(rows[0]);
    } catch (err) {
      console.error("Auto-sell rule patch error:", err);
      res.status(500).json({ error: "Failed to update auto-sell rule" });
    }
  }
);

/** DELETE /api/auto-sell/rules/:id */
router.delete(
  "/rules/:id",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "Invalid rule id" });
        return;
      }
      // Soft-delete via cancelled_at to preserve execution history integrity.
      // Hard-delete would CASCADE auto_sell_executions — probably undesirable
      // for audit. Confirm with architect.
      const { rowCount } = await pool.query(
        `UPDATE auto_sell_rules
            SET enabled = FALSE, cancelled_at = NOW()
          WHERE id = $1 AND user_id = $2 AND cancelled_at IS NULL`,
        [id, req.userId]
      );
      if (!rowCount || rowCount === 0) {
        res.status(404).json({ error: "Rule not found" });
        return;
      }
      res.status(204).end();
    } catch (err) {
      console.error("Auto-sell rule delete error:", err);
      res.status(500).json({ error: "Failed to delete auto-sell rule" });
    }
  }
);

/** GET /api/auto-sell/executions?rule_id=&limit= — execution history. */
router.get(
  "/executions",
  authMiddleware,
  validateQuery(listExecutionsQuerySchema),
  async (req: AuthRequest, res: Response) => {
    try {
      const q = req.query as unknown as z.infer<typeof listExecutionsQuerySchema>;

      // Join through rules to scope by user.
      const params: unknown[] = [req.userId];
      let where = `r.user_id = $1`;
      if (q.rule_id) {
        params.push(q.rule_id);
        where += ` AND e.rule_id = $${params.length}`;
      }
      params.push(q.limit);
      const limitIdx = params.length;

      const { rows } = await pool.query(
        `SELECT e.id, e.rule_id, e.fired_at, e.market_hash_name,
                e.trigger_price_usd::float, e.actual_price_usd::float,
                e.intended_list_price_usd::float, e.action,
                e.sell_operation_id, e.listing_id, e.error_message,
                e.cancel_window_expires_at
           FROM auto_sell_executions e
           JOIN auto_sell_rules r ON r.id = e.rule_id
          WHERE ${where}
          ORDER BY e.fired_at DESC
          LIMIT $${limitIdx}`,
        params
      );
      res.json({ executions: rows });
    } catch (err) {
      console.error("Auto-sell executions fetch error:", err);
      res.status(500).json({ error: "Failed to fetch executions" });
    }
  }
);

/**
 * GET /api/auto-sell/stats?days=N — user dashboard aggregates.
 *
 * Drives the in-app "auto-sell dashboard" screen (P11). PREMIUM-gated so
 * the dashboard is only visible to active PRO subscribers — same gating as
 * rule mutations. Lapsed users hit 403 and the screen falls back to the
 * paywall via the standard PremiumGate plumbing.
 *
 * Returns two payloads in one round-trip:
 *   - `stats`: scalar counters and totals across the period.
 *   - `history`: per-day fire counts for the chart. Sparse — we only emit
 *     rows for days that actually had fires, so the client must fill gaps
 *     when plotting (avoids dragging a full N-row payload across the wire
 *     for users with sparse rule activity).
 *
 * NOT gated by `requireFeatureFlag('auto_sell')`: if we kill-switch the
 * engine the dashboard should still show "your last 30 days of activity"
 * — same rationale as DELETE /rules/:id staying open during a kill.
 */
router.get(
  "/stats",
  authMiddleware,
  requirePremium,
  validateQuery(statsQuerySchema),
  async (req: AuthRequest, res: Response) => {
    try {
      // Express 5 makes req.query a getter that doesn't accept the merged
      // data from validateQuery cleanly — the raw string survives. Re-parse
      // here so `days` is a true number for arithmetic + JSON output. Zod
      // already validated the bounds in middleware.
      const parsed = statsQuerySchema.safeParse(req.query);
      const days = parsed.success ? parsed.data.days : 30;

      // Single round-trip aggregate. The CTE scopes by the active user's
      // rules so this is IDOR-safe — `auto_sell_rules.user_id` is the only
      // ownership boundary. We bind `days` as a parameter and multiply by
      // INTERVAL '1 day' in SQL so the planner can still use the
      // `(rule_id, fired_at DESC)` index.
      const { rows: stats } = await pool.query(
        `WITH e AS (
           SELECT ae.action, ae.error_message, ae.actual_price_usd,
                  ae.intended_list_price_usd, ae.trigger_price_usd
             FROM auto_sell_executions ae
             JOIN auto_sell_rules ar ON ae.rule_id = ar.id
            WHERE ar.user_id = $1
              AND ae.fired_at > NOW() - ($2 || ' days')::INTERVAL
         )
         SELECT
           (SELECT COUNT(*)::int FROM auto_sell_rules
              WHERE user_id = $1 AND cancelled_at IS NULL) AS active_rules,
           (SELECT COUNT(*)::int FROM auto_sell_rules
              WHERE user_id = $1 AND mode = 'auto_list' AND cancelled_at IS NULL) AS auto_list_rules,
           (SELECT COUNT(*)::int FROM e) AS total_fires,
           (SELECT COUNT(*)::int FROM e WHERE action = 'listed') AS listed_count,
           (SELECT COUNT(*)::int FROM e WHERE action = 'cancelled') AS cancelled_count,
           (SELECT COUNT(*)::int FROM e WHERE action = 'failed') AS failed_count,
           (SELECT COUNT(*)::int FROM e WHERE action = 'notified') AS notified_count,
           (SELECT COALESCE(SUM(intended_list_price_usd), 0)::float
              FROM e WHERE action = 'listed' AND intended_list_price_usd IS NOT NULL) AS total_listed_value_usd,
           (SELECT COALESCE(AVG(intended_list_price_usd - trigger_price_usd), 0)::float
              FROM e
             WHERE action = 'listed'
               AND intended_list_price_usd IS NOT NULL
               AND intended_list_price_usd > 0
               AND trigger_price_usd > 0) AS avg_premium_over_trigger,
           (SELECT json_agg(json_build_object('reason', reason, 'count', cnt) ORDER BY cnt DESC)
              FROM (
                SELECT COALESCE(error_message, 'unknown') AS reason, COUNT(*)::int AS cnt
                  FROM e
                 WHERE (action = 'failed' OR action = 'notified')
                   AND error_message IS NOT NULL
              GROUP BY error_message
              ORDER BY cnt DESC
                 LIMIT 5
              ) refs) AS top_refusal_reasons`,
        [req.userId, String(days)]
      );

      const { rows: history } = await pool.query(
        `SELECT TO_CHAR(DATE(ae.fired_at), 'YYYY-MM-DD') AS date,
                COUNT(*)::int AS fires,
                COUNT(*) FILTER (WHERE ae.action = 'listed')::int AS listed,
                COALESCE(SUM(ae.intended_list_price_usd) FILTER (WHERE ae.action = 'listed'), 0)::float AS listed_value
           FROM auto_sell_executions ae
           JOIN auto_sell_rules ar ON ae.rule_id = ar.id
          WHERE ar.user_id = $1
            AND ae.fired_at > NOW() - ($2 || ' days')::INTERVAL
       GROUP BY DATE(ae.fired_at)
       ORDER BY DATE(ae.fired_at) ASC`,
        [req.userId, String(days)]
      );

      const row = stats[0] ?? {};
      res.json({
        stats: {
          active_rules: row.active_rules ?? 0,
          auto_list_rules: row.auto_list_rules ?? 0,
          total_fires: row.total_fires ?? 0,
          listed_count: row.listed_count ?? 0,
          cancelled_count: row.cancelled_count ?? 0,
          failed_count: row.failed_count ?? 0,
          notified_count: row.notified_count ?? 0,
          total_listed_value_usd: row.total_listed_value_usd ?? 0,
          avg_premium_over_trigger: row.avg_premium_over_trigger ?? 0,
          top_refusal_reasons: row.top_refusal_reasons ?? [],
        },
        history,
        period_days: days,
      });
    } catch (err) {
      console.error("Auto-sell stats error:", err);
      res.status(500).json({ error: "Failed to fetch auto-sell stats" });
    }
  }
);

/**
 * POST /api/auto-sell/executions/:id/cancel — cancel during 60s window.
 *
 * Called by the push "Undo" action handler or manually from the in-app
 * notification center. Atomic: only transitions pending_window → cancelled;
 * no-op for any other state.
 */
router.post(
  "/executions/:id/cancel",
  authMiddleware,
  async (req: AuthRequest, res: Response) => {
    try {
      const id = parseInt(req.params.id as string, 10);
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: "Invalid execution id" });
        return;
      }

      const { rowCount } = await pool.query(
        `UPDATE auto_sell_executions e
            SET action = 'cancelled'
           FROM auto_sell_rules r
          WHERE e.id = $1
            AND r.id = e.rule_id
            AND r.user_id = $2
            AND e.action = 'pending_window'
            AND e.cancel_window_expires_at > NOW()`,
        [id, req.userId]
      );

      if (!rowCount || rowCount === 0) {
        res.status(409).json({
          error: "Execution cannot be cancelled — window expired, already cancelled, or not yours",
        });
        return;
      }
      res.status(204).end();
    } catch (err) {
      console.error("Auto-sell execution cancel error:", err);
      res.status(500).json({ error: "Failed to cancel execution" });
    }
  }
);

export default router;
