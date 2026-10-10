import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["**/node_modules/**"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: ["src/**/*.ts"],
      exclude: ["src/cli.ts"],
      thresholds: {
        // Justified target for core business logic — raise as suite grows
        statements: 70,
        branches: 60,
        functions: 70,
        lines: 70,
      },
    },
  },
});
