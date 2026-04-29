import { pool } from "../db/pool.js";

// ---- Cost Basis ----

/** Recalculate cost basis for all items of a user from transactions.
 *  Groups by (market_hash_name, steam_account_id) for accurate per-account P&L.
 *  If accountId is provided, recalculates only for that steam_account. */
export async function recalculateCostBasis(userId: number, accountId?: number): Promise<void> {
  // Build parameterized account filter
  const params: (number)[] = [userId];
  const accountFilter = accountId
    ? `AND steam_account_id = $${params.push(accountId)}`
    : "";

  await pool.query(
    `
    WITH buy_agg AS (
      SELECT market_hash_name, steam_account_id,
             COUNT(*)::int AS qty,
             SUM(price_cents)::bigint AS total
      FROM transactions
      WHERE user_id = $1 AND type = 'buy' AND refunded_at IS NULL ${accountFilter}
      GROUP BY market_hash_name, steam_account_id
    ),
    sell_agg AS (
      SELECT market_hash_name, steam_account_id,
             COUNT(*)::int AS qty,
             SUM(price_cents)::bigint AS total
      FROM transactions
      WHERE user_id = $1 AND type = 'sell' AND refunded_at IS NULL ${accountFilter}
      GROUP BY market_hash_name, steam_account_id
    ),
    combined AS (
      SELECT
        COALESCE(b.market_hash_name, s.market_hash_name) AS market_hash_name,
        COALESCE(b.steam_account_id, s.steam_account_id) AS steam_account_id,
        COALESCE(b.qty, 0) AS qty_bought,
        COALESCE(b.total, 0) AS total_spent,
        COALESCE(s.qty, 0) AS qty_sold,
        COALESCE(s.total, 0) AS total_earned,
        GREATEST(COALESCE(b.qty, 0) - COALESCE(s.qty, 0), 0) AS current_holding,
        CASE WHEN COALESCE(b.qty, 0) > 0
          THEN (COALESCE(b.total, 0) / COALESCE(b.qty, 1))
          ELSE 0
        END AS avg_buy_price,
        COALESCE(s.total, 0) - (
          CASE WHEN COALESCE(b.qty, 0) > 0
            THEN (COALESCE(b.total, 0) * COALESCE(s.qty, 0) / COALESCE(b.qty, 1))::bigint
            ELSE 0
          END
        ) AS realized_profit
      FROM buy_agg b
      FULL OUTER JOIN sell_agg s
        ON b.market_hash_name = s.market_hash_name
       -- NULL-safe: manual transactions have steam_account_id=NULL, and a
       -- regular USING (or =) treats NULL=NULL as NULL, splitting buy and
       -- sell aggregates into two combined rows that both collide on the
       -- (user_id, COALESCE(account,0), name) unique index → "ON CONFLICT
       -- DO UPDATE command cannot affect row a second time" (21000).
       AND b.steam_account_id IS NOT DISTINCT FROM s.steam_account_id
    )
    INSERT INTO item_cost_basis (user_id, market_hash_name, steam_account_id,
      avg_buy_price_cents, total_quantity_bought, total_spent_cents,
      total_quantity_sold, total_earned_cents, current_holding,
      realized_profit_cents, updated_at)
    SELECT $1, market_hash_name, steam_account_id, avg_buy_price, qty_bought,
      total_spent, qty_sold, total_earned, current_holding, realized_profit, NOW()
    FROM combined
    ON CONFLICT (user_id, COALESCE(steam_account_id, 0), market_hash_name) DO UPDATE SET
      avg_buy_price_cents = EXCLUDED.avg_buy_price_cents,
      total_quantity_bought = EXCLUDED.total_quantity_bought,
      total_spent_cents = EXCLUDED.total_spent_cents,
      total_quantity_sold = EXCLUDED.total_quantity_sold,
      total_earned_cents = EXCLUDED.total_earned_cents,
      current_holding = EXCLUDED.current_holding,
      realized_profit_cents = EXCLUDED.realized_profit_cents,
      updated_at = NOW()
    `,
    params
  );
}

