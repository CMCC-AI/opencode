import { expect, test, type Page } from "@playwright/test"

test.use({ channel: process.env.PLAYWRIGHT_CHANNEL, video: "off" })

function selectControl(page: Page, label: string) {
  return page.getByRole("button", { name: new RegExp(`^${label}(?: |$)`) })
}

async function choose(page: Page, label: string, option: string) {
  await selectControl(page, label).click()
  await page.getByRole("option", { name: option, exact: true }).click()
}

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
  const requests: { path: string; query: string; method: string; body: string }[] = []
  page.on("request", (request) =>
    requests.push({
      path: new URL(request.url()).pathname,
      query: new URL(request.url()).search,
      method: request.method(),
      body: request.postData() ?? "",
    }),
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
  await choose(page, "用户类型", "管理员")
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
  await expect(selectControl(page, "用户类型")).toBeVisible()
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
  await expect(selectControl(page, "用户类型")).toBeDisabled()
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
  await expect(selectControl(page, "用户类型")).toHaveAttribute("data-value", "super_admin")
  await expect(selectControl(page, "用户类型")).toBeDisabled()
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
  await choose(page, "用户类型", "管理员")
  fixture.user.userType = "admin"
  await page.evaluate(() => window.dispatchEvent(new Event("focus")))
  await expect(selectControl(page, "用户类型")).toBeDisabled()
  await expect(selectControl(page, "用户类型")).toHaveAttribute("data-value", "user")
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
  await expect(selectControl(page, "用户类型")).toHaveAttribute("data-value", "admin")
  await expect(dialog.getByLabel("VIP 用户")).toBeDisabled()
  await expect(dialog.getByRole("button", { name: "保存配置", exact: true })).toHaveCount(0)
  await expect(dialog.getByRole("button", { name: "重置密码", exact: true })).toHaveCount(0)
})

for (const width of [1440, 390, 320]) {
  test(`management login reuses business branding without overflow at ${width}px`, async ({ page }, testInfo) => {
    const fixture = await prepare(page, { authenticated: false, superAdministrator: true })
    await page.setViewportSize({ width, height: width === 1440 ? 900 : 740 })
    await page.goto("/admin/cases")
    const login = page.locator(".admin-login")
    await expect(login.getByRole("heading", { name: "DeepInsight 管理平台", exact: true })).toBeVisible()
    await expect(page.locator(".admin-login-brand img")).toHaveAttribute("src", "/brand/mobileai-horizontal.svg")
    await expect(page.locator(".admin-login-heading img")).toHaveAttribute("src", "/brand/logo.svg")
    await expect(page.locator(".admin-login-background")).toHaveAttribute("src", /login-bg.*[.]webp$/)
    const images = page.locator(".admin-login-gate img")
    await expect
      .poll(() =>
        images.evaluateAll((items) =>
          items.every(
            (item) =>
              item instanceof HTMLImageElement && item.complete && item.naturalWidth > 0 && item.naturalHeight > 0,
          ),
        ),
      )
      .toBe(true)
    await expect(login.getByRole("button", { name: "登录", exact: true })).toHaveCSS("color", "rgb(255, 255, 255)")
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    const formBox = await login.boundingBox()
    const headingBox = await login.getByRole("heading").boundingBox()
    expect(headingBox!.x).toBeGreaterThanOrEqual(formBox!.x)
    expect(headingBox!.x + headingBox!.width).toBeLessThanOrEqual(formBox!.x + formBox!.width)
    await page.screenshot({ path: testInfo.outputPath("management-login.png"), fullPage: true })
    expect(
      fixture.requests.filter(
        (item) => item.path.startsWith("/api/admin/") || /health|provider|\/session|\/event/.test(item.path),
      ),
    ).toEqual([])
  })
}

