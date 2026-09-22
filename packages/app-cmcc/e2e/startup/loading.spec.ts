import { expect, test, type Page } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"

const loading = (page: Page) => page.getByRole("status", { name: "系统加载中" })

async function imageReady(page: Page) {
  return page.locator(".app-loading-scene").evaluate(async (scene) => {
    const image = new Image()
    image.src = getComputedStyle(scene).backgroundImage.slice(5, -2)
    await image.decode()
    return { width: image.naturalWidth, height: image.naturalHeight }
  })
}

for (const viewport of [
  { width: 1672, height: 941 },
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 844, height: 390 },
]) {
  test(`static startup screen works before JavaScript at ${viewport.width}x${viewport.height}`, async ({
    page,
  }, info) => {
    await page.setViewportSize(viewport)
    await page.route("**/assets/*.js", (route) => route.abort())
    await page.goto("/app")
    await expect(loading(page)).toBeVisible()
    expect(await imageReady(page)).toEqual({ width: 1672, height: 941 })
    await expect(loading(page)).toHaveCSS("position", "fixed")
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
    const box = await page.locator(".app-loading-dots").boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThan(0)
    expect(box!.x + box!.width).toBeLessThan(viewport.width)
    expect(box!.y + box!.height).toBeLessThan(viewport.height)
    const opacity = () =>
      page
        .locator(".app-loading-dots > span")
        .first()
        .evaluate((dot) => getComputedStyle(dot, "::after").opacity)
    const first = await opacity()
    await expect.poll(opacity).not.toBe(first)
    await page.screenshot({ path: info.outputPath("startup.png") })
  })
}

test("reduced motion keeps the three dots still", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.route("**/assets/*.js", (route) => route.abort())
  await page.goto("/app")
  expect(
    await page
      .locator(".app-loading-dots > span")
      .evaluateAll((dots) => dots.map((dot) => getComputedStyle(dot, "::after").animationName)),
  ).toEqual(["none", "none", "none"])
})

test("the static screen does not cover the disabled-JavaScript message", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, baseURL })
  const page = await context.newPage()
  await page.goto("/app")
  await expect(loading(page)).toBeHidden()
  await expect(page.locator("noscript")).toBeVisible()
  expect(await page.locator("noscript").textContent()).toContain("You need to enable JavaScript to run this app.")
  await context.close()
})

test("authentication loading replaces the static screen and releases it on expiry", async ({ page }) => {
  const response = Promise.withResolvers<void>()
  await page.addInitScript(() => localStorage.setItem("dockapi.accessToken", "startup-test-token"))
  await page.route("**/api/user/profile", async (route) => {
    await response.promise
    await route.fulfill({ status: 401, json: { code: 401, message: "expired", data: null } })
  })
  const request = page.waitForRequest("**/api/user/profile")
  await page.goto("/app", { waitUntil: "domcontentloaded" })
  await request
  await expect(page.locator("#app-startup-loading")).toHaveCount(0)
  await expect(loading(page)).toHaveCount(1)
  await expect(loading(page)).toBeVisible()
  expect(await imageReady(page)).toEqual({ width: 1672, height: 941 })
  response.resolve()
  await expect(page.getByRole("heading", { name: "欢迎登录" })).toBeVisible()
  await expect(loading(page)).toHaveCount(0)
})

for (const healthy of [true, false]) {
  test(`connection loading releases to ${healthy ? "the homepage" : "connection errors"}`, async ({ page }) => {
    const response = Promise.withResolvers<void>()
    const directory = "C:/startup-test"
    await page.addInitScript(() => localStorage.setItem("dockapi.accessToken", "startup-test-token"))
    await mockOpenCodeServer(page, {
      directory,
      project: { id: "startup-test", worktree: directory, time: { created: 1 } },
      provider: { all: [], connected: [], default: {} },
      sessions: [],
      pageMessages: () => ({ items: [] }),
    })
    await page.route("**/api/user/profile", (route) =>
      route.fulfill({
        json: {
          code: 200,
          data: {
            user: { id: 1, name: "Startup test", phone: "test", enabled: true, casePublishAllowed: false },
            workspace: { id: 1, workspaceKey: "startup-test", directoryPath: directory, status: "READY" },
          },
        },
      }),
    )
    await page.route("**/api/dockapi/sessions", (route) => route.fulfill({ json: { code: 200, data: [] } }))
    await page.route("**/global/health", async (route) => {
      await response.promise
      await route.fulfill({ json: { healthy } })
    })
    await page.route("**/file/directory*", (route) => route.fulfill({ json: { path: directory } }))
    const request = page.waitForRequest("**/global/health")
    await page.goto("/app", { waitUntil: "domcontentloaded" })
    await request
    await expect(page.locator("#app-startup-loading")).toHaveCount(0)
    await expect(loading(page)).toHaveCount(1)
    await expect(loading(page)).toBeVisible()
    response.resolve()
    await expect(loading(page)).toHaveCount(0)
    if (healthy) {
      await expect(page.getByText("历史任务", { exact: true })).toBeVisible()
      await expect(page.getByText("您的智能研究助理，一键式深度研究与自动化科研，赋能AI+产业洞察")).toBeVisible()
      return
    }
    await expect(page.getByText(/retrying|重试/i)).toBeVisible()
  })
}
