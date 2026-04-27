#!/usr/bin/env tsx
/**
 * scripts/backfill-migrations.ts
 *
 * One-shot backfill: reads all *.sql migration files from src/db/migrations/,
 * computes their SHA-256 checksums, and inserts rows into schema_migrations
 * for every version that isn't already recorded.
 *
 * Idempotent: if schema_migrations already has rows, only missing versions
 * are inserted. Running this twice is safe.
 *
 * Purpose: on first deploy of the migration runner, prod already has all 37
 * schema blocks applied (000–036). This script populates the tracking table
 * so the runner sees "nothing pending" and doesn't re-run any DDL.
 *
 * Usage:
 *   npm run migrate:backfill
 *
 * Run this BEFORE deploying the index.ts change that calls runMigrations().
 */

import dotenv from "dotenv";
dotenv.config({ override: true });

import pg from "pg";
import { readMigrationFiles, sha256, readMigrationSQL } from "../src/db/migrationRunner.js";

const CREATE_SCHEMA_MIGRATIONS = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version     VARCHAR(10)  PRIMARY KEY,
    applied_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    checksum    VARCHAR(64)  NOT NULL,
    applied_by  VARCHAR(100) DEFAULT current_user
  );
`;

async function backfill(): Promise<void> {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    console.log("[Backfill] Starting migration backfill...");

    // Create schema_migrations if it doesn't exist.
    await client.query(CREATE_SCHEMA_MIGRATIONS);

    // Load already-applied versions.
    const existingRes = await client.query<{ version: string }>(
      "SELECT version FROM schema_migrations"
    );
    const existing = new Set(existingRes.rows.map((r) => r.version));
    console.log(`[Backfill] Found ${existing.size} already-recorded version(s).`);

    // Read all migration files.
    const files = readMigrationFiles();
    console.log(`[Backfill] Found ${files.length} migration file(s) on disk.`);

    let inserted = 0;
    for (const file of files) {
      if (existing.has(file.version)) {
        console.log(`[Backfill]   skip ${file.version} (already recorded)`);
        continue;
      }
      const content = readMigrationSQL(file.filepath);
      const checksum = sha256(content);
      await client.query(
        `INSERT INTO schema_migrations (version, checksum, applied_by)
         VALUES ($1, $2, 'backfill')
         ON CONFLICT (version) DO NOTHING`,
        [file.version, checksum]
      );
      console.log(`[Backfill]   inserted ${file.version} (${file.filename})`);
      inserted++;
    }

    if (inserted === 0) {
      console.log("[Backfill] Nothing to do — all versions already recorded.");
    } else {
      console.log(`[Backfill] Done. Inserted ${inserted} version(s) into schema_migrations.`);
    }

    // Verify final state.
    const finalRes = await client.query<{ version: string; applied_at: Date }>(
      "SELECT version, applied_at FROM schema_migrations ORDER BY version"
    );
    console.log(`[Backfill] schema_migrations now has ${finalRes.rows.length} row(s):`);
    for (const row of finalRes.rows) {
      console.log(`  ${row.version}  ${row.applied_at.toISOString()}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

backfill().catch((err) => {
  console.error("[Backfill] Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
