import { expect, test, type Page } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { homeDirectory, homeSession, setupHomePage } from "./home-fixture"

test.use({ locale: "zh-CN" })

const heading = (page: Page) => page.getByRole("heading", { name: "DeepInsight深度洞察", exact: true })
const editor = (page: Page) => page.locator('[data-component="prompt-input"]')
const model = (page: Page) => page.locator('[data-action="prompt-model"]')

async function setup(page: Page) {
  await setupHomePage(page, { models: true })
  await page.route("**/api/dockapi/history?*", (route) => route.fulfill({ json: { code: 200, data: [] } }))
}

function auth(id: number) {
  return {
    accessToken: `home-login-${id}`,
    refreshToken: `home-refresh-${id}`,
    user: { id, name: `Login test ${id}`, phone: "test", enabled: true, casePublishAllowed: false },
    // Deliberately keep the same directory to detect cached data crossing accounts.
    workspace: { id, workspaceKey: "home-sizing-test", directoryPath: homeDirectory, status: "READY" },
  }
}

async function setupLogin(page: Page) {
  await setup(page)
  await page.addInitScript(() => {
    localStorage.removeItem("dockapi.accessToken")
    localStorage.removeItem("dockapi.refreshToken")
  })
  let identity = 0
  await page.route("**/api/auth/login", (route) => route.fulfill({ json: { code: 200, data: auth(++identity) } }))
  await page.route("**/api/auth/logout", (route) => route.fulfill({ json: { code: 200, data: null } }))
  await page.route("**/api/user/profile", (route) => route.fulfill({ json: { code: 200, data: auth(identity) } }))
}

async function login(page: Page) {
  await page.getByRole("textbox", { name: "手机号" }).fill("test")
  await page.getByLabel("密码", { exact: true }).fill("test-password")
  await page.getByRole("button", { name: "登录", exact: true }).click()
}

