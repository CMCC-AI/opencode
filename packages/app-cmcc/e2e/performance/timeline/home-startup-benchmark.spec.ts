import { setupHomePage } from "../../startup/home-fixture"
import { benchmark, expect } from "../benchmark"

benchmark.use({ locale: "zh-CN" })

benchmark("measures homepage readiness with delayed model and agent catalogs", async ({ page, report }) => {
  await setupHomePage(page, { models: true })
  await page.route("**/api/dockapi/history?*", (route) => route.fulfill({ json: { code: 200, data: [] } }))
  const requests: { path: string; directory: string | null }[] = []
  await page.route(/\/(provider|agent)(\?|$)/, async (route) => {
    const url = new URL(route.request().url())
    requests.push({ path: url.pathname, directory: url.searchParams.get("directory") })
    await new Promise((resolve) => setTimeout(resolve, 1200))
    await route.fallback()
  })
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      for (const [name, selector] of [
        ["sidebar-visible", '[aria-label="CMCC conversations"]'],
        ["home-heading-visible", '[data-component="session-new-design"] h1'],
        ["home-editor-visible", '[data-component="prompt-input"]'],
      ]) {
        if (performance.getEntriesByName(name).length) continue
        const element = document.querySelector(selector)
        if (element?.getBoundingClientRect().width) performance.mark(name)
      }
    })
    observer.observe(document, { childList: true, subtree: true })
  })
  await page.goto("/app")
  await expect(page.locator('[data-component="prompt-input"]')).toBeVisible()
  await expect(page.getByRole("button", { name: "选择模型" })).toContainText(/测试模型/)
  const marks = await page.evaluate(() =>
    Object.fromEntries(
      performance
        .getEntriesByType("mark")
        .filter((entry) => entry.name.endsWith("-visible"))
        .map((entry) => [entry.name, entry.startTime]),
    ),
  )
  expect(marks["home-editor-visible"]).toBeGreaterThan(0)
  report({ marks, requests })
})
