import { expect, test, type Page } from "@playwright/test"
import { setupHomePage } from "../startup/home-fixture"

test.use({ locale: "zh-CN" })
const code = "a1cce3d1-eaa2-4f6c-8432-37a2ccbc25df"

async function setup(page: Page, allowed = true) {
  await setupHomePage(page, { models: true })
  const requests: { path: string; method: string; sources: string | null }[] = []
  let items = ["langgraph", "opencode"].map((source) => ({
    source,
    caseCode: code,
    caseName: source === "langgraph" ? "快速案例" : "深度案例",
    caseTag: "通用深度研究",
    category: "deep-research",
    categoryLabel: "通用深度研究",
    coverUrl: "",
    reportCharCount: 20,
    publishedAt: "2026-10-28T10:00:00",
    agentType: source === "opencode" ? "deepinsight" : null,
    rootAgent: source === "opencode" ? "deepinsight/deepinsight-team-lead" : null,
  }))
  await page.route("**/api/user/profile", (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: {
          user: { id: 1, name: "测试用户", enabled: true, casePublishAllowed: allowed,
            userType: allowed ? "admin" : "user", caseManagementAllowed: allowed, caseDeleteAllowed: allowed },
          workspace: { id: 1, workspaceKey: "home-sizing-test", directoryPath: "C:/home-sizing-test", status: "READY" },
        },
      },
    }),
  )
  await page.route("**/api/dockapi/**", (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname
    requests.push({ path, method: route.request().method(), sources: url.searchParams.get("sources") })
    const json = (data: unknown) => route.fulfill({ json: { code: 200, data } })
    if (path === "/api/dockapi/cases/overview")
      return json({ groups: [{ category: "deep-research", label: "通用深度研究", items }] })
    if (path === "/api/dockapi/cases") return json({ items, total: items.length, page: 1, size: 24 })
    if (route.request().method() === "DELETE") {
      items = items.filter((item) => item.source !== (path.includes("general-deepinsight") ? "langgraph" : "opencode"))
      return json(null)
    }
    if (path === `/api/dockapi/general-deepinsight/cases/${code}`)
      return json({
        readOnly: true,
        caseInfo: items.find((item) => item.source === "langgraph"),
        reportContent: "# 快速案例正文",
        session: {
          id: "original-task",
          title: "快速案例",
          query: "快速案例的研究问题",
          status: "completed",
          elapsedSeconds: 10,
          createdAt: "2026-10-28T10:00:00",
          updatedAt: "2026-10-28T10:00:10",
        },
        conversationData: { steps: [] },
      })
    if (path === `/api/dockapi/cases/${code}`)
      return json({
        ...items.find((item) => item.source === "opencode"),
        query: "深度案例的研究问题",
        snapshotVersion: "v1",
        snapshotBytes: 0,
        artifactBytes: 0,
      })
    if (path.endsWith("/preview-ticket"))
      return json({ baseUrl: "/api/dockapi/case-preview/test", expiresAt: "2099-01-01T00:00:00Z" })
    if (path.endsWith("/snapshot"))
      return route.fulfill({
        json: {
          schemaVersion: 1,
          caseCode: code,
          rootSessionId: "root",
          query: "深度案例的研究问题",
          agentType: "deepinsight",
          rootAgent: "deepinsight/deepinsight-team-lead",
          capturedAt: "2026-10-28",
          artifacts: [],
          sessions: [
            {
              session: {
                id: "root",
                slug: "root",
                projectID: "test",
                directory: "case://workspace",
                title: "深度案例",
                agent: "deepinsight/deepinsight-team-lead",
                version: "v2",
                time: { created: 1, updated: 2 },
              },
              status: { type: "idle" },
              messages: [
                {
                  info: {
                    id: "u1",
                    sessionID: "root",
                    role: "user",
                    agent: "deepinsight/deepinsight-team-lead",
                    model: { providerID: "test", modelID: "test" },
                    time: { created: 1 },
                  },
                  parts: [{ id: "p1", messageID: "u1", sessionID: "root", type: "text", text: "深度案例的研究问题" }],
                },
                {
                  info: {
                    id: "a1",
                    sessionID: "root",
                    role: "assistant",
                    parentID: "u1",
                    agent: "deepinsight/deepinsight-team-lead",
                    modelID: "test",
                    providerID: "test",
                    mode: "build",
                    path: { cwd: "case://workspace", root: "case://workspace" },
                    cost: 0,
                    tokens: { input: 10, output: 20, reasoning: 0, cache: { read: 0, write: 0 } },
                    time: { created: 2, completed: 3 },
                    finish: "stop",
                  },
                  parts: [{ id: "p2", messageID: "a1", sessionID: "root", type: "text", text: "研究已经完成。" }],
                },
              ],
            },
          ],
        },
      })
    return json([])
  })
  return requests
}

