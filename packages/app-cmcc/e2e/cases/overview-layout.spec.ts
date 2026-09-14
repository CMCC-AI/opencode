import { expect, test, type Locator, type Page } from "@playwright/test"
import { CMCC_CASE_CATEGORIES } from "../../src/utils/cmcc-cases"
import { cmccHistoryProduct } from "../../src/utils/cmcc-history-product"
import { fixture } from "../smoke/session-timeline.fixture"
import { mockOpenCodeServer } from "../utils/mock-server"

test.use({ channel: process.env.PLAYWRIGHT_CHANNEL, video: "off" })

async function prepare(page: Page, scienceCount = 4, canManage = false) {
  const base = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000"
  const groups = CMCC_CASE_CATEGORIES.map((category) => ({
    category: category.code,
    label: category.label,
    items: Array.from(
      { length: category.code === "science" ? scienceCount : category.code === "deep-research" ? 4 : 2 },
      (_, index) => ({
        caseCode: `${category.code}-${index + 1}`,
        category: category.code,
        categoryLabel: category.label,
        agentType: category.agentType,
        caseName: `${category.label}案例 ${index + 1}`,
        caseTag: category.label,
        coverUrl: `${base}/landing/assets/grid-07-CnyNXoAJ.png`,
        reportCharCount: 12345,
        publishedAt: "2026-09-09T00:00:00Z",
      }),
    ),
  }))
  const listRequests: URLSearchParams[] = []
  await mockOpenCodeServer(page, { ...fixture, sessions: [], pageMessages: () => ({ items: [] }) })
  await page.addInitScript(() => localStorage.setItem("dockapi.accessToken", "case-layout-test-token"))
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url())
    const json = (data: unknown) =>
      route.fulfill({ json: { code: 200, message: "ok", data }, headers: { "access-control-allow-origin": "*" } })
    if (url.pathname === "/api/user/profile")
      return json({
        user: { id: 999, name: "布局测试", phone: "", enabled: true, casePublishAllowed: canManage },
        workspace: { id: 999, workspaceKey: "test", directoryPath: fixture.directory, status: "READY" },
      })
    if (url.pathname === "/api/dockapi/cases/overview") return json({ groups })
    if (url.pathname.endsWith("/preview-ticket"))
      return json({
        baseUrl: "http://localhost:8081/api/dockapi/case-preview/card-test",
        expiresAt: "2099-01-01T00:00:00Z",
      })
    if (url.pathname === "/api/dockapi/cases") {
      listRequests.push(url.searchParams)
      const category = url.searchParams.get("category")
      const keyword = url.searchParams.get("keyword") ?? ""
      const items = groups
        .filter((group) => !category || group.category === category)
        .flatMap((group) => group.items)
        .filter((item) => item.caseName.includes(keyword) || item.caseTag.includes(keyword))
      return json({ items, total: items.length, page: 1, size: 24 })
    }
    const detail = groups
      .flatMap((group) => group.items)
      .find((item) => url.pathname === `/api/dockapi/cases/${item.caseCode}`)
    if (detail)
      return json({
        ...detail,
        query: detail.caseName,
        rootAgent: "build",
        snapshotVersion: "test",
        snapshotBytes: 0,
        artifactBytes: 0,
      })
    if (url.pathname.endsWith("/snapshot"))
      return route.fulfill({
        json: {
          schemaVersion: 1,
          caseCode: "deep-research-1",
          capturedAt: "2026-09-09",
          rootSessionId: "case-root",
          query: "案例测试",
          agentType: "deepinsight",
          rootAgent: "build",
          artifacts: [],
          sessions: [
            {
              session: {
                id: "case-root",
                slug: "case-root",
                projectID: "test",
                directory: "case://workspace",
                title: "案例测试",
                agent: "build",
                version: "test",
                time: { created: 1000, updated: 2000 },
              },
              status: { type: "idle" },
              messages: [],
            },
          ],
        },
        headers: { "access-control-allow-origin": "*" },
      })
    return json([])
  })
  await page.goto("/cases")
  await expect(page.locator('[data-case-group="deep-research"] [data-case-card]')).toHaveCount(4)
  if ((page.viewportSize()?.width ?? 1440) < 640) {
    await page.getByRole("button", { name: "隐藏左栏", exact: true }).click()
    await expect
      .poll(() => page.locator('[data-page="cmcc-cases"]').evaluate((element) => element.clientWidth))
      .toBeGreaterThan(380)
  }
  return { listRequests, groups }
}

async function boxes(cards: Locator) {
  return cards.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect()
      return { left: rect.left, right: rect.right, width: rect.width, height: rect.height, top: rect.top }
    }),
  )
}

