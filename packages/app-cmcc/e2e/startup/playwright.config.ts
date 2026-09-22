import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4175)
const baseURL = `http://127.0.0.1:${port}`
process.env.PLAYWRIGHT_BASE_URL = baseURL

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  outputDir: "../test-results/startup",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: "line",
  webServer: {
    command: `bun run serve -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/app`,
    reuseExistingServer: true,
  },
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PLAYWRIGHT_CHANNEL } }],
})
