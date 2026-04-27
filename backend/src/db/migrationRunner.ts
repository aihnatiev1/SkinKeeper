/**
 * migrationRunner.ts
 *
 * File-based, versioned migration runner for SkinKeeper.
 * Replaces the single-schema-const pattern (DevOps-1).
 *
 * Behaviour:
 *  - Reads *.sql files from MIGRATIONS_DIR, ordered by NNN_ prefix.
 *  - Acquires pg_advisory_lock so PM2 cluster boots don't double-apply.
 *  - Creates schema_migrations table if absent.
 *  - Applies pending files in order, recording checksum + timestamp.
 *  - On boot: refuses to start if a previously-applied file's checksum differs
 *    from what's on disk (set MIGRATIONS_ALLOW_CHECKSUM_DRIFT=1 to override).
 *  - Detects gaps: a version recorded in DB but missing on disk, or an
 *    un-applied file lower than the highest applied version.
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import type pg from "pg";
import { pool } from "./pool.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(__dirname, "migrations");

/** pg_advisory_lock key — must never change once in use. */
const ADVISORY_LOCK_KEY = 7_777_777_777;

const CREATE_SCHEMA_MIGRATIONS = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(10)  PRIMARY KEY,
    applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    checksum    VARCHAR(64)  NOT NULL,
    applied_by  VARCHAR(100) DEFAULT current_user
  );
