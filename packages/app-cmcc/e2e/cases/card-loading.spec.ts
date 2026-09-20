import { expect, test, type Page } from "@playwright/test"
import { readFileSync } from "node:fs"
import { fixture } from "../smoke/session-timeline.fixture"
import { mockOpenCodeServer } from "../utils/mock-server"

test.use({ channel: process.env.PLAYWRIGHT_CHANNEL, video: "off" })

async function prepare(page: Page) {
  const base = process.env.PLAYWRIGHT_BASE_URL!
  const items = ["one", "two"].map((id) => ({
    caseCode: id,
    caseName: `案例 ${id}`,
    caseTag: "通用深度研究",
    category: "deep-research",
    categoryLabel: "通用深度研究",
    agentType: "deepinsight",
    rootAgent: id === "two" ? "deepinsight/deepinsight-team-lead" : "build",
    coverUrl: `${base}/__test__/case-cover.png`,
    reportCharCount: 10,
    publishedAt: "2026-09-17",
    query: `案例 ${id}`,
    snapshotVersion: "v1",
    snapshotBytes: 20,
    artifactBytes: 0,
  }))
  const counts = new Map<string, number>()
  const gates = new Map<string, { waiting: PromiseWithResolvers<void>; handled: PromiseWithResolvers<void> }>()
  const failures = new Set<string>()
  const errors: string[] = []
  let userId = 999
  page.on("pageerror", (error) => errors.push(error.message))
  await mockOpenCodeServer(page, { ...fixture, sessions: [], pageMessages: () => ({ items: [] }) })
  await page.route("**/__test__/case-cover.png", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: readFileSync(new URL("./fixtures/case-cover.png", import.meta.url)),
    }),
  )
  await page.addInitScript(() => {
    if (window === window.top) localStorage.setItem("dockapi.accessToken", "case-loading-test")
  })
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    counts.set(path, (counts.get(path) ?? 0) + 1)
    const json = (data: unknown) =>
      route.fulfill({ json: { code: 200, message: "ok", data }, headers: { "access-control-allow-origin": "*" } })
    if (path === "/api/user/profile")
      return json({
        user: { id: userId, name: `测试用户 ${userId}`, phone: "", enabled: true, casePublishAllowed: true },
        workspace: { id: userId, workspaceKey: "test", directoryPath: fixture.directory, status: "READY" },
      })
    if (path === "/api/dockapi/cases/overview")
      return json({ groups: [{ category: "deep-research", label: "通用深度研究", items }] })
    if (path === "/api/dockapi/cases") return json({ items, total: items.length, page: 1, size: 24 })
    if (path.endsWith("/preview-ticket"))
      return json({ baseUrl: `${base}/api/dockapi/case-preview/test`, expiresAt: "2099-01-01T00:00:00Z" })
    const item = items.find((item) => path === `/api/dockapi/cases/${item.caseCode}`)
    if (item) return json(item)
    const code = /^\/api\/dockapi\/cases\/([^/]+)\/snapshot$/.exec(path)?.[1]
    if (code) {
      const agent = items.find((item) => item.caseCode === code)!.rootAgent
      const gate = gates.get(code)
      if (gate) await gate.waiting.promise
      try {
        if (failures.delete(code))
          return await route.fulfill({ status: 500, json: { code: 500, message: "测试加载失败", data: null } })
        return await route.fulfill({
          json: {
            schemaVersion: 1,
            caseCode: code,
            capturedAt: "2026-09-17T00:00:00Z",
            rootSessionId: `root-${code}`,
            query: `案例 ${code}`,
            agentType: "deepinsight",
            rootAgent: agent,
            artifacts: [],
            sessions: [
              {
                session: {
                  id: `root-${code}`,
                  slug: code,
                  projectID: "test",
                  directory: "case://workspace",
                  title: `案例 ${code}`,
                  agent,
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
      } finally {
        gate?.handled.resolve()
      }
    }
    return json([])
  })
  await page.goto("/cases")
  await expect(page.locator("[data-case-card]")).toHaveCount(2)
  return {
    errors,
    counts,
    snapshots: (code: string) => counts.get(`/api/dockapi/cases/${code}/snapshot`) ?? 0,
    hold(code: string) {
      const gate = { waiting: Promise.withResolvers<void>(), handled: Promise.withResolvers<void>() }
      gates.set(code, gate)
      return async () => {
        gate.waiting.resolve()
        await gate.handled.promise
      }
    },
    failNext(code: string) {
      failures.add(code)
    },
    async switchUser() {
      userId += 1
      await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: "dockapi.accessToken" })))
    },
  }
}

