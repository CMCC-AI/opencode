import { expect, test, type Page } from "@playwright/test"
import type { LangGraphHistoryItem } from "../../src/pages/general-deepinsight/model"
import { homeDirectory, homeSession, setupHomePage } from "./home-fixture"

test.use({ locale: "zh-CN" })

async function setup(page: Page) {
  await setupHomePage(page, { models: true })
  const now = Date.now()
  const sessions = [
    { ...homeSession, id: "ses_deep_history", title: "深度研究历史测试", agent: "deepinsight/deepinsight-team-lead" },
    { ...homeSession, id: "ses_general_history", title: "普通对话历史测试" },
    { ...homeSession, id: "ses_finance_history", title: "财经历史测试", agent: "deeptrading/deeptrading-team-lead" },
  ].map((session, index) => ({ ...session, time: { created: now - 600_000, updated: now - (index + 1) * 120_000 } }))
  let items: LangGraphHistoryItem[] = (
    ["running", "completed", "interrupted", "failed", "stopped", "pending"] as const
  ).map((status, index) => ({
    id: `quick-${status}`,
    sourceId: `quick-${status}`,
    source: "langgraph",
    productType: "general-deepinsight",
    title: `快速研究 ${status}`,
    query: "历史任务展示测试",
    status,
    createdAt: new Date(now - 600_000).toISOString(),
    updatedAt: new Date(now - (index + 1) * 60_000).toISOString(),
    elapsedSeconds: 0,
    tokenCount: null,
    sourcesCount: null,
    reportLength: null,
    capabilities: { open: true, rename: true, delete: true },
  }))
  const calls: { method: string; path: string }[] = []
  await page.route("**/api/user/profile", (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: {
          user: { id: 1, name: "历史样式测试", enabled: true, casePublishAllowed: true },
          workspace: { id: 1, workspaceKey: "home-sizing-test", directoryPath: homeDirectory, status: "READY" },
        },
      },
    }),
  )
  await page.route("**/api/dockapi/sessions", (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: sessions.map((session, index) => ({
          id: `business-${session.id}`,
          agentType: index === 2 ? "deeptrading" : "deepinsight",
          title: session.title,
          query: session.title,
          directoryPath: homeDirectory,
          openCodeSessionId: session.id,
          openCodeSession: session,
          openCodeStatus: { type: index === 0 ? "busy" : "idle" },
          createdAt: new Date(session.time.created).toISOString(),
          updatedAt: new Date(session.time.updated).toISOString(),
        })),
      },
    }),
  )
  await page.route(/\/session(\?|$)/, (route) => route.fulfill({ json: sessions }))
  await page.route("**/session/status*", (route) => route.fulfill({ json: { ses_deep_history: { type: "busy" } } }))
  await page.route(/\/session\/ses_\w+_history(\?|$)/, (route) =>
    route.fulfill({
      json: sessions.find((session) => new URL(route.request().url()).pathname.endsWith(session.id)),
    }),
  )
  await page.route("**/api/dockapi/history?*", (route) => route.fulfill({ json: { code: 200, data: items } }))
  await page.route("**/api/dockapi/general-deepinsight/sessions/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    calls.push({ method: request.method(), path })
    const id = path.split("/").at(-1)
    if (request.method() === "PATCH")
      items = items.map((item) => (item.id === id ? { ...item, title: request.postDataJSON().title } : item))
    if (request.method() === "DELETE") items = items.filter((item) => item.id !== id)
    return route.fulfill({
      json: {
        code: 200,
        data: {
          session: items.find((item) => item.id === id),
          conversationData: { steps: [] },
          reportContent: "# 测试报告",
          dataVersion: "test",
        },
      },
    })
  })
  return {
    calls,
    complete: () => {
      items = items.map((item) => (item.status === "running" ? { ...item, status: "completed" } : item))
    },
  }
}

const row = (page: Page, title: string) =>
  page.locator('[data-component="cmcc-history-row"]').filter({
    has: page.getByText(title, { exact: true }),
  })

