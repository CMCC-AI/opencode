import { defineConfig, devices } from "@playwright/test"

const port = Number(process.env.PLAYWRIGHT_PORT ?? 4174)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: ".",
  testMatch: "*.spec.ts",
  outputDir: "../test-results/landing",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: "line",
  webServer: {
    command: `bun run serve -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: `${baseURL}/landing/index.html`,
    reuseExistingServer: true,
  },
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: process.env.PLAYWRIGHT_CHANNEL } }],
})
