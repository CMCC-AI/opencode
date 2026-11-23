import { expect, test, type Page } from "@playwright/test"
import { homeDirectory, homeSession, setupHomePage } from "../startup/home-fixture"

const researchId = "a1cce3d1-eaa2-4f6c-8432-37a2ccbc25df"

async function prepare(page: Page, allowed = true) {
  await setupHomePage(page, { models: true, history: true })
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  const session = {
    id: researchId,
    sourceId: researchId,
    source: "langgraph",
    productType: "general-deepinsight",
    title: "快速研究发布测试",
    query: "研究资料治理",
    status: "completed",
    elapsedSeconds: 60,
    createdAt: "2026-11-12T08:00:00",
    updatedAt: "2026-11-12T08:01:00",
    capabilities: { open: true, rename: true, delete: true },
  }
  await page.route("**/api/user/profile", (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: {
          user: { id: 1, name: "发布测试用户", enabled: true, casePublishAllowed: allowed },
          workspace: { id: 1, workspaceKey: "home-sizing-test", directoryPath: homeDirectory, status: "READY" },
        },
      },
    }),
  )
  await page.route("**/api/dockapi/sessions", (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: [
          {
            id: "business-publish-test",
            agentType: "deepinsight",
            query: "研究资料治理",
            title: "深度研究发布测试",
            openCodeSessionId: homeSession.id,
            directoryPath: homeDirectory,
            openCodeSession: homeSession,
            openCodeStatus: { type: "idle" },
            createdAt: "2026-11-12T08:00:00",
            updatedAt: "2026-11-12T08:01:00",
          },
        ],
      },
    }),
  )
  await page.route("**/api/dockapi/history*", (route) => route.fulfill({ json: { code: 200, data: [session] } }))
  await page.route(`**/api/dockapi/general-deepinsight/sessions/${researchId}`, (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: {
          session,
          reportContent: "# 研究报告\n\n研究完成。",
          conversationData: { steps: [], uploadedFiles: [] },
        },
      },
    }),
  )
  return errors
}

async function openDialog(page: Page, mode: "quick" | "deep") {
  if (mode === "quick") await page.goto(`/general-deepinsight/session/${researchId}?publish=1`)
  if (mode === "deep") {
    await page.goto("/app")
    const row = page
      .locator('[data-component="cmcc-history-row"][data-source="opencode"]')
      .filter({ hasText: "深度研究发布测试" })
    await row.hover()
    await row.getByRole("button", { name: "更多", exact: true }).click()
    await page.getByRole("menuitem", { name: "添加至案例库", exact: true }).click()
  }
  return page.getByRole("dialog", { name: "添加至案例库", exact: true })
}