// ---- Portfolio P/L Summary ----

export interface PortfolioPL {
  totalInvestedCents: number;
  totalEarnedCents: number;
  realizedProfitCents: number;
  unrealizedProfitCents: number;
  totalProfitCents: number;
  totalProfitPct: number;
  holdingCount: number;
  totalCurrentValueCents: number;
}

export async function getPortfolioPL(userId: number, accountId?: number, portfolioId?: number): Promise<PortfolioPL> {
  // If accountId or portfolioId is provided, compute P/L directly from transactions
  // Otherwise use the global item_cost_basis table

  // When filtering by account or portfolio, we recompute from transactions directly
  // (item_cost_basis is global; per-account/per-portfolio P/L must aggregate transactions)
  if (accountId || portfolioId) {
    const params: unknown[] = [userId];
    let accountCond = "";
    if (accountId) {
      params.push(accountId);
      accountCond = `AND steam_account_id = $${params.length}`;
    }
    let portfolioCond = "";
    if (portfolioId) {
      params.push(portfolioId);
      portfolioCond = `AND portfolio_id = $${params.length}`;
    }

    const txRes = await pool.query(
      `
      WITH buy_agg AS (
        SELECT market_hash_name,
               COUNT(*)::int AS qty,
               SUM(price_cents)::bigint AS total
        FROM transactions
        WHERE user_id = $1 AND type = 'buy' AND refunded_at IS NULL ${accountCond} ${portfolioCond}
        GROUP BY market_hash_name
      ),
      sell_agg AS (
        SELECT market_hash_name,
               COUNT(*)::int AS qty,
               SUM(price_cents)::bigint AS total
        FROM transactions
        WHERE user_id = $1 AND type = 'sell' AND refunded_at IS NULL ${accountCond} ${portfolioCond}
        GROUP BY market_hash_name
      ),
      combined AS (
        SELECT
          COALESCE(b.market_hash_name, s.market_hash_name) AS market_hash_name,
          COALESCE(b.qty, 0) AS qty_bought,
          COALESCE(b.total, 0) AS total_spent,
          COALESCE(s.qty, 0) AS qty_sold,
          COALESCE(s.total, 0) AS total_earned,
          GREATEST(COALESCE(b.qty, 0) - COALESCE(s.qty, 0), 0) AS current_holding,
          CASE WHEN COALESCE(b.qty, 0) > 0
            THEN (COALESCE(b.total, 0) / COALESCE(b.qty, 1))
            ELSE 0
          END AS avg_buy_price,
          COALESCE(s.total, 0) - (
            CASE WHEN COALESCE(b.qty, 0) > 0
              THEN (COALESCE(b.total, 0) * COALESCE(s.qty, 0) / COALESCE(b.qty, 1))::bigint
              ELSE 0
            END
          ) AS realized_profit
        FROM buy_agg b
        FULL OUTER JOIN sell_agg s USING (market_hash_name)
      )
      SELECT
        COALESCE(SUM(total_spent), 0)::int AS total_invested,
        COALESCE(SUM(total_earned), 0)::int AS total_earned,
        COALESCE(SUM(realized_profit), 0)::int AS realized_profit,
        COALESCE(SUM(CASE WHEN current_holding > 0 THEN avg_buy_price * current_holding ELSE 0 END), 0)::int AS holding_cost,
        COUNT(CASE WHEN current_holding > 0 THEN 1 END)::int AS holding_count,
        json_agg(json_build_object('name', market_hash_name, 'holding', current_holding)) FILTER (WHERE current_holding > 0) AS holdings
      FROM combined
      `,
      params
    );

    const basis = txRes.rows[0];
    const holdings: Array<{ name: string; holding: number }> = basis.holdings || [];

    // Get current value for holdings
    let currentValue = 0;
    if (holdings.length > 0) {
      const names = holdings.map((h) => h.name);
      const priceRes = await pool.query(
        `SELECT cp.market_hash_name, cp.price_usd
         FROM current_prices cp
         WHERE cp.market_hash_name = ANY($1::text[])
           AND cp.price_usd > 0
           AND cp.source = 'steam'`,
        [names]
      );
      const priceMap = new Map(priceRes.rows.map((r: any) => [r.market_hash_name, parseFloat(r.price_usd)]));
      for (const h of holdings) {
        const price = priceMap.get(h.name) || 0;
        currentValue += Math.round(price * 100) * h.holding;
      }
    }

    const holdingCost = basis.holding_cost || 0;
    const unrealizedProfit = currentValue - holdingCost;
    const totalProfit = (basis.realized_profit || 0) + unrealizedProfit;
    const totalInvested = basis.total_invested || 0;

    return {
      totalInvestedCents: totalInvested,
      totalEarnedCents: basis.total_earned || 0,
      realizedProfitCents: basis.realized_profit || 0,
      unrealizedProfitCents: unrealizedProfit,
      totalProfitCents: totalProfit,
      totalProfitPct: totalInvested > 0 ? Math.round((totalProfit / totalInvested) * 10000) / 100 : 0,
      holdingCount: basis.holding_count || 0,
      totalCurrentValueCents: currentValue,
    };
  }

  // Global (all accounts) — use item_cost_basis
  const basisRes = await pool.query(
    `
    SELECT
      COALESCE(SUM(total_spent_cents), 0)::int AS total_invested,
      COALESCE(SUM(total_earned_cents), 0)::int AS total_earned,
      COALESCE(SUM(realized_profit_cents), 0)::int AS realized_profit,
      COALESCE(SUM(CASE WHEN current_holding > 0 THEN avg_buy_price_cents * current_holding ELSE 0 END), 0)::int AS holding_cost,
      COUNT(CASE WHEN current_holding > 0 THEN 1 END)::int AS holding_count
    FROM item_cost_basis
    WHERE user_id = $1
    `,
    [userId]
  );

  const basis = basisRes.rows[0];

  if (!basis) {
    return {
      totalInvestedCents: 0,
      totalEarnedCents: 0,
      realizedProfitCents: 0,
      unrealizedProfitCents: 0,
      totalProfitCents: 0,
      totalProfitPct: 0,
      holdingCount: 0,
      totalCurrentValueCents: 0,
    };
  }

  // Get current value of holdings using LATERAL for fast index lookups
  const holdingsRes = await pool.query(
    `
    WITH holdings AS (
      SELECT market_hash_name, current_holding, avg_buy_price_cents
      FROM item_cost_basis
      WHERE user_id = $1 AND current_holding > 0
    )
    SELECT
      COALESCE(SUM((cp.price_usd * 100)::bigint * h.current_holding), 0)::int AS current_value
    FROM holdings h
    LEFT JOIN current_prices cp
      ON cp.market_hash_name = h.market_hash_name
      AND cp.source = 'steam'
      AND cp.price_usd > 0
    `,
    [userId]
  );

  const currentValue = holdingsRes.rows[0]?.current_value || 0;
  const holdingCost = basis.holding_cost || 0;
  const unrealizedProfit = currentValue - holdingCost;
  const totalProfit = (basis.realized_profit || 0) + unrealizedProfit;
  const totalInvested = basis.total_invested || 0;

  return {
    totalInvestedCents: totalInvested,
    totalEarnedCents: basis.total_earned || 0,
    realizedProfitCents: basis.realized_profit || 0,
    unrealizedProfitCents: unrealizedProfit,
    totalProfitCents: totalProfit,
    totalProfitPct: totalInvested > 0 ? Math.round((totalProfit / totalInvested) * 10000) / 100 : 0,
    holdingCount: basis.holding_count || 0,
    totalCurrentValueCents: currentValue,
  };
}

