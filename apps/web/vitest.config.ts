import { defineConfig } from "vitest/config";

// Unit tests live next to the source as `*.test.ts`. The Playwright e2e specs
// under `e2e/` use a different runner, so keep Vitest scoped to `src/` to avoid
// loading them.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["e2e/**", "node_modules/**", "dist/**"]
  }
});