test("global case editors maintain unpublished cases without admin or permanent delete access", async ({ page }) => {
  await setup(page)
  await page.route("**/api/user/profile", (route) => route.fulfill({ json: { code: 200, data: {
    user: { id: 7, name: "案例维护用户", enabled: true, userType: "user", casePublishAllowed: true, caseManagementAllowed: true, caseDeleteAllowed: false },
    workspace: { id: 1, workspaceKey: "home-sizing-test", directoryPath: "C:/home-sizing-test", status: "READY" },
  } } }))
  await page.route("**/api/dockapi/case-management**", (route) => {
    const path = new URL(route.request().url()).pathname
    return route.fulfill({ json: { code: 200, data: path.endsWith("/categories") ? [{ code: "deep-research", label: "通用深度研究" }] : {
      items: [{ source: "langgraph", caseCode: code, caseName: "已下架快速案例", caseDescription: "待维护", category: "deep-research", caseTag: "通用深度研究", publishStatus: "unpublished", publishedAt: "2026-11-12T08:00:00", updatedAt: "2026-11-12T08:00:00" }], total: 1, page: 1, size: 24,
    } } })
  })
  await page.goto("/cases")
  await expect(page.getByRole("button", { name: /删除案例 / })).toHaveCount(0)
  await page.getByRole("button", { name: "案例维护", exact: true }).click()
  await expect(page.getByText("已下架快速案例", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "上架已下架快速案例", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: /永久删除/ })).toHaveCount(0)
  await page.getByRole("button", { name: "返回案例集", exact: true }).click()
  await expect(page.getByRole("heading", { name: "精选案例", exact: true })).toBeVisible()
})

test("revoking admin type closes both delete dialogs while keeping explicit case maintenance", async ({ page }) => {
  await setup(page)
  let administrator = true
  await page.route("**/api/user/profile", (route) => route.fulfill({ json: { code: 200, data: {
    user: { id: 1, name: "权限变更用户", enabled: true, userType: administrator ? "admin" : "user", casePublishAllowed: true, caseManagementAllowed: true, caseDeleteAllowed: administrator },
    workspace: { id: 1, workspaceKey: "home-sizing-test", directoryPath: "C:/home-sizing-test", status: "READY" },
  } } }))
  await page.route("**/api/dockapi/case-management**", (route) => route.fulfill({ json: { code: 200, data:
    new URL(route.request().url()).pathname.endsWith("/categories") ? [{ code: "deep-research", label: "通用深度研究" }] : {
      items: [{ source: "opencode", caseCode: code, caseName: "待维护案例", category: "deep-research", caseTag: "通用深度研究", publishStatus: "published", publishedAt: "2026-11-12T08:00:00", updatedAt: "2026-11-12T08:00:00" }], total: 1, page: 1, size: 24,
    } } }))
  await page.goto("/cases")
  await page.getByRole("button", { name: "删除案例 深度案例", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "删除案例", exact: true })).toBeVisible()
  administrator = false
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await expect(page.getByRole("dialog", { name: "删除案例", exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: /删除案例 / })).toHaveCount(0)
  administrator = true
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await expect(page.getByRole("button", { name: "删除案例 深度案例", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "案例维护", exact: true }).click()
  await page.getByRole("button", { name: "永久删除待维护案例", exact: true }).click()
  await expect(page.getByRole("dialog", { name: "永久删除案例", exact: true })).toBeVisible()
  administrator = false
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await expect(page.getByRole("dialog", { name: "永久删除案例", exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "永久删除待维护案例", exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "编辑待维护案例", exact: true })).toBeVisible()
})