for (const width of [1440, 390]) {
  test(`homepage remains visible while its route code is loading at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await setup(page)
    const gate = Promise.withResolvers<void>()
    let before: { x: number; y: number; width: number; height: number } | null = null
    await page.route(/\/assets\/new-session-[^/]+\.js$/, async (route) => {
      await gate.promise
      await route.fallback()
    })
    try {
      await page.goto("/app")
      if (width === 390) {
        await page.getByRole("button", { name: "隐藏左栏" }).click()
        await expect
          .poll(() =>
            page
              .locator('aside[aria-label="CMCC conversations"]')
              .evaluate((node) => node.getBoundingClientRect().width),
          )
          .toBeLessThanOrEqual(1)
      }
      await expect(heading(page)).toBeVisible()
      await expect(page.getByRole("status", { name: "正在准备对话" })).toBeVisible()
      await page.evaluate(() => document.fonts.ready)
      before = await page.locator(".cmcc-home-composer").boundingBox()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
      await page.screenshot({ path: info.outputPath("homepage-loading.png") })
    } finally {
      gate.resolve()
    }
    await expect(editor(page)).toBeVisible()
    await expect(heading(page)).toHaveCount(1)
    await expect(page.getByRole("status", { name: "正在准备对话" })).toHaveCount(0)
    await expect.poll(() => page.locator(".cmcc-home-composer").boundingBox()).toEqual(before)
  })
}

test("slow catalogs preserve the home shell and share requests within their scope", async ({ page }, info) => {
  await setup(page)
  const gate = Promise.withResolvers<void>()
  const requests: string[] = []
  await page.route(/\/(provider|agent)(\?|$)/, async (route) => {
    const url = new URL(route.request().url())
    requests.push(`${url.pathname}:${url.searchParams.get("directory") ?? "global"}`)
    await gate.promise
    await route.fallback()
  })
  try {
    await page.goto("/app")
    await expect(heading(page)).toBeVisible()
    await expect(page.getByRole("status", { name: "正在准备对话" })).toBeVisible()
    await expect.poll(() => requests.length).toBe(3)
    await page.screenshot({ path: info.outputPath("catalog-loading.png") })
  } finally {
    gate.resolve()
  }
  await expect(editor(page)).toBeVisible()
  await expect(model(page)).toBeEnabled()
  await expect(model(page)).toContainText("测试模型")
  await page.getByRole("button", { name: "新对话", exact: true }).first().click()
  await expect(editor(page)).toBeVisible()
  await expect(model(page)).toBeEnabled()
  expect(requests.sort()).toEqual([`/agent:${homeDirectory}`, "/provider:global", `/provider:${homeDirectory}`].sort())
})

test("login prefetches only static home code without executing the page", async ({ page }) => {
  await setupLogin(page)
  const scripts: string[] = []
  const protectedRequests: string[] = []
  page.on("request", (request) => {
    const url = new URL(request.url())
    if (/\/assets\/new-session-[^/]+\.js$/.test(url.pathname)) scripts.push(url.pathname)
    if (/^\/(provider|agent|path|project|global\/|api\/dockapi\/)/.test(url.pathname))
      protectedRequests.push(url.pathname)
  })
  await page.goto("/app")
  await expect(page.getByRole("heading", { name: "欢迎登录" })).toBeVisible()
  await expect.poll(() => scripts.length).toBe(1)
  expect(protectedRequests).toEqual([])
  await expect(page.locator('link[rel="prefetch"][href*="new-session-"]')).toHaveCount(1)
  await login(page)
  await expect(editor(page)).toBeVisible()
  await expect(model(page)).toBeEnabled()
  // Playwright routing disables the HTTP cache, so importing may fetch it again here.
  expect(new Set(scripts).size).toBe(1)
})

test("a failed static preload does not prevent logging in", async ({ page }) => {
  await setupLogin(page)
  let attempts = 0
  await page.route(/\/assets\/new-session-[^/]+\.js$/, (route) => {
    attempts++
    return attempts === 1 ? route.abort() : route.fallback()
  })
  await page.goto("/app")
  await expect.poll(() => attempts).toBe(1)
  await expect(page.getByRole("button", { name: "登录", exact: true })).toBeEnabled()
  await login(page)
  await expect(editor(page)).toBeVisible()
  await expect(model(page)).toBeEnabled()
})

test("logging into another account does not reuse the previous model catalog", async ({ page }) => {
  await setupLogin(page)
  const identities: string[] = []
  await page.route(/\/provider(\?|$)/, async (route) => {
    const identity = route.request().headers()["x-dockapi-authorization"]
    identities.push(identity)
    const name = identity === "Bearer home-login-1" ? "GLM Account A" : "GLM Account B"
    await route.fulfill({
      json: {
        all: [
          {
            id: "alibaba-cn",
            name: "Qwen",
            models: { "glm-5.2": { id: "glm-5.2", name, limit: { context: 200000 } } },
          },
        ],
        connected: ["alibaba-cn"],
        default: { "alibaba-cn": "glm-5.2" },
      },
    })
  })
  await page.goto("/app")
  await login(page)
  await expect(model(page)).toContainText("GLM Account A")
  await page.getByRole("button", { name: /Login test 1/ }).click()
  await page.getByRole("menuitem", { name: "退出登录" }).click()
  await expect(page.getByRole("heading", { name: "欢迎登录" })).toBeVisible()
  await login(page)
  await expect(model(page)).toContainText("GLM Account B")
  expect(identities.filter((value) => value === "Bearer home-login-1")).toHaveLength(2)
  expect(identities.filter((value) => value === "Bearer home-login-2")).toHaveLength(2)
})

test("switching workspaces keeps their catalogs separate in the shared cache", async ({ page, baseURL }) => {
  await setup(page)
  const otherDirectory = "C:/home-loading-other"
  const otherSession = { ...homeSession, id: "ses_home_other", directory: otherDirectory, title: "Other workspace" }
  const directories: (string | null)[] = []
  await page.route(/\/provider(\?|$)/, async (route) => {
    const directory = new URL(route.request().url()).searchParams.get("directory")
    directories.push(directory)
    const name = directory === otherDirectory ? "GLM Workspace B" : "GLM Workspace A"
    await route.fulfill({
      json: {
        all: [
          {
            id: "alibaba-cn",
            name: "Qwen",
            models: { "glm-5.2": { id: "glm-5.2", name, limit: { context: 200000 } } },
          },
        ],
        connected: ["alibaba-cn"],
        default: { "alibaba-cn": "glm-5.2" },
      },
    })
  })
  await page.route(`**/session/${otherSession.id}*`, (route) =>
    new URL(route.request().url()).pathname === `/session/${otherSession.id}`
      ? route.fulfill({ json: otherSession })
      : route.fallback(),
  )
  await page.goto("/app")
  await expect(model(page)).toContainText("GLM Workspace A")
  // Navigate within the SPA so the shared cache survives the workspace change.
  await page.evaluate(
    (href) => {
      history.pushState(null, "", href)
      window.dispatchEvent(new PopStateEvent("popstate"))
    },
    `/server/${base64Encode(baseURL!)}/session/${otherSession.id}`,
  )
  await expect(page).toHaveURL(new RegExp(`/session/${otherSession.id}$`))
  await expect(model(page)).toContainText("GLM Workspace B")
  await page.getByRole("button", { name: "新对话", exact: true }).first().click()
  await expect(model(page)).toContainText("GLM Workspace A")
  expect(directories.filter((directory) => directory === null)).toHaveLength(1)
  expect(directories.filter((directory) => directory === homeDirectory)).toHaveLength(1)
  expect(directories.filter((directory) => directory === otherDirectory)).toHaveLength(1)
})

test("the first prompt uses the selected model after initialization", async ({ page }) => {
  await setup(page)
  let created = 0
  const submitted: { model: { modelID: string }; parts: { type: string; text?: string }[] }[] = []
  await page.route("**/api/dockapi/sessions", async (route) => {
    if (route.request().method() !== "POST") return route.fulfill({ json: { code: 200, data: [] } })
    created++
    await route.fulfill({
      json: {
        code: 200,
        data: {
          id: "first-home-prompt",
          agentType: "general",
          directoryPath: homeDirectory,
          openCodeSessionId: homeSession.id,
          openCodeSession: homeSession,
          openCodeStatus: { type: "idle" },
        },
      },
    })
  })
  await page.route(`**/session/${homeSession.id}*`, (route) =>
    new URL(route.request().url()).pathname === `/session/${homeSession.id}`
      ? route.fulfill({ json: homeSession })
      : route.fallback(),
  )
  await page.route(`**/session/${homeSession.id}/prompt_async*`, async (route) => {
    submitted.push(route.request().postDataJSON())
    await route.fulfill({ status: 204 })
  })
  await page.goto("/app")
  await expect(model(page)).toBeEnabled()
  await model(page).click()
  await page.getByRole("menuitem", { name: "Kimi", exact: true }).hover()
  await page.getByRole("menuitemradio", { name: /Kimi 测试模型/ }).click()
  await editor(page).fill("首页首次发送回归")
  await page.getByRole("button", { name: "发送", exact: true }).click()
  await expect.poll(() => submitted.length).toBe(1)
  expect(created).toBe(1)
  expect(submitted[0].model.modelID).toBe("kimi-k2.6")
  expect(submitted[0].parts.filter((part) => part.type === "text").map((part) => part.text)).toEqual([
    "首页首次发送回归",
  ])
})