for (const width of [1440, 390])
  test(`card progress keeps its cover and dimensions at ${width}px until the snapshot is ready`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.emulateMedia({ reducedMotion: "no-preference" })
    const state = await prepare(page)
    if (width < 640) {
      await page.getByRole("button", { name: "隐藏左栏", exact: true }).click()
      await expect
        .poll(() => page.locator('[data-page="cmcc-cases"]').evaluate((element) => element.clientWidth))
        .toBeGreaterThan(380)
    }
    const release = state.hold("one")
    try {
      const card = page.locator('[data-case-card="one"]')
      const before = await card.boundingBox()
      await card.getByRole("button", { name: "案例 one", exact: true }).click()
      await expect(card.getByRole("progressbar")).toBeVisible()
      await expect(page).toHaveURL(/\/cases$/)
      await expect(page.getByRole("dialog")).toHaveCount(0)
      await expect(page.locator('[data-case-card="two"] [data-case-loading]')).toHaveCount(0)
      await expect(card.locator("img")).toBeVisible()
      await expect
        .poll(() => card.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBeGreaterThan(0)
      const after = await card.boundingBox()
      expect(after!.width).toBeCloseTo(before!.width, 0)
      expect(after!.height).toBeCloseTo(before!.height, 0)
      await card.getByRole("button", { name: "案例 one", exact: true }).click()
      expect(state.snapshots("one")).toBe(1)
      const bar = card.locator(".case-card-loading-bar")
      const transform = await bar.evaluate((element) => getComputedStyle(element).transform)
      await expect.poll(() => bar.evaluate((element) => getComputedStyle(element).transform)).not.toBe(transform)
      await page.screenshot({ path: info.outputPath(`case-card-loading-${width}.png`), fullPage: true })
      await release()
      await expect(page).toHaveURL(/\/cases\/one$/)
      await expect(page.getByRole("button", { name: "返回案例库", exact: true })).toBeVisible()
      expect(state.snapshots("one")).toBe(1)
      expect(state.counts.get("/api/dockapi/cases/one")).toBe(1)
      expect(state.counts.get("/api/dockapi/cases/one/preview-ticket")).toBe(1)
      await page.reload()
      await expect(page.getByRole("button", { name: "返回案例库", exact: true })).toBeVisible()
      expect(state.snapshots("one")).toBe(2)
      expect(state.errors).toEqual([])
    } finally {
      await release()
    }
  })

test("cancel stops the request and a late result cannot navigate", async ({ page }) => {
  const state = await prepare(page)
  const release = state.hold("one")
  try {
    const card = page.locator('[data-case-card="one"]')
    await card.getByRole("button", { name: "案例 one", exact: true }).click()
    await expect.poll(() => state.snapshots("one")).toBe(1)
    await card.getByRole("button", { name: "取消加载", exact: true }).click()
    await expect(card.locator("[data-case-loading]")).toHaveCount(0)
    await release()
    await expect(page).toHaveURL(/\/cases$/)
    await expect(card.locator('[data-slot="case-category-label"]')).toBeVisible()
    expect(state.errors).toEqual([])
  } finally {
    await release()
  }
})

test("failure stays on the card and retry opens a single freshly loaded snapshot", async ({ page }) => {
  const state = await prepare(page)
  state.failNext("one")
  const card = page.locator('[data-case-card="one"]')
  await card.getByRole("button", { name: "案例 one", exact: true }).click()
  await expect(card.getByRole("alert")).toHaveText("加载失败，请重试")
  await expect(page).toHaveURL(/\/cases$/)
  await card.getByRole("button", { name: "重试", exact: true }).click()
  await expect(page).toHaveURL(/\/cases\/one$/)
  await expect(page.getByRole("button", { name: "返回案例库", exact: true })).toBeVisible()
  expect(state.snapshots("one")).toBe(2)
  expect(state.errors).toEqual([])
})

test("switching cards cannot open the previous case after it finishes", async ({ page }) => {
  const state = await prepare(page)
  const release = state.hold("one")
  try {
    await page.getByRole("button", { name: "案例 one", exact: true }).click()
    await expect.poll(() => state.snapshots("one")).toBe(1)
    await page.getByRole("button", { name: "案例 two", exact: true }).click()
    await expect(page).toHaveURL(/\/cases\/two$/)
    await release()
    await expect(page).toHaveURL(/\/cases\/two$/)
    expect(state.snapshots("two")).toBe(1)
  } finally {
    await release()
  }
})