// ---- Per-Account P/L Breakdown (PREMIUM) ----

export interface AccountPL {
  accountId: number;
  steamId: string;
  displayName: string;
  avatarUrl: string | null;
  pl: PortfolioPL;
}

export async function getPortfolioPLByAccount(userId: number): Promise<AccountPL[]> {
  const { rows: accounts } = await pool.query(
    `SELECT id, steam_id, display_name, avatar_url FROM active_steam_accounts WHERE user_id = $1 ORDER BY id`,
    [userId]
  );

  const results: AccountPL[] = [];
  for (const acc of accounts) {
    const pl = await getPortfolioPL(userId, acc.id);
    // Only include accounts that have transaction data
    if (pl.totalInvestedCents > 0 || pl.totalEarnedCents > 0 || pl.holdingCount > 0) {
      results.push({
        accountId: acc.id,
        steamId: acc.steam_id,
        displayName: acc.display_name,
        avatarUrl: acc.avatar_url,
        pl,
      });
    }
  }

  return results;
}

// ---- Per-Item P/L (PREMIUM) ----

export interface ItemPL {
  marketHashName: string;
  avgBuyPriceCents: number;
  totalQuantityBought: number;
  totalSpentCents: number;
  totalQuantitySold: number;
  totalEarnedCents: number;
  currentHolding: number;
  realizedProfitCents: number;
  unrealizedProfitCents: number;
  currentPriceCents: number;
  totalProfitCents: number;
  profitPct: number;
  updatedAt: Date;
}

