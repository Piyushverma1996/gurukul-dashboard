import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    ...devices["Pixel 7"],
    // Use the installed Google Chrome: the Playwright browser download is blocked on this network.
    channel: "chrome",
    viewport: { width: 375, height: 812 },
    baseURL: "http://localhost:3100",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx tsx scripts/e2e-server.ts",
    url: "http://localhost:3100/login",
    timeout: 300_000,
    reuseExistingServer: false,
    stdout: "pipe",
  },
});
