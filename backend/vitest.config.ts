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
        // Phase 1 baseline: covers core services + routes. Large services (steamSession,
        // tradeOffers, etc.) deferred to phase 2. Raise as coverage expands.
        statements: 18,
        branches: 13,
        functions: 18,
        lines: 18,
      },
    },
  },
});