test("mixed same-code cards open the right snapshots and quick same-task uses unified home", async ({ page }, info) => {
  const requests = await setup(page)
  await page.goto("/cases")
  await expect(page.locator("[data-case-card]")).toHaveCount(2)
  expect(requests.find((r) => r.path.endsWith("/overview"))?.sources).toBe("all")
  await page.screenshot({ path: info.outputPath("unified-catalog.png") })
  await page.getByRole("button", { name: "快速案例", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/general-deepinsight/cases/${code}`))
  await expect(page.locator(".general-research-result")).toHaveAttribute("data-read-only", "")
  expect(requests.filter((r) => r.path === `/api/dockapi/general-deepinsight/cases/${code}`)).toHaveLength(1)
  expect(requests.some((r) => r.path.endsWith("/snapshot"))).toBe(false)
  await page.getByRole("button", { name: "做同款", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "请告诉您要研究的问题？", exact: true })).toHaveValue(
    "快速案例的研究问题",
  )
  await expect(
    page.getByRole("group", { name: "研究模式" }).getByRole("button", { name: "快速", exact: true }),
  ).toHaveAttribute("aria-pressed", "true")
  expect(requests.some((r) => r.method === "POST" && r.path.endsWith("/sessions"))).toBe(false)
})

test("deep cases keep their viewer and create deep research drafts", async ({ page }) => {
  const requests = await setup(page)
  await page.goto("/cases")
  await page.getByRole("button", { name: "深度案例", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/cases/${code}$`))
  await page.getByRole("button", { name: "做同款", exact: true }).click()
  await expect(page.locator('[data-research-home] [data-component="prompt-input"]')).toHaveText("深度案例的研究问题")
  await expect(
    page.getByRole("group", { name: "研究模式" }).getByRole("button", { name: "深度", exact: true }),
  ).toHaveAttribute("aria-pressed", "true")
  expect(requests.filter((r) => r.path.endsWith("/snapshot"))).toHaveLength(1)
})

test("deleting a quick case does not remove the same-code deep case", async ({ page }) => {
  const requests = await setup(page)
  await page.goto("/cases")
  await page.getByRole("button", { name: "删除案例 快速案例", exact: true }).click()
  await page.getByRole("button", { name: "永久删除", exact: true }).click()
  await expect(page.locator("[data-case-card]")).toHaveCount(1)
  await expect(page.getByRole("button", { name: "深度案例", exact: true })).toBeVisible()
  expect(requests.filter((r) => r.method === "DELETE").map((r) => r.path)).toEqual([
    `/api/dockapi/general-deepinsight/cases/${code}`,
  ])
  expect(requests.filter((r) => r.path.endsWith("/overview")).length).toBeGreaterThan(1)
})

test("non-publishers cannot manage either case source and old links still open", async ({ page }) => {
  await setup(page, false)
  await page.goto("/cases")
  await expect(page.locator("[data-case-card]")).toHaveCount(2)
  await expect(page.getByRole("button", { name: /删除案例 / })).toHaveCount(0)
  await page.goto(`/general-deepinsight/cases/${code}`)
  await expect(page.locator(".general-research-result")).toHaveAttribute("data-read-only", "")
  await page.getByRole("button", { name: "返回案例集", exact: true }).click()
  await expect(page).toHaveURL(/\/cases$/)
})

test("super admin keeps the business admin entry and case permissions", async ({ page }) => {
  await setup(page)
  await page.route("**/api/user/profile", (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: {
          user: {
            id: 9,
            name: "超级管理员",
            phone: "admin",
            enabled: true,
            userType: "super_admin",
            vip: false,
            casePublishAllowed: true,
            caseManagementAllowed: true,
            caseDeleteAllowed: true,
          },
          workspace: { id: 9, workspaceKey: "home-sizing-test", directoryPath: "C:/home-sizing-test", status: "READY" },
        },
      },
    }),
  )
  await page.goto("/cases")
  await expect(page.getByRole("button", { name: "案例维护", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "删除案例 深度案例", exact: true })).toBeVisible()
  await page.getByRole("button", { name: /超级管理员/ }).click()
  await expect(page.getByRole("menuitem", { name: "管理平台", exact: true })).toBeVisible()
})
