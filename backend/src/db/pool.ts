import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

// ---------------------------------------------------------------------------
// Configurable pool settings via env
// ---------------------------------------------------------------------------

const PG_POOL_MAX = parseInt(process.env.PG_POOL_MAX || "20", 10);
const PG_POOL_MIN = parseInt(process.env.PG_POOL_MIN || "2", 10);
const PG_IDLE_TIMEOUT = parseInt(process.env.PG_IDLE_TIMEOUT || "30000", 10);
const PG_CONNECT_TIMEOUT = parseInt(process.env.PG_CONNECT_TIMEOUT || "5000", 10);
const PG_STATEMENT_TIMEOUT = parseInt(process.env.PG_STATEMENT_TIMEOUT || "30000", 10);
const SLOW_QUERY_MS = parseInt(process.env.PG_SLOW_QUERY_MS || "500", 10);

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: PG_POOL_MAX,
  min: PG_POOL_MIN,
  idleTimeoutMillis: PG_IDLE_TIMEOUT,
  connectionTimeoutMillis: PG_CONNECT_TIMEOUT,
  statement_timeout: PG_STATEMENT_TIMEOUT,
});

// Prevent unhandled pool errors from crashing the process
pool.on("error", (err) => {
  console.error("[Pool] Unexpected idle client error:", err.message);
});

// ---------------------------------------------------------------------------
// Slow query logging
// ---------------------------------------------------------------------------

const _origQuery: (...a: any[]) => Promise<any> = pool.query.bind(pool);

(pool as any).query = async function (...args: any[]) {
  const start = Date.now();
  try {
    const result = await _origQuery(...args);
    const duration = Date.now() - start;
    if (duration > SLOW_QUERY_MS) {
      const queryText =
        typeof args[0] === "string"
          ? args[0].substring(0, 200)
          : "(QueryConfig)";
      console.warn(`[Pool] SLOW QUERY (${duration}ms): ${queryText}`);
    }
    return result;
  } catch (err) {
    const duration = Date.now() - start;
    if (duration > SLOW_QUERY_MS) {
      console.warn(`[Pool] SLOW QUERY FAILED (${duration}ms)`);
    }
    throw err;
  }
};

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

/** Verify database connectivity. Call once at startup. */
export async function checkPoolHealth(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    console.log("[Pool] Health check passed");
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Pool stats
// ---------------------------------------------------------------------------

export function getPoolStats(): {
  totalCount: number;
  idleCount: number;
  waitingCount: number;
  max: number;
} {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
    max: PG_POOL_MAX,
  };
}