export async function getItemsPL(
  userId: number,
  portfolioId?: number,
  accountId?: number,
  limit: number = 100,
  offset: number = 0
): Promise<{ items: ItemPL[]; total: number }> {
  // When portfolioId or accountId is provided, compute P/L from transactions directly
  // (item_cost_basis is global; filtered view must aggregate transactions)
  if (portfolioId || accountId) {
    const params: any[] = [userId];
    const extraFilter = [
      portfolioId ? `AND portfolio_id = $${params.push(portfolioId)}` : '',
      accountId   ? `AND steam_account_id = $${params.push(accountId)}` : '',
    ].join(' ');
    const limitIdx = params.push(limit);
    const offsetIdx = params.push(offset);
    const res = await pool.query(`
      WITH buy_agg AS (
        SELECT market_hash_name,
               COUNT(*)::int AS qty,
               SUM(price_cents)::int AS total,
               MAX(icon_url) FILTER (WHERE icon_url IS NOT NULL AND icon_url != '') AS icon_url
        FROM transactions
        WHERE user_id = $1 AND type = 'buy' AND refunded_at IS NULL ${extraFilter}
        GROUP BY market_hash_name
      ),
      sell_agg AS (
        SELECT market_hash_name,
               COUNT(*)::int AS qty,
               SUM(price_cents)::int AS total
        FROM transactions
        WHERE user_id = $1 AND type = 'sell' AND refunded_at IS NULL ${extraFilter}
        GROUP BY market_hash_name
      ),
      combined AS (
        SELECT
          COALESCE(b.market_hash_name, s.market_hash_name) AS market_hash_name,
          COALESCE(b.qty, 0) AS qty_bought,
          COALESCE(b.total, 0) AS total_spent,
          COALESCE(s.qty, 0) AS qty_sold,
          COALESCE(s.total, 0) AS total_earned,
          GREATEST(COALESCE(b.qty, 0) - COALESCE(s.qty, 0), 0) AS current_holding,
          CASE WHEN COALESCE(b.qty, 0) > 0
            THEN (COALESCE(b.total, 0) / COALESCE(b.qty, 1))
            ELSE 0
          END AS avg_buy_price,
          COALESCE(s.total, 0) - (
            CASE WHEN COALESCE(b.qty, 0) > 0
              THEN (COALESCE(b.total, 0) * COALESCE(s.qty, 0) / b.qty)::bigint
              ELSE 0
            END
          ) AS realized_profit,
          COALESCE(b.icon_url, '') AS icon_url
        FROM buy_agg b
        FULL OUTER JOIN sell_agg s USING (market_hash_name)
      ),
      with_time AS (
        SELECT c.*, t.last_tx_at, COUNT(*) OVER () AS total_count
        FROM combined c
        LEFT JOIN LATERAL (
          SELECT MAX(created_at) AS last_tx_at FROM transactions t2
          WHERE t2.user_id = $1 AND t2.market_hash_name = c.market_hash_name ${extraFilter}
        ) t ON true
      )
      SELECT * FROM with_time
      ORDER BY market_hash_name
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `, params);

    const total: number = res.rows.length > 0 ? parseInt(res.rows[0].total_count) : 0;

    // Join with current prices (LATERAL pattern)
    const names = res.rows.map((r: any) => r.market_hash_name).filter(Boolean);
    const priceMap = new Map<string, number>();
    if (names.length > 0) {
      const priceRes = await pool.query(`
        WITH names AS (SELECT unnest($1::text[]) AS market_hash_name)
        SELECT n.market_hash_name, lp.price_usd
        FROM names n
        JOIN LATERAL (
          SELECT price_usd FROM current_prices cp
          WHERE cp.market_hash_name = n.market_hash_name AND cp.price_usd > 0
          ORDER BY CASE WHEN cp.source = 'steam' THEN 0 ELSE 1 END
          LIMIT 1
        ) lp ON true
      `, [names]);
      for (const r of priceRes.rows) {
        priceMap.set(r.market_hash_name, parseFloat(r.price_usd));
      }
    }

    const items = res.rows
      .filter((r: any) => r.market_hash_name)
      .map((r: any) => {
        const currentPriceCents = Math.round((priceMap.get(r.market_hash_name) ?? 0) * 100);
        const unrealized = currentPriceCents * r.current_holding - r.avg_buy_price * r.current_holding;
        const total = r.realized_profit + unrealized;
        const invested = r.total_spent || 0;
        return {
          marketHashName: r.market_hash_name,
          avgBuyPriceCents: r.avg_buy_price,
          totalQuantityBought: r.qty_bought,
          totalSpentCents: r.total_spent,
          totalQuantitySold: r.qty_sold,
          totalEarnedCents: r.total_earned,
          currentHolding: r.current_holding,
          realizedProfitCents: r.realized_profit,
          unrealizedProfitCents: unrealized,
          currentPriceCents,
          totalProfitCents: total,
          profitPct: invested > 0 ? Math.round((total / invested) * 10000) / 100 : 0,
          updatedAt: r.last_tx_at,
          iconUrl: r.icon_url || null,
        } as ItemPL;
      });

    return { items, total };
  }

  // Global path — use item_cost_basis
  const res = await pool.query(
    `
    WITH holdings AS (
      SELECT * FROM item_cost_basis WHERE user_id = $1 AND market_hash_name != ''
    )
    SELECT
      h.market_hash_name,
      h.avg_buy_price_cents,
      h.total_quantity_bought,
      h.total_spent_cents,
      h.total_quantity_sold,
      h.total_earned_cents,
      h.current_holding,
      h.realized_profit_cents,
      lt.last_created_at AS updated_at,
      COALESCE((lp.price_usd * 100)::int, 0) AS current_price_cents,
      (COALESCE((lp.price_usd * 100)::bigint * h.current_holding, 0) - (h.avg_buy_price_cents * h.current_holding))::int AS unrealized_profit_cents,
      ti.icon_url,
      COUNT(*) OVER () AS total_count
    FROM holdings h
    LEFT JOIN LATERAL (
      SELECT price_usd FROM current_prices cp
      WHERE cp.market_hash_name = h.market_hash_name AND cp.price_usd > 0
      ORDER BY CASE WHEN cp.source = 'steam' THEN 0 ELSE 1 END
      LIMIT 1
    ) lp ON true
    LEFT JOIN LATERAL (
      SELECT MAX(created_at) AS last_created_at FROM transactions t
      WHERE t.user_id = $1 AND t.market_hash_name = h.market_hash_name
    ) lt ON true
    LEFT JOIN LATERAL (
      SELECT icon_url FROM transactions t
      WHERE t.user_id = $1 AND t.market_hash_name = h.market_hash_name
        AND t.icon_url IS NOT NULL AND t.icon_url != ''
      ORDER BY t.created_at DESC LIMIT 1
    ) ti ON true
    ORDER BY ABS(h.realized_profit_cents + COALESCE((lp.price_usd * 100)::bigint * h.current_holding, 0) - (h.avg_buy_price_cents * h.current_holding)) DESC
    LIMIT $2 OFFSET $3
    `,
    [userId, limit, offset]
  );

  const total: number = res.rows.length > 0 ? parseInt(res.rows[0].total_count) : 0;

  const items = res.rows.map((r) => {
    const unrealized = r.unrealized_profit_cents || 0;
    const realized = r.realized_profit_cents || 0;
    const total = realized + unrealized;
    const invested = r.total_spent_cents || 0;
    return {
      marketHashName: r.market_hash_name,
      avgBuyPriceCents: r.avg_buy_price_cents,
      totalQuantityBought: r.total_quantity_bought,
      totalSpentCents: r.total_spent_cents,
      totalQuantitySold: r.total_quantity_sold,
      totalEarnedCents: r.total_earned_cents,
      currentHolding: r.current_holding,
      realizedProfitCents: realized,
      unrealizedProfitCents: unrealized,
      currentPriceCents: r.current_price_cents,
      totalProfitCents: total,
      profitPct: invested > 0 ? Math.round((total / invested) * 10000) / 100 : 0,
      updatedAt: r.updated_at,
      iconUrl: r.icon_url ?? null,
    };
  });

  return { items, total };
}