for (const width of [1440, 390]) {
  for (const section of ["users", "cases"] as const) {
    test(`branded ${section} workspace and table stay aligned at ${width}px`, async ({ page }, testInfo) => {
      const fixture = await prepare(page, { superAdministrator: true })
      fixture.user.name = "管理用户名称用于验证窄屏换行"
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 })
      await page.goto(`/admin/${section}`)
      await expect(page.locator(".admin-brand img")).toHaveAttribute("src", "/brand/mobileai-horizontal.svg")
      await expect
        .poll(() =>
          page
            .locator(".admin-brand img")
            .evaluate((item) => item instanceof HTMLImageElement && item.complete && item.naturalWidth > 0),
        )
        .toBe(true)
      await expect(page.locator(".admin-sidebar")).toHaveCSS("background-image", /linear-gradient/)
      await expect(
        page.getByRole("link", { name: section === "users" ? "用户管理" : "案例管理", exact: true }),
      ).toHaveClass(/selected/)
      await expect(page.getByRole("button", { name: fixture.user.name, exact: true })).toBeVisible()
      await expect(page.locator("tbody tr").first()).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      if (width === 390)
        expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true)
      const heading = page.getByRole("heading", { name: section === "users" ? "用户管理" : "案例管理", exact: true })
      const table = page.locator(".admin-table-wrap")
      if (width === 390) {
        const before = await heading.boundingBox()
        const scrolled = await table.evaluate((element) => {
          element.scrollLeft = 120
          return element.scrollLeft
        })
        expect(scrolled).toBeGreaterThan(0)
        expect((await heading.boundingBox())!.x).toBe(before!.x)
        await table.evaluate((element) => {
          element.scrollLeft = 0
        })
      }
      await page.screenshot({ path: testInfo.outputPath("branded-workspace.png"), fullPage: true })
      if (section === "users") await page.getByRole("button", { name: "配置测试用户", exact: true }).click()
      if (section === "cases") await page.getByRole("button", { name: "编辑深度案例", exact: true }).click()
      const dialog = page.getByRole("dialog")
      await expect(dialog).toBeVisible()
      await expect(dialog.locator("header")).toHaveCSS("background-color", "rgb(238, 243, 255)")
      await expect(
        dialog.getByRole("button", { name: section === "users" ? "保存配置" : "保存修改", exact: true }),
      ).toHaveCSS("color", "rgb(255, 255, 255)")
      const box = await dialog.boundingBox()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width)
      await page.screenshot({ path: testInfo.outputPath("branded-editor.png"), fullPage: true })
      await dialog.getByRole("button", { name: "取消", exact: true }).click()
      await expect(dialog).toHaveCount(0)
      expect(fixture.requests.some((item) => /health|provider|\/session|\/event|\/config/.test(item.path))).toBe(false)
    })
  }
}

test("management login inputs match business inputs and return text has no arrow", async ({ page }) => {
  await prepare(page, { authenticated: false })
  const style = (element: Element) => {
    const css = getComputedStyle(element)
    return {
      height: css.height,
      radius: css.borderRadius,
      border: css.borderTopColor,
      background: css.backgroundColor,
      paddingLeft: css.paddingLeft,
      paddingRight: css.paddingRight,
      fontSize: css.fontSize,
      fontFamily: css.fontFamily,
      lineHeight: css.lineHeight,
      color: css.color,
      shadow: css.boxShadow,
      placeholder: getComputedStyle(element, "::placeholder").color,
    }
  }
  await page.goto("/app")
  const business = page.getByLabel("手机号", { exact: true })
  await expect(business).toBeVisible()
  const normal = await business.evaluate(style)
  await business.click()
  await business.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
  )
  const focused = await business.evaluate(style)
  await page.goto("/admin")
  const account = page.getByLabel("账号或手机号", { exact: true })
  await expect(account).toBeVisible()
  expect(await account.evaluate(style)).toEqual(normal)
  await account.click()
  await account.evaluate((element) =>
    Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
  )
  expect(await account.evaluate(style)).toEqual(focused)
  await expect(page.getByLabel("密码", { exact: true })).toHaveAttribute("placeholder", "请输入您的密码")
  await expect(page.locator(".admin-login > a")).toHaveText("返回业务端")
  await expect(page.locator(".admin-login > a svg")).toHaveCount(0)
})

