import { expect, test, type Page } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { homeDirectory, setupHomePage } from "./home-fixture"

const loading = (page: Page) => page.getByRole("status", { name: "系统加载中" })

async function imageReady(page: Page) {
  return page.locator(".app-loading-scene").evaluate(async (scene) => {
    const image = new Image()
    image.src = getComputedStyle(scene).backgroundImage.slice(5, -2)
    await image.decode()
    return { width: image.naturalWidth, height: image.naturalHeight }
  })
}

async function artwork(page: Page) {
  await expect(loading(page)).toHaveCSS("position", "fixed")
  await expect(page.locator(".app-loading-title")).toHaveAttribute("aria-label", "DeepInsight")
  await expect(page.locator(".app-loading-label")).toHaveAttribute("aria-label", "系统加载中...")
  expect(await page.locator(".app-loading-title > span").allTextContents()).toEqual([..."DeepInsight"])
  expect(await page.locator(".app-loading-label > span").allTextContents()).toEqual([..."系统加载中", "..."])
  await expect(page.locator(".app-loading-title")).toHaveCSS("font-weight", "500")
  await expect(page.locator(".app-loading-logo")).toHaveAttribute("src", "/brand/startup-loading.svg")
  return page.locator(".app-loading-scene").evaluate(async (scene) => {
    const logo = scene.querySelector<HTMLImageElement>(".app-loading-logo")!
    await logo.decode()
    const canvas = document.createElement("canvas")
    canvas.width = logo.naturalWidth
    canvas.height = logo.naturalHeight
    const context = canvas.getContext("2d")!
    context.drawImage(logo, 0, 0)
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
    return {
      source: logo.currentSrc,
      natural: [logo.naturalWidth, logo.naturalHeight],
      colored: pixels.filter((value, index) => index % 4 === 3 && value > 0).length,
      elements: [...scene.children].map((element) => {
        const box = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return {
          className: element.className,
          box: { x: box.x, y: box.y, width: box.width, height: box.height },
          font: style.font,
          filter: style.filter,
        }
      }),
    }
  })
}

for (const viewport of [
  { width: 1672, height: 941 },
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 568 },
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
    const rendered = await artwork(page)
    expect(rendered.natural).toEqual([262, 294])
    expect(rendered.colored).toBeGreaterThan(20_000)
    expect(rendered.elements.every((element) => element.filter === "none")).toBe(true)
    const [logo, title, dots, label] = rendered.elements
    expect(title.box.width).toBe(viewport.height <= 520 ? 152 : 244)
    expect(label.box.width).toBe(viewport.height <= 520 ? 112 : 144)
    expect(logo.box.y + logo.box.height).toBeLessThan(title.box.y)
    expect(title.box.y + title.box.height).toBeLessThan(dots.box.y)
    expect(dots.box.y + dots.box.height).toBeLessThan(label.box.y)
    const text = await page.locator(".app-loading-title, .app-loading-label").evaluateAll((elements) =>
      elements.map((element) => {
        const range = document.createRange()
        range.selectNodeContents(element)
        const box = range.getBoundingClientRect()
        return { x: box.x, right: box.right, y: box.y, bottom: box.bottom }
      }),
    )
    for (const box of text) {
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.right).toBeLessThanOrEqual(viewport.width)
      expect(box.y).toBeGreaterThanOrEqual(0)
      expect(box.bottom).toBeLessThanOrEqual(viewport.height)
    }
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