// ---- Daily Snapshot ----

export async function takeDailySnapshot(userId: number, accountId?: number): Promise<void> {
  const pl = await getPortfolioPL(userId, accountId);
  // Use the composite unique index idx_daily_pl_user_account_date
  // which covers (user_id, COALESCE(steam_account_id, 0), snapshot_date)
  await pool.query(
    `
    INSERT INTO daily_pl_snapshots (user_id, steam_account_id, snapshot_date,
      total_invested_cents, total_current_value_cents, realized_profit_cents,
      unrealized_profit_cents, cumulative_profit_cents)
    VALUES ($1, $2, CURRENT_DATE, $3, $4, $5, $6, $7)
    ON CONFLICT (user_id, COALESCE(steam_account_id, 0), snapshot_date)
    DO UPDATE SET
      total_invested_cents = EXCLUDED.total_invested_cents,
      total_current_value_cents = EXCLUDED.total_current_value_cents,
      realized_profit_cents = EXCLUDED.realized_profit_cents,
      unrealized_profit_cents = EXCLUDED.unrealized_profit_cents,
      cumulative_profit_cents = EXCLUDED.cumulative_profit_cents
    `,
    [
      userId,
      accountId ?? null,
      pl.totalInvestedCents,
      pl.totalCurrentValueCents,
      pl.realizedProfitCents,
      pl.unrealizedProfitCents,
      pl.totalProfitCents,
    ]
  );
}