`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MigrationFile {
  version: string;   // e.g. "001"
  filename: string;  // e.g. "001_initial_schema.sql"
  filepath: string;  // absolute path
}

export interface AppliedMigration {
  version: string;
  applied_at: Date;
  checksum: string;
  applied_by: string | null;
}

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

/** Read all *.sql (non-.down.sql) migration files, sorted by version. */
export function readMigrationFiles(dir: string = MIGRATIONS_DIR): MigrationFile[] {
  if (!fs.existsSync(dir)) return [];

  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql") && !f.endsWith(".down.sql") && !f.endsWith(".ref"))
    .sort();

  const migrations: MigrationFile[] = [];
  for (const filename of files) {
    const match = filename.match(/^(\d{3})_/);
    if (!match) {
      // Ignore files that don't match the NNN_ pattern (e.g. .ref files caught above).
      continue;
    }
    const version = match[1];
    migrations.push({
      version,
      filename,
      filepath: path.join(dir, filename),
    });
  }

  // Ensure versions are unique
  const seen = new Set<string>();
  for (const m of migrations) {
    if (seen.has(m.version)) {
      throw new Error(
        `[Migration] Duplicate version ${m.version} in ${dir}. Each NNN prefix must be unique.`
      );
    }
    seen.add(m.version);
  }

  return migrations;
}

export function sha256(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export function readMigrationSQL(filepath: string): string {
  return fs.readFileSync(filepath, "utf8");
}

/** Find the corresponding .down.sql file for a given up migration file, if it exists. */
export function findDownFile(filepath: string): string | null {
  const downPath = filepath.replace(/\.sql$/, ".down.sql");
  return fs.existsSync(downPath) ? downPath : null;
}

// ---------------------------------------------------------------------------
// DB helpers
// ---------------------------------------------------------------------------

async function getAppliedMigrations(client: pg.PoolClient): Promise<AppliedMigration[]> {
  const res = await client.query<AppliedMigration>(
    "SELECT version, applied_at, checksum, applied_by FROM schema_migrations ORDER BY version"
  );
  return res.rows;
}

async function recordMigration(
  client: pg.PoolClient,
  version: string,
  checksum: string
): Promise<void> {
  await client.query(
    "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)",
    [version, checksum]
  );
}

async function removeMigration(client: pg.PoolClient, version: string): Promise<void> {
  await client.query("DELETE FROM schema_migrations WHERE version = $1", [version]);
}

// ---------------------------------------------------------------------------
// Gap & checksum validation
// ---------------------------------------------------------------------------

/**
 * Validate that:
 *  1. Every version in schema_migrations has a file on disk.
 *  2. No un-applied file exists with a version below max(applied version).
 *  3. Checksums of applied files match what is stored.
 */
export function validateMigrationState(
  files: MigrationFile[],
  applied: AppliedMigration[]
): void {
  const fileMap = new Map<string, MigrationFile>(files.map((f) => [f.version, f]));
  const appliedMap = new Map<string, AppliedMigration>(applied.map((a) => [a.version, a]));

  const allowDrift = process.env.MIGRATIONS_ALLOW_CHECKSUM_DRIFT === "1";
  const maxApplied = applied.length > 0
    ? applied.reduce((max, a) => (a.version > max ? a.version : max), "000")
    : null;

  // 1. Every applied version must have a file.
  for (const a of applied) {
    if (!fileMap.has(a.version)) {
      throw new Error(
        `[Migration] FATAL: Version ${a.version} is recorded in schema_migrations but ` +
        `its file no longer exists on disk. Do not delete applied migration files.`
      );
    }
  }

  // 2. No un-applied file should sit below the highest applied version (gap detection).
  if (maxApplied !== null) {
    for (const f of files) {
      if (f.version <= maxApplied && !appliedMap.has(f.version)) {
        throw new Error(
          `[Migration] GAP DETECTED: Version ${f.version} (${f.filename}) is not in ` +
          `schema_migrations but version ${maxApplied} is already applied. ` +
          `A migration file was added retrospectively — investigate before proceeding.`
        );
      }
    }
  }

  // 3. Checksum verification for all applied migrations.
  for (const a of applied) {
    const file = fileMap.get(a.version);
    if (!file) continue; // covered by check 1 above
    const content = readMigrationSQL(file.filepath);
    const currentChecksum = sha256(content);
    if (currentChecksum !== a.checksum) {
      const msg =
        `[Migration] CHECKSUM MISMATCH for version ${a.version} (${file.filename}):\n` +
        `  stored:  ${a.checksum}\n` +
        `  current: ${currentChecksum}\n` +
        `  The file was modified after it was applied. ` +
        `Set MIGRATIONS_ALLOW_CHECKSUM_DRIFT=1 to bypass (emergency only).`;
      if (allowDrift) {
        console.warn(`[MIGRATION CHECKSUM DRIFT] ${msg}`);
      } else {
        throw new Error(msg);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Core runner
// ---------------------------------------------------------------------------

/** Apply all pending migrations. Acquires advisory lock. */
export async function runMigrations(migrationsDir: string = MIGRATIONS_DIR): Promise<void> {
  const client = await pool.connect();
  try {
    // Acquire session-level advisory lock. Second caller blocks until released.
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);
    console.log("[Migration] Advisory lock acquired.");

    // Ensure tracking table exists.
    await client.query(CREATE_SCHEMA_MIGRATIONS);

    const files = readMigrationFiles(migrationsDir);
    const applied = await getAppliedMigrations(client);

    validateMigrationState(files, applied);

    const appliedSet = new Set(applied.map((a) => a.version));
    const pending = files.filter((f) => !appliedSet.has(f.version));

    if (pending.length === 0) {
      console.log(`[Migration] Up to date (${applied.length} migrations applied).`);
      return;
    }

    console.log(`[Migration] Applying ${pending.length} pending migration(s)...`);

    for (const migration of pending) {
      const sql = readMigrationSQL(migration.filepath);
      const checksum = sha256(sql);

      console.log(`[Migration] --> ${migration.filename}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await recordMigration(client, migration.version, checksum);
        await client.query("COMMIT");
        console.log(`[Migration] ✓  ${migration.filename}`);
      } catch (err) {
        await client.query("ROLLBACK");
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(
          `[Migration] FAILED at ${migration.filename}: ${message}\n` +
          `The migration was rolled back. Fix the SQL and retry.`
        );
      }
    }

    console.log(`[Migration] Done. ${pending.length} migration(s) applied.`);
  } finally {
    // Releasing the client releases the advisory lock automatically.
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Down migration
// ---------------------------------------------------------------------------

/** Roll back a single migration version. Runs NNN.down.sql, removes from schema_migrations. */
export async function runDown(version: string, migrationsDir: string = MIGRATIONS_DIR): Promise<void> {
  const files = readMigrationFiles(migrationsDir);
  const target = files.find((f) => f.version === version);
  if (!target) {
    throw new Error(`[Migration] No migration file found for version ${version}.`);
  }

  const downPath = findDownFile(target.filepath);
  if (!downPath) {
    throw new Error(
      `[Migration] No down file found for version ${version}. ` +
      `Expected: ${target.filepath.replace(/\.sql$/, ".down.sql")}`
    );
  }

  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [ADVISORY_LOCK_KEY]);

    // Verify version is actually applied.
    const res = await client.query(
      "SELECT version FROM schema_migrations WHERE version = $1",
      [version]
    );
    if (res.rowCount === 0) {
      throw new Error(`[Migration] Version ${version} is not recorded as applied — cannot roll back.`);
    }

    const downSql = readMigrationSQL(downPath);
    console.log(`[Migration] Rolling back ${target.filename}...`);
    await client.query("BEGIN");
    try {
      await client.query(downSql);
      await removeMigration(client, version);
      await client.query("COMMIT");
      console.log(`[Migration] Rolled back ${target.filename}.`);
    } catch (err) {
      await client.query("ROLLBACK");
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`[Migration] Rollback FAILED for ${target.filename}: ${message}`);
    }
  } finally {
    client.release();
  }
}