for (const width of [1440, 390]) {
  test(`research history shares badges, spinners and layout at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page)
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await page.goto("/app")
    const sidebar = page.getByRole("complementary", { name: "CMCC conversations" })
    const deep = row(page, "深度研究历史测试")
    const quick = row(page, "快速研究 running")
    await expect(sidebar.locator('[data-component="cmcc-history-row"]')).toHaveCount(9)
    await expect(sidebar.locator('[data-slot="session-product-label"]').filter({ hasText: /^深度研究$/ })).toHaveCount(
      7,
    )
    await expect(row(page, "普通对话历史测试").getByText("通用对话", { exact: true })).toBeVisible()
    await expect(row(page, "财经历史测试").getByText("AI+财经", { exact: true })).toBeVisible()
    await expect(sidebar.getByText("通用深度洞察", { exact: true })).toHaveCount(0)
    const labelStyle = (target: typeof deep) =>
      target.locator('[data-slot="session-product-label"]').evaluate((element) => {
        const style = getComputedStyle(element)
        return [style.color, style.backgroundColor, style.borderColor, style.fontSize, style.lineHeight, style.height]
      })
    expect(await labelStyle(quick)).toEqual(await labelStyle(deep))
    await expect(deep.locator('[data-slot="session-running-spinner"]')).toHaveCount(1)
    await expect(quick.locator('[data-slot="session-running-spinner"]')).toHaveCount(1)
    expect(await quick.locator('[data-slot="session-running-spinner"]').evaluate((element) => element.outerHTML)).toBe(
      await deep.locator('[data-slot="session-running-spinner"]').evaluate((element) => element.outerHTML),
    )
    await expect(sidebar.locator('[data-slot="session-running-spinner"]')).toHaveCount(2)
    await expect(deep.locator('[data-slot="session-time"]')).toHaveText("2 分")
    await expect(quick.locator('[data-slot="session-time"]')).toHaveText("1 分")
    const bounds = await sidebar.locator('[data-component="cmcc-history-row"]').evaluateAll((rows) =>
      rows.map((element) => {
        const badge = element.querySelector('[data-slot="session-product-label"]')!.getBoundingClientRect()
        const bounds = element.getBoundingClientRect()
        return {
          height: bounds.height,
          fits: element.scrollWidth <= element.clientWidth && badge.right <= bounds.right - 30,
        }
      }),
    )
    expect(bounds.every((item) => item.fits && item.height === bounds[0].height)).toBe(true)
    await quick.hover()
    await expect(quick.locator('[data-slot="session-running-indicator"]')).toHaveCSS("opacity", "0")
    await quick.getByRole("button", { name: "研究任务操作" }).click()
    await expect(page.getByRole("menuitem", { name: "重命名" })).toBeVisible()
    await expect(page.getByRole("menuitem", { name: "删除", exact: true })).toBeVisible()
    await expect(page.getByRole("menuitem", { name: "添加至案例库" })).toHaveCount(0)
    await page.keyboard.press("Escape")
    await expect(page.getByRole("menu")).not.toBeVisible()
    await page.getByRole("button", { name: "新对话", exact: true }).first().focus()
    await page.mouse.move(width - 1, 0)
    await expect(quick.locator('[data-slot="session-running-indicator"]')).toHaveCSS("opacity", "1")
    await page.screenshot({ path: info.outputPath(`research-history-${width}.png`) })
    await row(page, "快速研究 completed")
      .getByRole("button", { name: /^快速研究 completed/ })
      .click()
    await expect(page).toHaveURL(/\/general-deepinsight\/session\/quick-completed$/)
    await expect(row(page, "快速研究 completed")).toHaveAttribute("data-selected", "")
    if (width === 390) await page.getByRole("button", { name: "展开左栏", exact: true }).click()
    await deep.getByRole("button", { name: /^深度研究历史测试/ }).click()
    await expect(page).toHaveURL(/\/session\/ses_deep_history$/)
    await expect(deep).toHaveAttribute("data-selected", "")
    expect(errors).toEqual([])
  })
}

test("research history updates running status and preserves research menu actions", async ({ page }) => {
  const fixture = await setup(page)
  await page.goto("/app")
  const quick = row(page, "快速研究 running")
  await expect(quick.locator('[data-slot="session-running-spinner"]')).toHaveCount(1)
  fixture.complete()
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("general-deepinsight-updated")))
  await expect(quick.locator('[data-slot="session-running-spinner"]')).toHaveCount(0)
  await quick.hover()
  await quick.getByRole("button", { name: "研究任务操作" }).click()
  await expect(page.getByRole("menuitem", { name: "添加至案例库" })).toBeVisible()
  page.once("dialog", (dialog) => dialog.accept("重命名研究测试"))
  await page.getByRole("menuitem", { name: "重命名" }).click()
  const renamed = row(page, "重命名研究测试")
  await expect(renamed).toBeVisible()
  await renamed.hover()
  await renamed.getByRole("button", { name: "研究任务操作" }).click()
  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("menuitem", { name: "删除", exact: true }).click()
  await expect(renamed).toHaveCount(0)
  expect(fixture.calls.filter((call) => call.method !== "GET")).toEqual([
    { method: "PATCH", path: "/api/dockapi/general-deepinsight/sessions/quick-running" },
    { method: "DELETE", path: "/api/dockapi/general-deepinsight/sessions/quick-running" },
  ])
  await expect(row(page, "深度研究历史测试")).toBeVisible()
  const deep = row(page, "深度研究历史测试")
  await deep.hover()
  await deep.getByRole("button", { name: "更多", exact: true }).click()
  await expect(page.getByRole("menuitem", { name: "添加至案例库" })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "删除", exact: true })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "重命名" })).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu")).not.toBeVisible()
  await deep.click({ button: "right" })
  await expect(page.getByRole("menuitem", { name: "删除", exact: true })).toBeVisible()
})
