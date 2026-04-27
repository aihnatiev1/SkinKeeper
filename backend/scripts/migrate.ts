#!/usr/bin/env tsx
/**
 * scripts/migrate.ts
 *
 * Entry point for migration CLI commands.
 * Invoked by package.json scripts:
 *   npm run migrate:status
 *   npm run migrate:up
 *   npm run migrate:down -- <version>
 *   npm run migrate:create -- <name>
 */

import dotenv from "dotenv";
dotenv.config({ override: true });

import { runCli } from "../src/db/migrationCli.js";

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error(
    "[Migration] No command provided.\n" +
    "Usage: npm run migrate:<command>\n" +
    "  migrate:status\n" +
    "  migrate:up [-- --target NNN]\n" +
    "  migrate:down -- <version>\n" +
    "  migrate:create -- <name>"
  );
  process.exit(1);
}

runCli(args).catch((err) => {
  console.error("[Migration] Fatal:", err instanceof Error ? err.message : err);
  process.exit(1);
});
