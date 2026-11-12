import { expect, test, type Page } from "@playwright/test"

test.use({ channel: process.env.PLAYWRIGHT_CHANNEL, video: "off" })

async function prepare(
  page: Page,
  input: {
    authenticated?: boolean
    administrator?: boolean
    superAdministrator?: boolean
    targetType?: "user" | "admin" | "super_admin"
    failQuota?: boolean
    failSave?: boolean
  } = {},
) {
  const user = {
    id: 1,
    name: "管理用户",
    phone: input.superAdministrator ? "admin" : "13800000001",
    enabled: true,
    userType: input.administrator === false ? "user" : input.superAdministrator ? "super_admin" : "admin",
    vip: false,
    casePublishAllowed: true,
    caseManagementAllowed: true,
    caseDeleteAllowed: input.administrator !== false,
  }
  const workspace = { id: 1, workspaceKey: "u-1", directoryPath: "/test/u-1", status: "active" }
  const managed = {
    id: 7,
    name: "测试用户",
    phone: "13800000007",
    enabled: true,
    userType: input.targetType ?? "user",
    vip: false,
    caseManagementGranted: false,
    caseManagementAllowed: false,
    caseDeleteAllowed: false,
    createdAt: "2026-11-12T08:00:00",
    updatedAt: "2026-11-12T08:00:00",
  }
  const cases = [
    {
      source: "opencode",
      caseCode: "same",
      caseName: "深度案例",
      caseDescription: "原说明",
      category: "deep-research",
      caseTag: "通用深度研究",
      publishStatus: "published",
      coverUrl: "/api/dockapi/case-management/opencode/same/cover",
      agentType: "deepinsight",
      publishedAt: "2026-11-12T08:00:00",
      updatedAt: "2026-11-12T08:00:00",
    },
    {
      source: "langgraph",
      caseCode: "same",
      caseName: "快速案例",
      caseDescription: "快速说明",
      category: "deep-research",
      caseTag: "通用深度研究",
      publishStatus: "published",
      coverUrl: "/api/dockapi/case-management/langgraph/same/cover",
      agentType: null,
      publishedAt: "2026-11-12T08:00:00",
      updatedAt: "2026-11-12T08:00:00",
    },
  ]
  const requests: { path: string; method: string; body: string }[] = []
  page.on("request", (request) =>
    requests.push({ path: new URL(request.url()).pathname, method: request.method(), body: request.postData() ?? "" }),
  )
  await page.addInitScript((authenticated) => {
    if (!authenticated) return
    localStorage.setItem("dockapi.accessToken", "test-admin-access")
    localStorage.setItem("dockapi.refreshToken", "test-admin-refresh")
  }, input.authenticated !== false)
  let failedSave = false
  await page.route("**/api/**", async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname
    const ok = (data: unknown) => route.fulfill({ json: { code: 200, message: "ok", data } })
    if (path === "/api/user/profile") return ok({ user, workspace })
    if (path === "/api/auth/login")
      return ok({
        user,
        workspace,
        accessToken: "test-access",
        refreshToken: "test-refresh",
        tokenType: "Bearer",
        expiresIn: 900,
      })
    if (path === "/api/auth/logout") return ok(null)
    if (path === "/api/admin/users") {
      const term = url.searchParams.get("keyword")
      return ok({
        items: !term || managed.name.includes(term) || managed.phone.includes(term) ? [managed] : [],
        total: !term || managed.name.includes(term) || managed.phone.includes(term) ? 1 : 0,
        page: 1,
        size: 20,
      })
    }
    if (path === "/api/admin/users/7/token-quota") {
      if (input.failQuota)
        return route.fulfill({ status: 503, json: { code: 503, message: "额度暂不可用", data: null } })
      return ok({
        enabled: true,
        vip: managed.vip,
        weeklyLimit: 10000,
        used: 1200,
        reserved: 300,
        remaining: 8500,
        weekStart: 1,
        resetAt: 2,
        hasUnknownUsage: false,
      })
    }
    if (path === "/api/admin/users/7") {
      if (request.method() === "PATCH") {
        Object.assign(managed, request.postDataJSON())
        managed.caseManagementAllowed = managed.userType === "admin" || managed.caseManagementGranted
        managed.caseDeleteAllowed = managed.userType === "admin"
      }
      return ok(managed)
    }
    if (path.endsWith("/revoke-sessions") || path.endsWith("/reset-password")) return ok(null)
    if (path === "/api/dockapi/case-management/categories")
      return ok([
        { code: "deep-research", label: "通用深度研究" },
        { code: "finance", label: "AI+财经" },
      ])
    if (path === "/api/dockapi/case-management") {
      const items = cases.filter(
        (item) =>
          (!url.searchParams.get("source") || item.source === url.searchParams.get("source")) &&
          (!url.searchParams.get("publishStatus") || item.publishStatus === url.searchParams.get("publishStatus")),
      )
      return ok({ items, total: items.length, page: 1, size: 24 })
    }
    const item = cases.find((item) => path.includes(`/case-management/${item.source}/${item.caseCode}`))
    if (item && path.endsWith("/cover"))
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jL6sAAAAASUVORK5CYII=",
          "base64",
        ),
      })
    if (item && path.endsWith("/status")) {
      item.publishStatus = request.postDataJSON().publishStatus
      return ok(item)
    }
    if (item) {
      if (request.method() === "PATCH" && input.failSave && !failedSave) {
        failedSave = true
        return route.fulfill({ status: 503, json: { code: 503, message: "保存暂不可用", data: null } })
      }
      return ok(item)
    }
    return route.fulfill({ status: 503, json: { code: 503, message: "研究执行服务不可用", data: null } })
  })
  return { requests, managed, cases, user }
}