for (const width of [1440, 390]) {
  test(`account actions open from the user name and support dismissal at ${width}px`, async ({ page }, testInfo) => {
    await prepare(page)
    await page.setViewportSize({ width, height: 844 })
    await page.goto("/admin/users")
    const trigger = page.getByRole("button", { name: "管理用户", exact: true })
    await expect(page.locator(".admin-account").getByText("返回业务端", { exact: true })).toHaveCount(0)
    await expect(page.getByRole("menu")).toHaveCount(0)
    await trigger.click()
    const menu = page.getByRole("menu")
    await expect(menu.getByRole("menuitem")).toHaveText(["返回业务端", "退出登录"])
    await expect(menu).toHaveCSS("opacity", "1")
    const box = await menu.boundingBox()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    await page.screenshot({ path: testInfo.outputPath("account-menu.png"), fullPage: true })
    await page.keyboard.press("Escape")
    await expect(menu).toHaveCount(0)
    await expect(trigger).toBeFocused()
    await trigger.press("Enter")
    await expect(menu).toBeVisible()
    await expect(menu).toHaveCSS("opacity", "1")
    const viewport = page.viewportSize()!
    const opened = await menu.boundingBox()
    const outside = { x: viewport.width - 8, y: viewport.height - 8 }
    expect(outside.x > opened!.x + opened!.width || outside.y > opened!.y + opened!.height).toBe(true)
    await page.mouse.click(outside.x, outside.y)
    await expect(menu).toHaveCount(0)
  })
}

test("returning to business through the account menu keeps login", async ({ page }) => {
  const fixture = await prepare(page)
  await page.route("**/app", (route) =>
    route.fulfill({ contentType: "text/html", body: "<!doctype html><h1>业务端</h1>" }),
  )
  await page.goto("/admin/users")
  await page.getByRole("button", { name: "管理用户", exact: true }).click()
  await page.getByRole("menuitem", { name: "返回业务端", exact: true }).click()
  await expect(page).toHaveURL(/\/app$/)
  expect(await page.evaluate(() => localStorage.getItem("dockapi.accessToken"))).toBe("test-admin-access")
  expect(fixture.requests.some((item) => item.path === "/api/auth/logout")).toBe(false)
})

test("account menu logout revokes login and returns to the management login form", async ({ page }) => {
  const fixture = await prepare(page)
  await page.goto("/admin/cases")
  await page.getByRole("button", { name: "管理用户", exact: true }).click()
  await page.getByRole("menuitem", { name: "退出登录", exact: true }).click()
  await expect(page.getByRole("heading", { name: "DeepInsight 管理平台", exact: true })).toBeVisible()
  expect(fixture.requests.filter((item) => item.path === "/api/auth/logout")).toHaveLength(1)
  expect(await page.evaluate(() => localStorage.getItem("dockapi.accessToken"))).toBe(null)
})

test("rounded user filters retain API values without manual refresh", async ({ page }, testInfo) => {
  const fixture = await prepare(page)
  await page.goto("/admin/users")
  await expect(page.getByRole("button", { name: "刷新用户", exact: true })).toHaveCount(0)
  await selectControl(page, "用户类型筛选").click()
  await expect(page.locator('.admin-select[data-component="select-content"]')).toHaveCSS("border-radius", "8px")
  await expect(page.locator('.admin-select[data-component="select-content"]')).toHaveCSS("opacity", "1")
  await expect(page.getByRole("option", { name: "全部类型", exact: true })).toHaveAttribute("aria-selected", "true")
  await page.screenshot({ path: testInfo.outputPath("rounded-filter.png"), fullPage: true })
  await page.getByRole("option", { name: "管理员", exact: true }).click()
  await choose(page, "VIP筛选", "VIP")
  await choose(page, "账号状态筛选", "已停用")
  await choose(page, "案例授权筛选", "有案例权限")
  await expect
    .poll(() => {
      const query = new URLSearchParams(
        fixture.requests.filter((item) => item.path === "/api/admin/users").at(-1)?.query,
      )
      return [
        query.get("userType"),
        query.get("vip"),
        query.get("enabled"),
        query.get("caseManagementAllowed"),
        query.get("page"),
      ]
    })
    .toEqual(["admin", "true", "false", "true", "1"])
  await choose(page, "用户类型筛选", "全部类型")
  await expect
    .poll(() =>
      new URLSearchParams(fixture.requests.filter((item) => item.path === "/api/admin/users").at(-1)?.query).has(
        "userType",
      ),
    )
    .toBe(false)
})

