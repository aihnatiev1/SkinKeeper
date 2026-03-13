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
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
});