test("search and authorization changes cancel the pending card without late navigation", async ({ page }) => {
  const state = await prepare(page)
  const release = state.hold("one")
  try {
    await page.getByRole("button", { name: "案例 one", exact: true }).click()
    await expect.poll(() => state.snapshots("one")).toBe(1)
    await page.getByPlaceholder("搜索案例行业或研究主题").fill("案例")
    await expect(page.locator("[data-case-loading]")).toHaveCount(0)
    await release()
    await expect(page).toHaveURL(/\/cases$/)
  } finally {
    await release()
  }
  const releaseNext = state.hold("two")
  try {
    await page.getByRole("button", { name: "案例 two", exact: true }).click()
    await expect.poll(() => state.snapshots("two")).toBe(1)
    await state.switchUser()
    await expect(page.locator("[data-case-loading]")).toHaveCount(0)
    await releaseNext()
    await expect(page).toHaveURL(/\/cases$/)
  } finally {
    await releaseNext()
  }
  expect(state.errors).toEqual([])
})

test("filtered cards support reduced motion and Escape cancellation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  const state = await prepare(page)
  await page
    .getByRole("navigation", { name: "案例分类" })
    .getByRole("button", { name: "通用深度研究", exact: true })
    .click()
  await expect(page.locator("[data-case-group]")).toHaveCount(0)
  const release = state.hold("one")
  try {
    await page.getByRole("button", { name: "案例 one", exact: true }).click()
    await expect(page.getByRole("progressbar")).toBeVisible()
    await expect.poll(() => state.snapshots("one")).toBe(1)
    await expect(page.locator(".case-card-loading-bar")).toHaveCSS("animation-name", "none")
    await page.keyboard.press("Escape")
    await release()
    await expect(page.locator("[data-case-loading]")).toHaveCount(0)
    await expect(page).toHaveURL(/\/cases$/)
  } finally {
    await release()
  }
})

test("the card waits for its dedicated view module, not just the JSON responses", async ({ page }) => {
  const state = await prepare(page)
  const module = Promise.withResolvers<void>()
  let loadingModule = false
  await page.route("**/deep-research-*.js", async (route) => {
    loadingModule = true
    await module.promise
    await route.continue()
  })
  try {
    await page.getByRole("button", { name: "案例 two", exact: true }).click()
    await expect.poll(() => loadingModule).toBe(true)
    await expect(page).toHaveURL(/\/cases$/)
    await expect(page.locator('[data-case-card="two"]').getByRole("progressbar")).toBeVisible()
    module.resolve()
    await expect(page).toHaveURL(/\/cases\/two$/)
    await expect(page.getByRole("button", { name: "分析团队", exact: true })).toBeVisible()
    expect(state.snapshots("two")).toBe(1)
    expect(state.errors).toEqual([])
  } finally {
    module.resolve()
  }
})

test("an account change while the view module loads discards the already downloaded data", async ({ page }) => {
  const state = await prepare(page)
  const module = Promise.withResolvers<void>()
  const finished = Promise.withResolvers<void>()
  let loadingModule = false
  await page.route("**/deep-research-*.js", async (route) => {
    loadingModule = true
    await module.promise
    await route.continue()
    finished.resolve()
  })
  try {
    await page.getByRole("button", { name: "案例 two", exact: true }).click()
    await expect.poll(() => loadingModule).toBe(true)
    await state.switchUser()
    await expect(page.locator("[data-case-loading]")).toHaveCount(0)
    module.resolve()
    await finished.promise
    await expect(page).toHaveURL(/\/cases$/)
    expect(state.errors).toEqual([])
  } finally {
    module.resolve()
  }
})

test("leaving the case list cannot be undone by a late snapshot response", async ({ page }) => {
  const state = await prepare(page)
  await page.route("**/file/directory*", (route) => route.fulfill({ json: {} }))
  const release = state.hold("one")
  try {
    await page.getByRole("button", { name: "案例 one", exact: true }).click()
    await expect.poll(() => state.snapshots("one")).toBe(1)
    await page.getByRole("button", { name: "新对话", exact: true }).first().click()
    await expect(page).toHaveURL(/\/new-session\?/)
    await release()
    await expect(page).toHaveURL(/\/new-session\?/)
    expect(state.errors).toEqual([])
  } finally {
    await release()
  }
})