test("case filter and category popup work inside the native editor dialog", async ({ page }, testInfo) => {
  const fixture = await prepare(page)
  await page.goto("/admin/cases")
  await expect(page.getByRole("button", { name: "刷新案例", exact: true })).toHaveCount(0)
  await choose(page, "案例来源筛选", "OpenCode")
  await expect(page.getByText("快速案例", { exact: true })).toHaveCount(0)
  await page.getByRole("button", { name: "编辑深度案例", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "编辑案例", exact: true })
  await selectControl(page, "分类").click()
  const list = page.getByRole("listbox")
  await expect(list).toBeVisible()
  await expect(dialog.locator('.admin-select[data-component="select-content"]')).toHaveCSS("opacity", "1")
  expect(await list.evaluate((element) => !!element.closest("dialog"))).toBe(true)
  await page.screenshot({ path: testInfo.outputPath("dialog-category-popup.png"), fullPage: true })
  await page.keyboard.press("Escape")
  await expect(list).toHaveCount(0)
  await expect(dialog).toBeVisible()
  await choose(page, "分类", "通用深度研究")
  await dialog.getByRole("button", { name: "保存修改", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  expect(
    fixture.requests.filter((item) => item.path === "/api/dockapi/case-management" && item.method === "GET").length,
  ).toBeGreaterThan(1)
})

test("pagination and filter reset still load data after removing refresh actions", async ({ page }) => {
  await prepare(page)
  const pages: number[] = []
  await page.route(/\/api\/admin\/users(?:\?.*)?$/, (route) => {
    const page = Number(new URL(route.request().url()).searchParams.get("page") ?? 1)
    pages.push(page)
    return route.fulfill({
      json: {
        code: 200,
        data: {
          items: Array.from({ length: page === 1 ? 20 : 1 }, (_, index) => ({
            id: page * 100 + index,
            name: `分页用户${index + 1}`,
            phone: `test-${index + 1}`,
            enabled: true,
            userType: "user",
            vip: false,
            caseManagementAllowed: false,
            caseManagementGranted: false,
            caseDeleteAllowed: false,
            createdAt: "2026-11-12T08:00:00",
            updatedAt: "2026-11-12T08:00:00",
          })),
          total: 21,
          page,
          size: 20,
        },
      },
    })
  })
  await page.goto("/admin/users")
  await expect(page.locator("tbody tr")).toHaveCount(20)
  await page.getByRole("button", { name: "下一页", exact: true }).click()
  await expect(page.locator("tbody tr")).toHaveCount(1)
  await choose(page, "VIP筛选", "VIP")
  await expect(page.locator("tbody tr")).toHaveCount(20)
  expect(pages.slice(-2)).toEqual([2, 1])
})

test("user type VIP and enabled status are plain table text", async ({ page }, testInfo) => {
  const fixture = await prepare(page, { superAdministrator: true })
  Object.assign(fixture.managed, { userType: "admin", vip: true, enabled: false })
  await page.goto("/admin/users")
  const row = page.locator("tbody tr").filter({ hasText: fixture.managed.phone })
  await expect(row).toBeVisible()
  const color = await row
    .locator("td")
    .nth(1)
    .evaluate((element) => getComputedStyle(element).color)
  for (const value of ["管理员", "VIP", "已停用"]) {
    const cell = row.getByRole("cell", { name: value, exact: true })
    await expect(cell).toHaveCSS("color", color)
    await expect(cell).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
    expect(await cell.evaluate((element) => element.childElementCount)).toBe(0)
  }
  await page.screenshot({ path: testInfo.outputPath("plain-user-metadata.png"), fullPage: true })
  Object.assign(fixture.managed, { userType: "user", vip: false, enabled: true })
  await page.reload()
  await expect(row.getByRole("cell", { name: "普通用户", exact: true })).toHaveText("普通用户")
  await expect(row.getByRole("cell", { name: "已启用", exact: true })).toHaveCSS("color", color)
  expect(
    await row.getByRole("cell", { name: "普通用户", exact: true }).evaluate((element) => element.childElementCount),
  ).toBe(0)
})

test("published and unpublished cases use the same plain status text", async ({ page }, testInfo) => {
  const fixture = await prepare(page)
  fixture.cases[1].publishStatus = "unpublished"
  await page.goto("/admin/cases")
  for (const item of fixture.cases) {
    const row = page.locator("tbody tr").filter({ hasText: item.caseName })
    const cell = row.getByRole("cell", { name: item.publishStatus === "published" ? "已上架" : "已下架", exact: true })
    await expect(cell).toBeVisible()
    const color = await row
      .locator("td")
      .nth(1)
      .evaluate((element) => getComputedStyle(element).color)
    await expect(cell).toHaveCSS("color", color)
    await expect(cell).toHaveCSS("background-color", "rgba(0, 0, 0, 0)")
    expect(await cell.evaluate((element) => element.childElementCount)).toBe(0)
  }
  await page.screenshot({ path: testInfo.outputPath("plain-case-status.png"), fullPage: true })
})
