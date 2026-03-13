import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: "src",
    environment: "node",
    globals: true,
    setupFiles: ["./__tests__/setup.ts"],
    testTimeout: 15000,
    hookTimeout: 15000,
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "lcov"],
      include: ["**/*.ts"],
      exclude: [
        "**/__tests__/**",
        "**/index.ts",
        "**/db/migrate.ts",
        "**/db/migrations/**",
      ],
      thresholds: {
        // Phase 2 gap closure (15-04): added auth, trades, market, session route tests.
        // Actual coverage after 15-03+15-04: ~25% statements. Target: 70% by end of phase.
        statements: 25,
        branches: 19,
        functions: 26,
        lines: 26,
      },
    },
  },
});