test("the background contains no baked-in logo, wording or loading dots", async ({ page }, info) => {
  await page.route("**/assets/*.js", (route) => route.abort())
  await page.route("**/brand/startup-loading.svg", (route) => route.abort())
  await page.goto("/app")
  await expect(loading(page)).toBeVisible()
  const dark = await page.locator(".app-loading-scene").evaluate(async (scene) => {
    const image = new Image()
    image.src = getComputedStyle(scene).backgroundImage.slice(5, -2)
    await image.decode()
    const canvas = document.createElement("canvas")
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    const context = canvas.getContext("2d")!
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(700, 285, 280, 370).data
    return pixels.filter((value, index) => index % 4 !== 3 && value < 210).length
  })
  expect(dark).toBe(0)
  expect(await page.locator(".app-loading-title > span").allTextContents()).toEqual([..."DeepInsight"])
  expect(await page.locator(".app-loading-label > span").allTextContents()).toEqual([..."系统加载中", "..."])
  await page.screenshot({ path: info.outputPath("without-logo.png") })
})

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`static and application loading share artwork without a second logo request at ${viewport.width}`, async ({
    browser,
    baseURL,
  }, info) => {
    const context = await browser.newContext({ baseURL, viewport, deviceScaleFactor: 2, reducedMotion: "reduce" })
    const page = await context.newPage()
    const scripts = Promise.withResolvers<void>()
    const profile = Promise.withResolvers<void>()
    const images: string[] = []
    page.on("request", (request) => {
      if (request.resourceType() === "image") images.push(new URL(request.url()).pathname)
    })
    await page.addInitScript(() => localStorage.setItem("dockapi.accessToken", "startup-test-token"))
    await page.route("**/assets/*.js", async (route) => {
      await scripts.promise
      await route.fallback()
    })
    await page.route("**/api/user/profile", async (route) => {
      await profile.promise
      await route.fulfill({ status: 401, json: { code: 401, message: "expired", data: null } })
    })
    try {
      await page.goto("/app", { waitUntil: "commit" })
      await expect(page.locator("#app-startup-loading")).toBeVisible()
      const before = await artwork(page)
      expect(before.colored).toBeGreaterThan(20_000)
      await info.attach("static-artwork.json", { body: JSON.stringify(before), contentType: "application/json" })
      scripts.resolve()
      await expect(page.locator("#app-startup-loading")).toHaveCount(0)
      await expect(loading(page)).toHaveCount(1)
      await expect(loading(page)).toBeVisible()
      expect(await artwork(page)).toEqual(before)
      expect(images.filter((path) => path === "/brand/startup-loading.svg")).toHaveLength(1)
      expect(images.some((path) => /startup-loading-logo.*\.webp/.test(path))).toBe(false)
      await page.screenshot({ path: info.outputPath("application-loading.png") })
      profile.resolve()
      await expect(page.getByRole("heading", { name: "欢迎登录" })).toBeVisible()
      await expect(loading(page)).toHaveCount(0)
    } finally {
      scripts.resolve()
      profile.resolve()
      await context.close()
    }
  })
}

for (const width of [1440, 390]) {
  test(`password login keeps vector artwork until the homepage is ready at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await setupHomePage(page)
    await page.addInitScript(() => localStorage.removeItem("dockapi.accessToken"))
    await page.route("**/api/auth/login", (route) =>
      route.fulfill({
        json: {
          code: 200,
          data: {
            accessToken: "startup-login-token",
            refreshToken: "startup-refresh-token",
            user: { id: 1, name: "Startup login test", phone: "test", enabled: true, casePublishAllowed: false },
            workspace: { id: 1, workspaceKey: "home-sizing-test", directoryPath: homeDirectory, status: "READY" },
          },
        },
      }),
    )
    const health = Promise.withResolvers<void>()
    await page.route("**/global/health", async (route) => {
      await health.promise
      await route.fulfill({ json: { healthy: true } })
    })
    try {
      await page.goto("/app")
      await page.getByRole("textbox", { name: "手机号" }).fill("test")
      await page.getByLabel("密码", { exact: true }).fill("test-password")
      await page.getByRole("button", { name: "登录", exact: true }).click()
      await expect(loading(page)).toHaveCount(1)
      expect((await artwork(page)).natural).toEqual([262, 294])
      await page.screenshot({ path: info.outputPath("password-login-loading.png") })
      health.resolve()
      await expect(loading(page)).toHaveCount(0)
      await expect(page.getByRole("heading", { name: "DeepInsight深度洞察", exact: true })).toBeVisible()
      await expect(page.locator('[data-component="prompt-input"]')).toBeVisible()
    } finally {
      health.resolve()
    }
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
