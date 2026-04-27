/**
 * migrationCli.ts
 *
 * CLI dispatcher for migration operations.
 * Invoked via backend/scripts/migrate.ts.
 *
 * Commands:
 *   status               — list applied and pending migrations
 *   up [--target NNN]    — apply pending (optionally up to target version)
 *   down <version>       — roll back a single version
 *   create <name>        — create NNN_name.sql + NNN_name.down.sql templates
 */

import { pool } from "./pool.js";
import {
  runMigrations,
  runDown,
  getMigrationStatus,
  createMigrationTemplate,
  readMigrationFiles,
  MIGRATIONS_DIR,
} from "./migrationRunner.js";

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function pad(s: string, n: number): string {
  return s.padEnd(n, " ");
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function cmdStatus(): Promise<void> {
  const rows = await getMigrationStatus();
  if (rows.length === 0) {
    console.log("[Migration] No migration files found in " + MIGRATIONS_DIR);
    return;
  }
  console.log("");
  console.log(pad("Version", 10) + pad("Status", 10) + pad("Applied At", 28) + "File");
  console.log("-".repeat(80));
  for (const row of rows) {
    const appliedAt = row.applied_at
      ? row.applied_at.toISOString()
      : "-";
    const statusStr = row.status === "applied" ? "applied" : "PENDING";
    console.log(
      pad(row.version, 10) +
      pad(statusStr, 10) +
      pad(appliedAt, 28) +
      row.filename
    );
  }
  console.log("");
  const pending = rows.filter((r) => r.status === "pending");
  const applied = rows.filter((r) => r.status === "applied");
  console.log(`${applied.length} applied, ${pending.length} pending.`);
  console.log("");
}

async function cmdUp(args: string[]): Promise<void> {
  const targetIdx = args.indexOf("--target");
  const targetVersion = targetIdx !== -1 ? args[targetIdx + 1] : undefined;

  if (targetVersion) {
    // Apply up to (and including) target. Temporarily filter files.
    const files = readMigrationFiles();
    const targetFile = files.find((f) => f.version === targetVersion);
    if (!targetFile) {
      console.error(`[Migration] No file found for target version ${targetVersion}.`);
      process.exit(1);
    }

    // We run the standard runner but it will naturally stop at whatever pending
    // migrations exist. To enforce a ceiling we need to limit the files the
    // runner sees. We do this by temporarily re-implementing the logic with a filter.
    // Rather than duplicating, we rely on runMigrations scanning all pending
    // and note that if the target is already applied it will be a no-op.
    // For simplicity we apply all pending up to and including target manually:
    const { pool } = await import("./pool.js");
    const client = await pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock(7777777777)");
      await client.query(`
        CREATE TABLE IF NOT EXISTS schema_migrations (
          version     VARCHAR(10)  PRIMARY KEY,
          applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
          checksum    VARCHAR(64)  NOT NULL,
          applied_by  VARCHAR(100) DEFAULT current_user
        )
      `);
      const res = await client.query("SELECT version FROM schema_migrations");
      const applied = new Set<string>(res.rows.map((r: { version: string }) => r.version));
      const pending = files
        .filter((f) => !applied.has(f.version) && f.version <= targetVersion);
      if (pending.length === 0) {
        console.log(`[Migration] No pending migrations up to version ${targetVersion}.`);
        return;
      }
      const { sha256, readMigrationSQL } = await import("./migrationRunner.js");
      for (const m of pending) {
        const sql = readMigrationSQL(m.filepath);
        const checksum = sha256(sql);
        console.log(`[Migration] --> ${m.filename}`);
        await client.query("BEGIN");
        try {
          await client.query(sql);
          await client.query(
            "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
            [m.version, checksum]
          );
          await client.query("COMMIT");
          console.log(`[Migration] ✓  ${m.filename}`);
        } catch (err) {
          await client.query("ROLLBACK");
          throw err;
        }
      }
    } finally {
      client.release();
    }
  } else {
    await runMigrations();
  }
}

async function cmdDown(args: string[]): Promise<void> {
  const version = args[0];
  if (!version) {
    console.error("[Migration] Usage: migrate:down <version>  e.g. migrate:down 038");
    process.exit(1);
  }
  // Zero-pad if needed
  const paddedVersion = version.padStart(3, "0");
  await runDown(paddedVersion);
}

async function cmdCreate(args: string[]): Promise<void> {
  const name = args[0];
  if (!name) {
    console.error("[Migration] Usage: migrate:create <name>  e.g. migrate:create add_widget_table");
    process.exit(1);
  }
  const { upPath, downPath } = createMigrationTemplate(name);
  console.log(`[Migration] Created:`);
  console.log(`  ${upPath}`);
  console.log(`  ${downPath}`);
}

// ---------------------------------------------------------------------------
// Dispatcher
// ---------------------------------------------------------------------------

export async function runCli(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  try {
    switch (command) {
      case "status":
        await cmdStatus();
        break;
      case "up":
        await cmdUp(rest);
        break;
      case "down":
        await cmdDown(rest);
        break;
      case "create":
        await cmdCreate(rest);
        break;
      default:
        console.error(
          `[Migration] Unknown command: ${command ?? "(none)"}\n` +
          `Available: status | up [--target NNN] | down <version> | create <name>`
        );
        process.exit(1);
    }
  } finally {
    // Close pool so process exits cleanly.
    await pool.end().catch(() => {});
  }
}
