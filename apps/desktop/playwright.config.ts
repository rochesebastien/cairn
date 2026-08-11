import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the proofs in .cairn/proofs/.
 *
 * `cairn verify` spawns `playwright test` here and reads the JSON report back;
 * it exports CAIRN_BASE_URL and CAIRN_START from cairn.config.ts so this file
 * owns the app lifecycle and nothing is written twice.
 *
 * CAIRN_CHROMIUM (optional) points at a system Chromium executable for
 * environments where the Playwright-managed browser download is unavailable;
 * CI installs its own browsers and leaves it unset.
 */
const baseURL = process.env.CAIRN_BASE_URL ?? "http://127.0.0.1:5183";

export default defineConfig({
  testDir: ".cairn/proofs",
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    ...(process.env.CAIRN_CHROMIUM
      ? { launchOptions: { executablePath: process.env.CAIRN_CHROMIUM } }
      : {}),
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: process.env.CAIRN_START ?? "pnpm dev",
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    // Cold CI runners pay corepack + vite start-up; keep the server's own
    // output visible so a timeout is diagnosable from the job log.
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
