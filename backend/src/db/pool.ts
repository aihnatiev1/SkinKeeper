import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Prevent unhandled pool errors from crashing the process
pool.on("error", (err) => {
  console.error("[Pool] Unexpected idle client error:", err.message);
});

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
