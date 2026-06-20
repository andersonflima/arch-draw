import { defineConfig } from "@playwright/test";

// The app talks to a backend, so the e2e suite stubs every /api/** call and runs
// against the static production build. The webServer below serves that build; no
// API or database is needed.
const PORT = 4318;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    viewport: { width: 1400, height: 900 },
    trace: "on-first-retry"
  },
  projects: [{ name: "chromium" }],
  webServer: {
    command: `node e2e/serve.mjs dist/browser ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000
  }
});
