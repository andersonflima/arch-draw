import { defineConfig } from "@playwright/test";

// Dedicated config for the canvas performance probes. These are NOT part of the
// smoke gate (see testIgnore in playwright.config.ts); they drive pan/zoom/drag
// gestures against the production build and report frame timings, so we have
// real numbers before touching the rendering pipeline.
//
// Build first, then run:
//   npm run build --workspace @arch-draw/web
//   npm run e2e:perf --workspace @arch-draw/web
//   PERF_NODES="50,800,3000" PERF_CODE="1,10,20" npm run e2e:perf --workspace @arch-draw/web
const PORT = 4319;

export default defineConfig({
  testDir: "./e2e/perf",
  testMatch: "**/*.perf.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  timeout: 180_000,
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1400, height: 900 }
  },
  projects: [{ name: "chromium" }],
  webServer: {
    command: `node e2e/serve.mjs dist/browser ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
