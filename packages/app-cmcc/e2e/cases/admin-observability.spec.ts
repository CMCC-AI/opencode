import { expect, test, type Page } from "@playwright/test"
import { setupHomePage } from "../startup/home-fixture"

test.use({ locale: "zh-CN" })
const stamp = "2026-11-23T10:00:00"
const sample = {
  id: "test-task",
  userId: 7,
  engine: "opencode",
  product: "deeptrading",
  createdAt: stamp,
  updatedAt: stamp,
  checkedAt: "2026-11-23T02:03:00Z",
  status: "retrying",
  retryAttempt: 2,
}

async function setup(page: Page, userType: "super_admin" | "admin" | "user" = "super_admin") {
  await setupHomePage(page)
  await page.route("**/api/user/profile", (route) =>
    route.fulfill({
      json: {
        code: 200,
        data: {
          user: { id: 9, name: "测试账号", enabled: true, userType, caseManagementAllowed: false },
          workspace: { id: 9, workspaceKey: "admin-ops", directoryPath: "C:/admin-ops", status: "READY" },
        },
      },
    }),
  )
  const requests: URL[] = []
  await page.route("**/api/admin/**", (route) => {
    const url = new URL(route.request().url())
    requests.push(url)
    const pageNum = Number(url.searchParams.get("page") || 1)
    const items = (data: unknown[], total = data.length) =>
      route.fulfill({ json: { code: 200, data: { items: data, total, page: pageNum, size: 10 } } })
    if (url.pathname.endsWith("/operations")) {
      return items([
        {
          id: 1,
          actorId: 9,
          action: "user.update",
          target: "user:7",
          changes: ["设为 VIP"],
          result: "success",
          createdAt: stamp,
        },
      ])
    }
    if (url.pathname.endsWith("/logins")) {
      return items([{ id: 2, userId: null, account: "188****1111", result: "limited", createdAt: stamp }])
    }
    if (url.pathname.endsWith("/tasks")) {
      return pageNum === 1
        ? items([sample], 11)
        : items([{ ...sample, id: "old-task", status: "unavailable", retryAttempt: null }], 11)
    }
    if (url.pathname.endsWith("/tasks/opencode/test-task")) {
      return route.fulfill({
        json: {
          code: 200,
          data: {
            task: { ...sample, status: "idle" },
            recent: {
              result: "failed",
              provider: "zhipuai",
              model: "test-model",
              startedMs: null,
              endedMs: null,
              elapsedSeconds: 75,
              reason: "模型供应商余额不足或无可用资源",
            },
          },
        },
      })
    }
    if (url.pathname.endsWith("/statistics")) {
      return route.fulfill({
        json: {
          code: 200,
          data: {
            timezone: "Asia/Shanghai",
            newUsers: 2,
            activeUsers: 1,
            newTasks: 3,
            trend: [{ day: "2026-11-23", newUsers: 2, activeUsers: 1, newTasks: 3, tokens: null }],
            products: [{ engine: "langgraph", product: "general-deepinsight", count: 3 }],
            usage: {
              tableAvailable: false,
              collectionEnabled: false,
              firstRecordedMs: null,
              total: null,
              incompleteRecords: 0,
              accounts: [],
              models: [],
            },
          },
        },
      })
    }
    return items([])
  })
  return requests
}

test("super administrator can query operation records and masked login events", async ({ page }) => {
  const requests = await setup(page)
  await page.goto("/admin/security")
  const navigation = page.getByRole("navigation", { name: "管理导航" })
  await expect(navigation.getByRole("link")).toHaveText(["用户管理", "案例管理"])
  await expect(page.getByText("设为 VIP", { exact: true })).toBeVisible()
  await page.getByLabel("操作人 ID").fill("9")
  await page.getByRole("button", { name: "查询", exact: true }).click()
  await expect
    .poll(() => requests.find((request) => request.searchParams.get("actorId") === "9")?.pathname)
    .toBe("/api/admin/security/operations")
  await page.getByRole("button", { name: "登录记录", exact: true }).click()
  await expect(page.getByText("188****1111")).toBeVisible()
  await expect(page.getByRole("cell", { name: "暂时受限" })).toBeVisible()
})

test("normal administrator cannot see login events and business users cannot enter", async ({ page }) => {
  const requests = await setup(page, "admin")
  await page.goto("/admin/security")
  await expect(page.getByText("设为 VIP", { exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "登录记录", exact: true })).toHaveCount(0)
  await expect(page.getByLabel("操作人 ID")).toHaveCount(0)
  expect(requests.every((url) => !url.pathname.endsWith("/logins"))).toBeTruthy()
  await setup(page, "user")
  await page.goto("/admin/tasks")
  await expect(page.getByText("当前账号无管理权限")).toBeVisible()
})

test("task table is paginated and only opens the latest result on demand", async ({ page }) => {
  const requests = await setup(page)
  await page.goto("/admin/tasks")
  await expect(page.getByText("重试中（第 2 次）")).toBeVisible()
  expect(requests.every((url) => !url.pathname.includes("/tasks/opencode"))).toBeTruthy()
  await page.getByRole("button", { name: "查看任务 test-task" }).click()
  const detail = page.getByRole("dialog", { name: "任务详情" })
  await expect(detail.getByText("当前未运行", { exact: true })).toBeVisible()
  await expect(detail.getByText("模型供应商余额不足或无可用资源")).toBeVisible()
  await expect(detail.getByText("1分 15秒")).toBeVisible()
  await detail.getByRole("button", { name: "关闭", exact: true }).click()
  await page.getByRole("button", { name: "下一页", exact: true }).click()
  await expect(page.getByText("old-task", { exact: true })).toBeVisible()
  await expect(page.getByText("状态暂不可用", { exact: true })).toBeVisible()
  expect(
    requests
      .filter((request) => request.pathname.endsWith("/tasks"))
      .at(-1)
      ?.searchParams.get("page"),
  ).toBe("2")
})

test("statistics distinguishes absent usage from zero and fits narrow widths", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setup(page)
  await page.goto("/admin/statistics")
  await expect(page.getByRole("heading", { name: "统计报表" })).toBeVisible()
  await expect(page.getByText("没有可用的用量采集历史。", { exact: false })).toBeVisible()
  await expect(page.getByRole("cell", { name: "未记录", exact: true })).toBeVisible()
  await expect(page.getByText("通用深度研究", { exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
})