async function expectCompactCards(page: Page) {
  const cards = page.locator("[data-case-card]")
  expect(await cards.count()).toBeGreaterThan(0)
  await expect(cards.getByText("2026-09-09", { exact: true })).toHaveCount(0)
  await expect(cards.getByText(/报告\s+1\.2万字/)).toHaveCount(0)
  expect(
    await cards.evaluateAll((elements) =>
      elements.every((element) => {
        const button = element.querySelector(":scope > button")!
        const frame = button.firstElementChild!
        return (
          button.children.length === 1 &&
          Math.abs(button.getBoundingClientRect().height - frame.getBoundingClientRect().height) < 1
        )
      }),
    ),
  ).toBe(true)
}

for (const width of [1440, 1280, 768, 767, 390]) {
  test(`science four-card group aligns with deep research at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 1000 })
    const errors: string[] = []
    page.on("pageerror", (error) => errors.push(error.message))
    await prepare(page)
    await expectCompactCards(page)
    const general = page.locator('[data-case-group="deep-research"]')
    const science = page.locator('[data-case-group="science"]')
    await expect(science.locator("[data-case-card]")).toHaveCount(4)
    const a = await boxes(general.locator("[data-case-card]"))
    const b = await boxes(science.locator("[data-case-card]"))
    const columns = width < 640 ? 1 : width < 768 ? 2 : 4
    expect(new Set(b.map((box) => Math.round(box.top))).size).toBe(4 / columns)
    for (let index = 0; index < 4; index += 1) {
      expect(b[index].left).toBeCloseTo(a[index].left, 0)
      expect(b[index].right).toBeCloseTo(a[index].right, 0)
      expect(b[index].width).toBeCloseTo(a[index].width, 0)
      expect(b[index].height).toBeCloseTo(a[index].height, 0)
    }
    const generalBox = await general.boundingBox()
    const scienceBox = await science.boundingBox()
    expect(scienceBox!.x).toBeCloseTo(generalBox!.x, 0)
    expect(scienceBox!.width).toBeCloseTo(generalBox!.width, 0)
    await expect(science.locator('use[href$="#background-science"]')).toHaveCount(1)
    await expect(science.getByRole("heading", { name: "AI+科研" })).toHaveCount(1)
    await expect(page.locator('[data-case-group="finance"] [data-case-card]')).toHaveCount(2)
    if (width >= 768) {
      const finance = await page.locator('[data-case-group="finance"]').boundingBox()
      expect(finance!.width).toBeLessThan(scienceBox!.width * 0.6)
    }
    await science.scrollIntoViewIfNeeded()
    await expect
      .poll(() =>
        science.locator("img").evaluateAll((images) => images.every((img) => img.complete && img.naturalWidth > 0)),
      )
      .toBe(true)
    expect(
      await page.locator('[data-page="cmcc-cases"]').evaluate((element) => element.scrollWidth <= element.clientWidth),
    ).toBe(true)
    expect(errors).toEqual([])
    await page.screenshot({ path: info.outputPath(`science-four-cards-${width}.png`) })
  })
}

for (const count of [0, 1, 2, 3]) {
  test(`science overview uses only the ${count} available cases`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await prepare(page, count)
    const science = page.locator('[data-case-group="science"]')
    await expect(science.locator("[data-case-card]")).toHaveCount(count)
    if (!count) return expect(science).toHaveCount(0)
    const generalCards = await boxes(page.locator('[data-case-group="deep-research"] [data-case-card]'))
    const scienceCards = await boxes(science.locator("[data-case-card]"))
    expect(scienceCards[0].width).toBeCloseTo(generalCards[0].width, 0)
    const section = await science.boundingBox()
    expect(section!.x + section!.width - scienceCards.at(-1)!.right).toBeCloseTo(28, 0)
  })
}

test("science view-more still selects the complete science list", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  const { listRequests } = await prepare(page)
  await page.locator('[data-case-group="science"]').getByRole("button", { name: "查看更多" }).click()
  await expect(page.locator('[data-case-group="science"]')).toHaveCount(0)
  await expect(page.locator("[data-case-card]")).toHaveCount(4)
  expect(listRequests).toHaveLength(1)
  expect(listRequests[0].get("category")).toBe("science")
  await expectCompactCards(page)
})

test("seven category badges use history colors while preserving case labels", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await prepare(page)
  const rgb = (hex: string) =>
    `rgb(${[1, 3, 5].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)).join(", ")})`
  for (const category of CMCC_CASE_CATEGORIES) {
    const badge = page.locator(`[data-case-group="${category.code}"] [data-slot="case-category-label"]`).first()
    const product = cmccHistoryProduct(category.agentType)!
    await expect(badge).toHaveText(category.label)
    await expect(badge).toHaveAttribute("title", category.label)
    await expect(badge).toHaveCSS("color", rgb(product.textColor))
    await expect(badge).toHaveCSS("background-color", rgb(product.backgroundColor))
    await expect(badge).toHaveCSS("border-top-color", rgb(product.borderColor))
    await expect(badge).toHaveCSS("border-top-width", "1px")
    await expect(badge).toHaveCSS("font-size", "11px")
    await expect(badge).toHaveCSS("padding-left", "6px")
    await expect(badge).toHaveCSS("padding-top", "2px")
    await expect(badge).toHaveCSS("box-shadow", "none")
    await expect(badge).toHaveCSS("backdrop-filter", "none")
    expect(
      await badge.evaluate((element) => Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) > 1000),
    ).toBe(true)
  }
  await expect(
    page.locator('[data-case-group="deep-research"] [data-slot="case-category-label"]').first(),
  ).not.toHaveText("通用对话")
  await expectCompactCards(page)
  await page.locator('[data-case-group="science"]').scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath("case-colored-badges.png") })
})

test("search, sorting and date filters remain available without card metadata", async ({ page }) => {
  const { listRequests } = await prepare(page)
  await page.getByPlaceholder("搜索案例行业或研究主题").fill("科研")
  await expect.poll(() => listRequests.at(-1)?.get("keyword")).toBe("科研")
  await expect(page.locator("[data-case-card]")).toHaveCount(4)
  await expectCompactCards(page)
  await page.getByRole("button", { name: "筛选案例", exact: true }).click()
  await page.getByRole("button", { name: "最早发布", exact: true }).click()
  await page.locator('input[type="date"]').nth(0).fill("2026-09-01")
  await page.locator('input[type="date"]').nth(1).fill("2026-09-09")
  await expect
    .poll(() => ({
      sort: listRequests.at(-1)?.get("sort"),
      from: listRequests.at(-1)?.get("from"),
      to: listRequests.at(-1)?.get("to"),
    }))
    .toEqual({ sort: "oldest", from: "2026-09-01", to: "2026-09-09" })
  await page.getByRole("button", { name: "完成", exact: true }).click()
  await expect(page.locator('input[type="date"]')).toHaveCount(0)
  await expectCompactCards(page)
})

test("delete entry and opening the case retain their existing actions", async ({ page }) => {
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await prepare(page, 4, true)
  await page.getByRole("button", { name: "删除案例 通用深度研究案例 1", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "删除案例", exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/cases$/)
  await page.getByRole("button", { name: "取消", exact: true }).click()
  await expect(page.getByRole("dialog")).toHaveCount(0)
  await page.locator('[data-case-card="deep-research-1"] > button').first().click()
  await expect(page).toHaveURL(/\/cases\/deep-research-1$/)
  await expect(page.getByText("通用深度研究案例 1", { exact: true }).first()).toBeVisible()
  expect(errors).toEqual([])
})

test("list does not load case detail chunks and returning displays cache before revalidation", async ({ page }) => {
  const requested: string[] = []
  page.on("request", (request) => requested.push(request.url()))
  const { groups } = await prepare(page)
  expect(requested.some((url) => /case-detail|\/cases\/views\//.test(url))).toBe(false)
  const snapshotRequest = page.waitForRequest((request) => new URL(request.url()).pathname.endsWith("/snapshot"))
  await page.locator('[data-case-card="deep-research-1"] > button').first().click()
  expect(new URL((await snapshotRequest).url()).searchParams.get("delivery")).toBe("1")
  await expect(page.getByRole("button", { name: "返回案例库", exact: true })).toBeVisible()

  const pending = Promise.withResolvers<void>()
  let revalidating = false
  await page.route("**/api/dockapi/cases/overview", async (route) => {
    revalidating = true
    await pending.promise
    await route.fulfill({
      json: { code: 200, data: { groups: groups.map((group) => group.category === "deep-research" ? { ...group, items: group.items.slice(1) } : group) } },
      headers: { "access-control-allow-origin": "*" },
    })
  })
  try {
    await page.getByRole("button", { name: "返回案例库", exact: true }).click()
    await expect.poll(() => revalidating).toBe(true)
    await expect(page.locator('[data-case-group="deep-research"] [data-case-card]')).toHaveCount(4)
    await expect(page.locator('[data-page="cmcc-cases"] .animate-pulse')).toHaveCount(0)
  } finally {
    pending.resolve()
  }
  await expect(page.locator('[data-case-group="deep-research"] [data-case-card]')).toHaveCount(3)
  await expect(page.locator('[data-case-card="deep-research-1"]')).toHaveCount(0)
})