// ---------------------------------------------------------------------------
// Status query (used by CLI)
// ---------------------------------------------------------------------------

export interface MigrationStatus {
  version: string;
  filename: string;
  status: "applied" | "pending";
  applied_at?: Date;
  applied_by?: string | null;
}

export async function getMigrationStatus(migrationsDir: string = MIGRATIONS_DIR): Promise<MigrationStatus[]> {
  const files = readMigrationFiles(migrationsDir);

  // Try to read schema_migrations; if table doesn't exist, treat all as pending.
  let applied: AppliedMigration[] = [];
  try {
    const client = await pool.connect();
    try {
      applied = await getAppliedMigrations(client);
    } finally {
      client.release();
    }
  } catch {
    // Table may not exist yet on a fresh DB.
    applied = [];
  }

  const appliedMap = new Map(applied.map((a) => [a.version, a]));

  return files.map((f) => {
    const record = appliedMap.get(f.version);
    return {
      version: f.version,
      filename: f.filename,
      status: record ? "applied" : "pending",
      applied_at: record?.applied_at,
      applied_by: record?.applied_by,
    };
  });
}

// ---------------------------------------------------------------------------
// Create migration template
// ---------------------------------------------------------------------------

export function createMigrationTemplate(name: string, migrationsDir: string = MIGRATIONS_DIR): { upPath: string; downPath: string } {
  const files = readMigrationFiles(migrationsDir);
  const maxVersion = files.length > 0
    ? Math.max(...files.map((f) => parseInt(f.version, 10)))
    : 0;
  const nextVersion = String(maxVersion + 1).padStart(3, "0");
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/(^_|_$)/g, "");
  const base = `${nextVersion}_${slug}`;
  const upPath = path.join(migrationsDir, `${base}.sql`);
  const downPath = path.join(migrationsDir, `${base}.down.sql`);

  if (fs.existsSync(upPath)) {
    throw new Error(`[Migration] File already exists: ${upPath}`);
  }

  fs.writeFileSync(
    upPath,
    `-- ${base}.sql\n-- Description: ${name}\n-- Created: ${new Date().toISOString()}\n\n-- TODO: write your migration SQL here\n`,
    "utf8"
  );
  fs.writeFileSync(
    downPath,
    `-- ${base}.down.sql\n-- Rollback for: ${name}\n-- Created: ${new Date().toISOString()}\n\n-- TODO: write rollback SQL here\n`,
    "utf8"
  );

  return { upPath, downPath };
}