// ---- P/L History ----

export interface PLHistoryPoint {
  date: string;
  totalInvestedCents: number;
  totalCurrentValueCents: number;
  cumulativeProfitCents: number;
  realizedProfitCents: number;
  unrealizedProfitCents: number;
}

export async function getPLHistory(
  userId: number,
  days: number = 30,
  accountId?: number
): Promise<PLHistoryPoint[]> {
  const params: any[] = [userId, days];
  const accountFilter = accountId
    ? `AND steam_account_id = $${params.push(accountId)}`
    : '';
  const res = await pool.query(
    `
    SELECT snapshot_date, total_invested_cents, total_current_value_cents,
      cumulative_profit_cents, realized_profit_cents, unrealized_profit_cents
    FROM daily_pl_snapshots
    WHERE user_id = $1 AND snapshot_date >= CURRENT_DATE - $2::int ${accountFilter}
    ORDER BY snapshot_date ASC
    `,
    params
  );

  const rawPoints = res.rows.map((r) => ({
    date: r.snapshot_date,
    totalInvestedCents: r.total_invested_cents,
    totalCurrentValueCents: r.total_current_value_cents,
    cumulativeProfitCents: r.cumulative_profit_cents,
    realizedProfitCents: r.realized_profit_cents,
    unrealizedProfitCents: r.unrealized_profit_cents,
  }));

  if (rawPoints.length === 0) return [];

  // Fill gaps: if days are missing, carry forward previous day's values
  const points: PLHistoryPoint[] = [rawPoints[0]];
  for (let i = 1; i < rawPoints.length; i++) {
    const prev = rawPoints[i - 1];
    const curr = rawPoints[i];
    // Fill gap days between prev.date and curr.date
    const prevDate = new Date(prev.date);
    const currDate = new Date(curr.date);
    const dayDiff = Math.round((currDate.getTime() - prevDate.getTime()) / 86400000);
    for (let d = 1; d < dayDiff; d++) {
      const gapDate = new Date(prevDate);
      gapDate.setDate(gapDate.getDate() + d);
      points.push({ ...prev, date: gapDate.toISOString().slice(0, 10) });
    }
    points.push(curr);
  }

  // Always include today's live point
  const todayStr = new Date().toISOString().slice(0, 10);
  const lastPoint = points[points.length - 1];
  if (lastPoint.date !== todayStr) {
    const pl = await getPortfolioPL(userId, accountId);
    points.push({
      date: todayStr,
      totalInvestedCents: pl.totalInvestedCents,
      totalCurrentValueCents: pl.totalCurrentValueCents,
      cumulativeProfitCents: pl.totalProfitCents,
      realizedProfitCents: pl.realizedProfitCents,
      unrealizedProfitCents: pl.unrealizedProfitCents,
    });
  }

  return points;
}

