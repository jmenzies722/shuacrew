import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/**/*.test.{ts,tsx}", "apps-kit/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "apps/web/e2e/**"],
    testTimeout: 20000,
  },
});
