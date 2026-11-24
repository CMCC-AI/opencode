import { expect, test, type Page } from "@playwright/test"
import { mockOpenCodeServer } from "../utils/mock-server"
import { homeDirectory, homeSession } from "./home-fixture"

const user = { id: 7, name: "页签测试账号", phone: "", enabled: true, casePublishAllowed: false }
const workspace = { id: 7, workspaceKey: "tab-auth-test", directoryPath: homeDirectory, status: "READY" }
const profile = { user, workspace }
const account = (jti: string) => {
  const jwt = (type: string) => {
    const claims = { sub: String(user.id), sid: "556c867b-4d55-4193-a786-c33753d0cc8d", type, sv: 0, jti }
    return `header.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.signature`
  }
  return { accessToken: jwt("access"), refreshToken: jwt("refresh") }
}
const original = account("old")
const renewed = account("new")
const historyText = "打开历史时返回的原始消息"

const json = (data: unknown, status = 200) => ({
  status,
  json: { code: status, message: status === 401 ? "登录已失效" : "ok", data },
  headers: { "access-control-allow-origin": "*" },
})

async function stub(page: Page, options: { expired?: boolean; noLocks?: boolean } = {}) {
  if (options.noLocks) {
    await page.addInitScript(() => Object.defineProperty(navigator, "locks", { value: undefined }))
  }
  await mockOpenCodeServer(page, {
    directory: homeDirectory,
    project: { id: homeSession.projectID, worktree: homeDirectory, time: { created: 1 } },
    provider: { all: [], connected: [], default: {} },
    sessions: [homeSession],
    pageMessages: () => ({ items: [] }),
  })
  await page.route("**/api/user/profile", (route) => {
    const { authorization } = route.request().headers()
    return route.fulfill(
      authorization === `Bearer ${renewed.accessToken}` ||
        (!options.expired && authorization === `Bearer ${original.accessToken}`)
        ? json(profile)
        : json(null, 401),
    )
  })
  await page.route("**/api/dockapi/sessions", (route) =>
    route.fulfill(json([{
      id: "business-auth-history",
      agentType: "general",
      query: historyText,
      title: homeSession.title,
      openCodeSessionId: homeSession.id,
      directoryPath: homeDirectory,
      openCodeSession: homeSession,
      openCodeStatus: { type: "idle" },
      createdAt: "2026-09-22T00:00:00Z",
      updatedAt: "2026-09-22T00:00:00Z",
    }])),
  )
  await page.route("**/api/reference?*", (route) => route.fulfill({ json: { data: [] } }))
  await page.route("**/file/directory*", (route) => route.fulfill({ json: { path: homeDirectory } }))
}

async function seed(page: Page) {
  await page.route("**/auth-test-seed", (route) => route.fulfill({ contentType: "text/html", body: "" }))
  await page.goto("/auth-test-seed")
  await page.evaluate((tokens) => {
    localStorage.setItem("dockapi.accessToken", tokens.accessToken)
    localStorage.setItem("dockapi.refreshToken", tokens.refreshToken)
  }, original)
}

const historyEntry = (page: Page) => page.getByText(homeSession.title, { exact: true }).first()

test("a real refresh in a second tab does not remount the history tab or restart its messages", async ({ page, context }) => {
  const refreshTab = await context.newPage()
  await seed(page)
  await stub(page)
  await stub(refreshTab, { expired: true })
  let refreshes = 0
  await refreshTab.route("**/api/auth/refresh", (route) => {
    refreshes += 1
    return route.fulfill(json({ ...profile, ...renewed }))
  })
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const release = Promise.withResolvers<void>()
  let messageReads = 0
  let historyReads = 0
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/dockapi/sessions") historyReads += 1
  })
  await page.route(`**/session/${homeSession.id}/message?*`, async (route) => {
    messageReads += 1
    await release.promise
    await route.fulfill({ json: [{
      info: {
        id: "msg_auth_history",
        sessionID: homeSession.id,
        role: "user",
        agent: "build",
        model: { providerID: "opencode", modelID: "test" },
        time: { created: 1 },
      },
      parts: [{
        id: "prt_auth_history",
        sessionID: homeSession.id,
        messageID: "msg_auth_history",
        type: "text",
        text: historyText,
      }],
    }] })
  })
  try {
    await page.goto("/app")
    await expect(historyEntry(page)).toBeVisible()
    await historyEntry(page).click()
    await expect.poll(() => messageReads).toBe(1)
    await refreshTab.goto("/app")
    await expect(historyEntry(refreshTab)).toBeVisible()
    release.resolve()
    await expect(page.getByText(historyText, { exact: true })).toBeVisible()
    expect(messageReads).toBe(1)
    expect(historyReads).toBe(1)
    expect(refreshes).toBe(1)
    expect(errors).toEqual([])
  } finally {
    release.resolve()
  }

  await refreshTab.evaluate(() => {
    localStorage.removeItem("dockapi.accessToken")
    localStorage.removeItem("dockapi.refreshToken")
  })
  await expect(page.getByRole("heading", { name: "欢迎登录" })).toBeVisible()
  await expect(page.getByText(historyText, { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test("concurrent refreshes without Web Locks keep the winner's tokens in both tabs", async ({ page, context }) => {
  const second = await context.newPage()
  await seed(page)
  for (const tab of [page, second]) await stub(tab, { expired: true, noLocks: true })
  const losingRequest = Promise.withResolvers<void>()
  const attempts: string[] = []
  await page.route("**/api/auth/refresh", async (route) => {
    attempts.push(route.request().postDataJSON().refreshToken)
    await losingRequest.promise
    await route.fulfill(json({ ...profile, ...renewed }))
  })
  await second.route("**/api/auth/refresh", async (route) => {
    attempts.push(route.request().postDataJSON().refreshToken)
    await route.fulfill(json(null, 401))
    losingRequest.resolve()
  })
  try {
    const navigating = page.goto("/app")
    await expect.poll(() => attempts.length).toBe(1)
    await second.goto("/app")
    await navigating
    for (const tab of [page, second]) {
      await expect(historyEntry(tab)).toBeVisible()
      expect(await tab.evaluate(() => localStorage.getItem("dockapi.refreshToken"))).toBe(renewed.refreshToken)
    }
    expect(attempts).toEqual([original.refreshToken, original.refreshToken])
  } finally {
    losingRequest.resolve()
  }
})

test("a rejected refresh without replacement credentials returns to login", async ({ page }) => {
  await seed(page)
  await stub(page, { expired: true, noLocks: true })
  await page.route("**/api/auth/refresh", (route) => route.fulfill(json(null, 401)))
  await page.goto("/app")
  await expect(page.getByRole("heading", { name: "欢迎登录" })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem("dockapi.refreshToken"))).toBeNull()
})