test("super admin opens without research service and assigns independent administrator settings", async ({
  page,
}, testInfo) => {
  const fixture = await prepare(page, { superAdministrator: true })
  await page.goto("/admin")
  await expect(page.getByRole("heading", { name: "用户管理", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "配置测试用户", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "用户配置 · 测试用户" })
  await expect(dialog.getByText("1,200", { exact: true })).toBeVisible()
  await dialog.getByLabel("用户类型", { exact: true }).selectOption("admin")
  await expect(dialog.getByLabel("VIP 用户")).not.toBeChecked()
  await dialog.getByRole("button", { name: "保存配置" }).click()
  await expect(dialog).not.toBeVisible()
  const update = fixture.requests.find((request) => request.method === "PATCH" && request.path === "/api/admin/users/7")
  expect(JSON.parse(update!.body)).toEqual({
    userType: "admin",
    vip: false,
    enabled: true,
    caseManagementGranted: false,
  })
  expect(fixture.requests.filter((request) => /health|provider|\/session|\/event|\/config/.test(request.path))).toEqual(
    [],
  )
  await page.screenshot({ path: testInfo.outputPath("admin-users-desktop.png"), fullPage: true })
})

test("ordinary account receives no admin pages or admin data", async ({ page }) => {
  const fixture = await prepare(page, { administrator: false })
  await page.goto("/admin/users")
  await expect(page.getByRole("heading", { name: "当前账号无管理权限" })).toBeVisible()
  expect(fixture.requests.filter((request) => request.path.startsWith("/api/admin/"))).toEqual([])
})

test("admin login has no registration and returns to requested cases page", async ({ page }) => {
  await prepare(page, { authenticated: false })
  await page.goto("/admin/cases")
  await expect(page.getByRole("heading", { name: "DeepInsight 管理平台" })).toBeVisible()
  await expect(page.getByText("注册", { exact: true })).toHaveCount(0)
  await page.getByLabel("账号或手机号", { exact: true }).fill("13800000001")
  await page.getByLabel("密码", { exact: true }).fill("test-password")
  await page.getByRole("button", { name: "登录", exact: true }).click()
  await expect(page.getByRole("heading", { name: "案例管理", exact: true })).toBeVisible()
  await expect(page.getByText("深度案例", { exact: true })).toBeVisible()
})

test("cases distinguish sources and failures preserve edits while status updates refresh list", async ({
  page,
}, testInfo) => {
  const fixture = await prepare(page, { failSave: true })
  await page.goto("/admin/cases")
  await expect(page.getByText("深度案例", { exact: true })).toBeVisible()
  await expect(page.getByText("快速案例", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "编辑深度案例", exact: true }).click()
  const editor = page.getByRole("dialog", { name: "编辑案例", exact: true })
  await expect(editor.getByLabel("案例名称")).toBeEnabled()
  await editor.getByLabel("案例名称").fill("修改后的案例")
  await editor.getByRole("button", { name: "保存修改" }).click()
  await expect(editor.getByRole("alert")).toContainText("保存暂不可用")
  await expect(editor.getByLabel("案例名称")).toHaveValue("修改后的案例")
  await editor.getByRole("button", { name: "保存修改" }).click()
  await expect(editor).not.toBeVisible()
  const patch = fixture.requests.find(
    (request) => request.method === "PATCH" && request.path.includes("/case-management/"),
  )!
  expect(patch.path).toBe("/api/dockapi/case-management/opencode/same")
  expect(patch.body).not.toContain("reportContent")
  await page.getByRole("button", { name: "下架深度案例", exact: true }).click()
  await page.getByRole("dialog").getByRole("button", { name: "确认", exact: true }).click()
  await expect(page.getByRole("button", { name: "上架深度案例", exact: true })).toBeVisible()
  const actionRows = await page
    .locator("tbody tr")
    .filter({ hasText: "深度案例" })
    .getByRole("button")
    .evaluateAll((buttons) => buttons.map((button) => Math.round(button.getBoundingClientRect().top)))
  expect(new Set(actionRows).size).toBe(1)
  await page.screenshot({ path: testInfo.outputPath("admin-cases-desktop.png"), fullPage: true })
})

test("quota errors stay inside user dialog and mobile layout does not overflow", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await prepare(page, { failQuota: true })
  await page.goto("/admin/users")
  await page.getByRole("button", { name: "配置测试用户", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByRole("alert")).toContainText("额度暂不可用")
  await dialog.getByRole("button", { name: "重试", exact: true }).click()
  await expect(dialog.getByLabel("用户类型", { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath("admin-user-mobile.png"), fullPage: true })
})

test("late administrative responses cannot survive an account change", async ({ page }) => {
  const fixture = await prepare(page)
  const pending = Promise.withResolvers<void>()
  let requested = false
  await page.route(/\/api\/admin\/users(?:\?.*)?$/, async (route) => {
    requested = true
    await pending.promise
    await route.fulfill({ json: { code: 200, data: { items: [fixture.managed], total: 1, page: 1, size: 20 } } })
  })
  try {
    await page.goto("/admin/users")
    await expect.poll(() => requested).toBe(true)
    fixture.user.id = 2
    fixture.user.name = "普通账号"
    fixture.user.userType = "user"
    fixture.user.caseDeleteAllowed = false
    await page.evaluate(() => {
      localStorage.setItem("dockapi.accessToken", "different-account-access")
      localStorage.setItem("dockapi.refreshToken", "different-account-refresh")
      window.dispatchEvent(new StorageEvent("storage", { key: "dockapi.accessToken" }))
    })
    await expect(page.getByRole("heading", { name: "当前账号无管理权限" })).toBeVisible()
    pending.resolve()
    await expect(page.getByText("测试用户", { exact: true })).toHaveCount(0)
    await expect(page.getByRole("heading", { name: "用户管理", exact: true })).toHaveCount(0)
  } finally {
    pending.resolve()
  }
})

test("ordinary admin configures ordinary users without administrator assignment", async ({ page }, testInfo) => {
  const fixture = await prepare(page)
  await page.goto("/admin/users")
  await page.getByRole("button", { name: "配置测试用户", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByLabel("用户类型", { exact: true })).toBeDisabled()
  await dialog.getByLabel("VIP 用户").check()
  await dialog.getByLabel("案例全局授权").check()
  await dialog.getByLabel("账号启用").uncheck()
  await dialog.getByRole("button", { name: "保存配置", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  const update = fixture.requests.find((item) => item.method === "PATCH")!
  expect(JSON.parse(update.body)).toEqual({ userType: "user", vip: true, enabled: false, caseManagementGranted: true })
  await page.getByRole("button", { name: "配置测试用户", exact: true }).click()
  await dialog.getByRole("button", { name: "重置密码", exact: true }).click()
  await dialog.getByLabel("新密码", { exact: true }).fill("test-only-reset-password")
  await dialog.getByRole("button", { name: "确认操作", exact: true }).click()
  await expect(dialog.getByText("操作成功，原登录会话已失效", { exact: true })).toBeVisible()
  await dialog.getByRole("button", { name: "退出全部会话", exact: true }).click()
  await dialog.getByRole("button", { name: "确认操作", exact: true }).click()
  await expect(dialog.getByRole("button", { name: "确认操作", exact: true })).toHaveCount(0)
  expect(fixture.requests.filter((item) => item.path.endsWith("/reset-password"))).toHaveLength(1)
  expect(fixture.requests.filter((item) => item.path.endsWith("/revoke-sessions"))).toHaveLength(1)
  await page.screenshot({ path: testInfo.outputPath("ordinary-admin-user.png"), fullPage: true })
})

for (const targetType of ["admin", "super_admin"] as const) {
  test(`ordinary admin can only view ${targetType} accounts`, async ({ page }, testInfo) => {
    const fixture = await prepare(page, { targetType })
    await page.goto("/admin/users")
    await expect(page.getByRole("button", { name: "配置测试用户", exact: true })).toHaveCount(0)
    await page.getByRole("button", { name: "查看测试用户", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByLabel("VIP 用户")).toBeDisabled()
    await expect(dialog.getByLabel("账号启用")).toBeDisabled()
    await expect(dialog.getByRole("button", { name: "保存配置", exact: true })).toHaveCount(0)
    await expect(dialog.getByRole("button", { name: "重置密码", exact: true })).toHaveCount(0)
    await expect(dialog.getByRole("button", { name: "退出全部会话", exact: true })).toHaveCount(0)
    expect(fixture.requests.filter((item) => item.method === "POST" || item.method === "PATCH")).toEqual([])
    await page.screenshot({ path: testInfo.outputPath("readonly-administrator.png"), fullPage: true })
  })
}

test("fixed admin login accepts an account name and protects its enabled state and type", async ({
  page,
}, testInfo) => {
  const fixture = await prepare(page, { authenticated: false, superAdministrator: true, targetType: "super_admin" })
  await page.goto("/admin")
  await page.getByLabel("账号或手机号", { exact: true }).fill("admin")
  await page.getByLabel("密码", { exact: true }).fill("test-only-initial-password")
  await page.getByRole("button", { name: "登录", exact: true }).click()
  await expect(page.getByRole("heading", { name: "用户管理", exact: true })).toBeVisible()
  const login = fixture.requests.find((item) => item.path === "/api/auth/login")!
  expect(JSON.parse(login.body).phone).toBe("admin")
  await page.getByRole("button", { name: "配置测试用户", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByLabel("用户类型", { exact: true })).toHaveValue("super_admin")
  await expect(dialog.getByLabel("用户类型", { exact: true })).toBeDisabled()
  await expect(dialog.getByLabel("账号启用")).toBeDisabled()
  await expect(dialog.getByLabel("VIP 用户")).not.toBeChecked()
  await expect(dialog.getByRole("button", { name: "重置密码", exact: true })).toBeEnabled()
  await page.screenshot({ path: testInfo.outputPath("protected-super-admin.png"), fullPage: true })
})

test("losing super admin privileges removes assignment from an already open form", async ({ page }) => {
  const fixture = await prepare(page, { superAdministrator: true })
  await page.goto("/admin/users")
  await page.getByRole("button", { name: "配置测试用户", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await dialog.getByLabel("用户类型", { exact: true }).selectOption("admin")
  fixture.user.userType = "admin"
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await expect(dialog.getByLabel("用户类型", { exact: true })).toBeDisabled()
  await expect(dialog.getByLabel("用户类型", { exact: true })).toHaveValue("user")
  await dialog.getByLabel("VIP 用户").check()
  await dialog.getByRole("button", { name: "保存配置", exact: true }).click()
  const patch = fixture.requests.find((item) => item.method === "PATCH")!
  expect(JSON.parse(patch.body).userType).toBe("user")
})

test("a user promoted elsewhere becomes read-only after a rejected stale update", async ({ page }) => {
  const fixture = await prepare(page)
  await page.goto("/admin/users")
  await page.getByRole("button", { name: "配置测试用户", exact: true }).click()
  const dialog = page.getByRole("dialog")
  await expect(dialog.getByLabel("VIP 用户")).toBeEnabled()
  fixture.managed.userType = "admin"
  await page.route("**/api/admin/users/7", (route) =>
    route.request().method() === "PATCH"
      ? route.fulfill({ status: 403, json: { code: 403, message: "普通管理员只能操作普通用户，不能操作管理员账号" } })
      : route.fallback(),
  )
  await dialog.getByLabel("VIP 用户").check()
  await dialog.getByRole("button", { name: "保存配置", exact: true }).click()
  await expect(dialog.getByLabel("用户类型", { exact: true })).toHaveValue("admin")
  await expect(dialog.getByLabel("VIP 用户")).toBeDisabled()
  await expect(dialog.getByRole("button", { name: "保存配置", exact: true })).toHaveCount(0)
  await expect(dialog.getByRole("button", { name: "重置密码", exact: true })).toHaveCount(0)
})
