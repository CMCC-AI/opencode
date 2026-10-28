import { homeDirectory, homeSession, setupHomePage } from "../../startup/home-fixture"
import { benchmark, expect } from "../benchmark"

benchmark.use({ locale: "zh-CN" })

benchmark("measures the first general-chat submission", async ({ page, report }) => {
  await setupHomePage(page, { models: true })
  let created = 0
  let sent = 0
  let elapsed = 0
  let start = 0
  await page.route("**/api/dockapi/sessions", (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { code: 200, data: [] } })
    created++
    return route.fulfill({
      json: {
        code: 200,
        data: {
          id: "first-send",
          agentType: "general",
          directoryPath: homeDirectory,
          openCodeSessionId: homeSession.id,
          openCodeSession: homeSession,
        },
      },
    })
  })
  await page.route(`**/session/${homeSession.id}*`, (route) =>
    new URL(route.request().url()).pathname === `/session/${homeSession.id}`
      ? route.fulfill({ json: homeSession })
      : route.fallback(),
  )
  await page.route(`**/session/${homeSession.id}/prompt_async*`, (route) => {
    sent++
    elapsed = performance.now() - start
    return route.fulfill({ status: 204 })
  })
  await page.goto("/app")
  await expect(page.locator('[data-action="prompt-model"]')).toBeEnabled()
  await page.locator('[data-component="prompt-input"]').fill("首次发送性能基线")
  start = performance.now()
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect.poll(() => sent).toBe(1)
  expect(created).toBe(1)
  report({ submitMs: elapsed, created, sent })
})