// ---- Daily Cron for All Users ----

export async function runDailyPLSnapshot(): Promise<void> {
  const usersRes = await pool.query("SELECT id FROM users");
  const failedUserIds: number[] = [];

  for (const user of usersRes.rows) {
    try {
      await recalculateCostBasis(user.id);
      // Global snapshot (all accounts)
      await takeDailySnapshot(user.id);
      // Per-account snapshots for multi-account users
      const { rows: accounts } = await pool.query(
        `SELECT id FROM active_steam_accounts WHERE user_id = $1`,
        [user.id]
      );
      for (const acc of accounts) {
        await takeDailySnapshot(user.id, acc.id);
      }
    } catch (err) {
      console.error(`[PL Snapshot] Failed for user ${user.id}:`, err);
      failedUserIds.push(user.id);
    }
  }

  // Retry failed users once after a short delay
  if (failedUserIds.length > 0) {
    console.log(`[PL Snapshot] Retrying ${failedUserIds.length} failed users...`);
    await new Promise((r) => setTimeout(r, 5000));
    for (const userId of failedUserIds) {
      try {
        await recalculateCostBasis(userId);
        await takeDailySnapshot(userId);
      } catch (err) {
        console.error(`[PL Snapshot] Retry failed for user ${userId}:`, err);
      }
    }
  }

  console.log(`[PL Snapshot] Completed for ${usersRes.rows.length} users (${failedUserIds.length} retried)`);
}