for (const mode of ["quick", "deep"] as const) {
  for (const width of [1440, 390]) {
    test(`${mode} case publishing shows title and classification without an upload at ${width}px`, async ({
      page,
    }, info) => {
      const errors = await prepare(page)
      await page.setViewportSize({ width, height: 740 })
      const dialog = await openDialog(page, mode)
      await expect(dialog).toBeVisible()
      await expect(dialog).toHaveCSS("transform", "none")
      await expect(dialog.locator("..")).toHaveCSS("opacity", "1")
      await expect(dialog).toHaveCSS("border-radius", "14px")
      await expect(dialog.locator(".cmcc-action-note")).toHaveCSS("background-color", "rgb(241, 241, 241)")
      await expect(dialog.locator('input[type="file"]')).toHaveCount(0)
      await expect(dialog.getByLabel("案例名称", { exact: true })).toHaveValue(
        mode === "quick" ? "快速研究发布测试" : "深度研究发布测试",
      )
      await expect(dialog.getByLabel("案例分类", { exact: true })).toHaveValue("通用深度研究")
      await expect(dialog.getByRole("textbox", { name: "案例说明", exact: true })).toHaveCount(0)
      await expect(dialog.getByRole("button", { name: "确定新增", exact: true })).toHaveCSS(
        "color",
        "rgb(255, 255, 255)",
      )
      if (mode === "quick") await expect(dialog.getByRole("combobox")).toBeDisabled()
      if (mode === "deep") await expect(dialog.getByRole("combobox")).toBeEnabled()
      const positions = await dialog.evaluate((element) => {
        const box = element.getBoundingClientRect()
        return {
          width: box.width,
          left: box.left,
          right: box.right,
          bottom: box.bottom,
          viewport: innerWidth,
          background: getComputedStyle(element).backgroundColor,
        }
      })
      expect(positions.width).toBeLessThanOrEqual(434)
      expect(positions.left).toBeGreaterThanOrEqual(0)
      expect(positions.right).toBeLessThanOrEqual(positions.viewport)
      expect(positions.bottom).toBeLessThanOrEqual(740)
      expect(positions.background).toBe("rgb(255, 255, 255)")
      await page.screenshot({ path: info.outputPath("case-publish-dialog.png") })
      await dialog.getByRole("button", { name: "取消", exact: true }).click()
      await expect(dialog).toHaveCount(0)
      expect(errors).toEqual([])
    })
  }

  test(`${mode} publishing retains the draft on failure and retries only its original endpoint`, async ({ page }) => {
    const errors = await prepare(page)
    const endpoint =
      mode === "quick"
        ? `/api/dockapi/general-deepinsight/cases/from-session/${researchId}`
        : "/api/dockapi/cases/from-session/business-publish-test"
    const requests: { path: string; body: string }[] = []
    let release = () => {}
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.route("**/api/dockapi/**/from-session/*", async (route) => {
      requests.push({
        path: new URL(route.request().url()).pathname,
        body: route.request().postDataBuffer()!.toString(),
      })
      if (requests.length === 1) {
        await pending
        return route.fulfill({ status: 503, json: { code: 503, message: "发布服务暂时不可用" } })
      }
      return route.fulfill({ json: { code: 200, data: {} } })
    })
    const dialog = await openDialog(page, mode)
    await dialog.getByLabel("案例名称", { exact: true }).fill("")
    await dialog.getByRole("button", { name: "确定新增", exact: true }).click()
    await expect(page.getByText("请输入案例名称", { exact: true })).toBeVisible()
    expect(requests).toHaveLength(0)
    await dialog.getByLabel("案例名称", { exact: true }).fill("修改后的案例名称")
    try {
      await dialog.getByRole("button", { name: "确定新增", exact: true }).click()
      await expect(dialog.getByRole("button", { name: "添加中...", exact: true })).toBeDisabled()
      await expect(dialog.getByRole("button", { name: "取消", exact: true })).toBeDisabled()
      await expect.poll(() => requests.length).toBe(1)
    } finally {
      release()
    }
    await expect(page.getByText("发布服务暂时不可用", { exact: true })).toBeVisible()
    await expect(dialog.getByLabel("案例名称", { exact: true })).toHaveValue("修改后的案例名称")
    await dialog.getByRole("button", { name: "确定新增", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect(requests.map((item) => item.path)).toEqual([endpoint, endpoint])
    expect(requests[1].body).toContain("修改后的案例名称")
    expect(requests.every(({ body }) => !body.includes('name="coverFile"'))).toBe(true)
    if (mode === "deep") expect(requests[1].body).toContain("通用深度研究")
    if (mode === "quick") expect(requests[1].body).not.toContain('name="caseTag"')
    expect(errors).toEqual([])
  })
}

test("quick research still hides publishing without permission", async ({ page }) => {
  await prepare(page, false)
  await page.goto(`/general-deepinsight/session/${researchId}?publish=1`)
  await expect(page.locator(".general-research-result")).toBeVisible()
  await expect(page.getByRole("dialog", { name: "添加至案例库", exact: true })).toHaveCount(0)
})

for (const source of ["opencode", "langgraph"] as const) {
  test(`${source} history prompts before issuing a delete and cancel leaves the task intact`, async ({ page }) => {
    await prepare(page)
    const deleted: string[] = []
    const endpoint =
      source === "opencode"
        ? "/api/dockapi/sessions/business-publish-test"
        : `/api/dockapi/general-deepinsight/sessions/${researchId}`
    await page.route(`**${endpoint}`, (route) => {
      if (route.request().method() !== "DELETE") return route.fallback()
      deleted.push(new URL(route.request().url()).pathname)
      return route.fulfill({ json: { code: 200, data: null } })
    })
    await page.goto("/app")
    const row = page.locator(`[data-component="cmcc-history-row"][data-source="${source}"]`).filter({
      hasText: source === "opencode" ? "深度研究发布测试" : "快速研究发布测试",
    })
    const open = async () => {
      await row.hover()
      await row.getByRole("button", { name: source === "opencode" ? "更多" : "研究任务操作", exact: true }).click()
      await page.getByRole("menuitem", { name: "删除", exact: true }).click()
    }
    await open()
    const dialog = page.getByRole("dialog", { name: "删除历史任务", exact: true })
    await expect(dialog).toHaveAttribute("data-cmcc-delete-confirmation", "")
    await dialog.getByRole("button", { name: "取消", exact: true }).click()
    await expect(row).toBeVisible()
    expect(deleted).toEqual([])
    await open()
    await dialog.getByRole("button", { name: "确认删除", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect(deleted).toEqual([endpoint])
  })
}
