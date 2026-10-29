import { expect, test, type Page } from "@playwright/test"
import { base64Encode } from "@opencode-ai/core/util/encode"
import { homeSession, setupHomePage } from "./home-fixture"

test.use({ locale: "zh-CN" })
const composer = '[data-component="session-new-composer"]'
const menu = '[data-component="cmcc-prompt-action-menu"]'
const modelTrigger = '[data-action="prompt-model"]'

async function openHome(page: Page, width = 1440) {
  await page.setViewportSize({ width, height: 900 })
  await setupHomePage(page, { models: true })
  await page.goto("/app")
  await expect(page.locator(composer)).toBeVisible()
  if (width < 760) {
    await page.getByRole("button", { name: "隐藏左栏" }).click()
    await expect
      .poll(() =>
        page.locator('aside[aria-label="CMCC conversations"]').evaluate((node) => node.getBoundingClientRect().width),
      )
      .toBeLessThanOrEqual(1)
  }
  await expect(page.locator(modelTrigger)).not.toBeDisabled()
  await page.evaluate(() => document.fonts.ready)
}

for (const width of [1440, 390, 320]) {
  test(`floating actions preserve the composer position at ${width}`, async ({ page }, info) => {
    await openHome(page, width)
    const before = await page.locator(composer).boundingBox()
    const title = await page.locator(".cmcc-home-brand").boundingBox()
    const trigger = page.getByRole("button", { name: "打开更多操作" })
    await trigger.click()
    await expect(page.locator(menu)).toBeVisible()
    expect(await page.locator(composer).boundingBox()).toEqual(before)
    expect(await page.locator(".cmcc-home-brand").boundingBox()).toEqual(title)
    const box = await page.locator(menu).boundingBox()
    expect(box!.width).toBe(216)
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(width)
    const anchor = await trigger.boundingBox()
    expect(box!.y + box!.height).toBeLessThanOrEqual(anchor!.y)
    if (width === 1440) expect(Math.abs(box!.x + box!.width / 2 - anchor!.x - anchor!.width / 2)).toBeLessThan(1)
    await page.screenshot({ path: info.outputPath("actions.png") })
    await page.getByRole("button", { name: "专业数据库", exact: true }).click()
    await expect(page.getByRole("dialog", { name: "专业数据库", exact: true })).toBeVisible()
    expect(await page.locator(composer).boundingBox()).toEqual(before)
    await page.keyboard.press("Escape")
    await expect(page.locator(menu)).toHaveCount(0)
    await trigger.click()
    await page.getByRole("button", { name: "知识库", exact: true }).click()
    await expect(page.getByRole("dialog", { name: "选择知识库" })).toBeVisible()
    expect(await page.locator(composer).boundingBox()).toEqual(before)
    await page.getByRole("button", { name: "关闭选择知识库" }).click()
    await trigger.click()
    await page.getByRole("button", { name: "技能", exact: true }).click()
    await expect(page.getByRole("dialog", { name: "技能", exact: true })).toBeVisible()
    expect(await page.locator(composer).boundingBox()).toEqual(before)
    await page.getByRole("button", { name: "关闭技能" }).click()
    await trigger.click()
    await page.locator(".cmcc-home-brand").click()
    await expect(page.locator(menu)).toHaveCount(0)
    await trigger.focus()
    await page.keyboard.press("ArrowUp")
    await expect(page.getByRole("button", { name: "添加文件和图片" })).toBeFocused()
    const chooser = page.waitForEvent("filechooser")
    await page.getByRole("button", { name: "添加文件和图片" }).click()
    await chooser
    await expect(page.locator(menu)).toHaveCount(0)
  })
}

test("model family menus select models, search, preserve drafts and switch real modes", async ({ page }, info) => {
  await openHome(page)
  const editor = page.locator(`${composer} [data-component="prompt-input"]`)
  await editor.fill("这段草稿不能丢失")
  const before = await page.locator(composer).boundingBox()
  await page.locator(modelTrigger).click()
  await expect(page.getByRole("menu", { name: "选择模型", exact: true })).toBeVisible()
  for (const name of ["Qwen", "DeepSeek", "Kimi", "GLM", "其他"])
    await expect(page.getByRole("menuitem", { name, exact: true })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "公司网关", exact: true })).toHaveCount(0)
  await expect(page.getByRole("menuitem", { name: "管理模型", exact: true })).toHaveCount(0)
  await expect(page.getByRole("menuitem", { name: "连接提供商", exact: true })).toHaveCount(0)
  const deepseek = page.getByRole("menuitem", { name: "DeepSeek", exact: true })
  await expect(deepseek.locator('[data-component="provider-icon"]')).toBeVisible()
  await deepseek.hover()
  await expect(page.getByRole("menuitemradio", { name: "DeepSeek 测试模型" })).toBeVisible()
  await expect(page.locator(".home-model-submenu")).toHaveCSS("opacity", "1")
  await page.screenshot({ path: info.outputPath("models.png") })
  await page.getByRole("menuitemradio", { name: "DeepSeek 测试模型" }).click()
  await expect(page.locator(modelTrigger)).toContainText("DeepSeek 测试模型")
  await expect(editor).toHaveText("这段草稿不能丢失")
  await expect(editor).toBeFocused()
  expect(await page.locator(composer).boundingBox()).toEqual(before)
  await page.getByRole("button", { name: "计划", exact: true }).click()
  await expect(page.getByRole("button", { name: "计划", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("button", { name: "执行", exact: true })).toHaveAttribute("aria-pressed", "false")
  await page.getByRole("button", { name: "执行", exact: true }).click()
  await expect(page.getByRole("button", { name: "执行", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(editor).toHaveText("这段草稿不能丢失")
  await expect(editor).toBeFocused()
  await page.locator(modelTrigger).click()
  await page.getByRole("searchbox", { name: "搜索模型" }).fill("网关测试")
  await expect(page.getByRole("menuitem", { name: "其他", exact: true })).toBeVisible()
  await expect(deepseek).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu", { name: "选择模型", exact: true })).toHaveCount(0)
})

test("Free models remain hidden even when they are the only available models", async ({ page }) => {
  await setupHomePage(page, { models: true, free: true })
  await page.goto("/app")
  await page.locator(modelTrigger).click()
  await expect(page.getByRole("menuitem", { name: "Free", exact: true })).toHaveCount(0)
  await expect(page.getByRole("menuitemradio", { name: "测试免费模型" })).toHaveCount(0)
  await expect(page.getByText("暂无可选模型", { exact: true })).toBeVisible()
  await page.getByRole("searchbox", { name: "搜索模型" }).fill("免费")
  await expect(page.getByText("暂无可选模型", { exact: true })).toBeVisible()
})

test("new drafts prefer Bailian Flash and retain manual model choices", async ({ page }, info) => {
  await setupHomePage(page, { models: true, bailian: true })
  await page.route(/\/(?:global\/)?config(?:\?|$)/, (route) =>
    route.fulfill({ json: { model: "alibaba-cn/glm-5.2" } }),
  )
  await page.goto("/app")
  await expect(page.locator(modelTrigger)).toContainText("Qwen3.7 Flash")
  await page.locator(modelTrigger).click()
  await expect(page.getByRole("menuitem", { name: "Free", exact: true })).toHaveCount(0)
  await page.getByRole("menuitem", { name: "Qwen", exact: true }).hover()
  const bailian = page.getByRole("menuitemradio", { name: "Qwen3.7 Flash 阿里云百炼", exact: true })
  const alibaba = page.getByRole("menuitemradio", { name: "Qwen3.7 Flash Alibaba", exact: true })
  await expect(bailian).toHaveAttribute("aria-checked", "true")
  await expect(alibaba).toHaveAttribute("aria-checked", "false")
  await expect(page.locator(".home-model-submenu")).toHaveCSS("opacity", "1")
  await page.screenshot({ path: info.outputPath("bailian-default.png") })
  await alibaba.click()
  await page.getByRole("button", { name: "计划", exact: true }).click()
  await page.getByRole("button", { name: "执行", exact: true }).click()
  await page.locator(modelTrigger).click()
  await page.getByRole("menuitem", { name: "Qwen", exact: true }).hover()
  await expect(alibaba).toHaveAttribute("aria-checked", "true")
  await expect(bailian).toHaveAttribute("aria-checked", "false")
  await page.getByRole("searchbox", { name: "搜索模型" }).fill("免费")
  await expect(page.getByText("暂无可选模型", { exact: true })).toBeVisible()
})

test("empty model lists hide the model setup entries", async ({ page }) => {
  await setupHomePage(page)
  await page.goto("/app")
  await page.locator(modelTrigger).click()
  await expect(page.getByText("暂无可选模型", { exact: true })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "管理模型", exact: true })).toHaveCount(0)
  await expect(page.getByRole("menuitem", { name: "连接提供商", exact: true })).toHaveCount(0)
})

test("same-ID models in one family retain their actual provider selection", async ({ page }, info) => {
  await setupHomePage(page, { models: true, duplicateModels: true })
  await page.goto("/app")
  await page.locator(modelTrigger).click()
  await page.getByRole("menuitem", { name: "Qwen", exact: true }).hover()
  const direct = page.getByRole("menuitemradio", { name: "Qwen 测试模型 Qwen", exact: true })
  const gateway = page.getByRole("menuitemradio", { name: "Qwen 测试模型 公司网关", exact: true })
  await expect(direct).toBeVisible()
  await expect(gateway).toBeVisible()
  await expect(page.locator(".home-model-submenu")).toHaveCSS("opacity", "1")
  await page.screenshot({ path: info.outputPath("duplicate-models.png") })
  await gateway.click()
  await page.locator(modelTrigger).click()
  await page.getByRole("menuitem", { name: "Qwen", exact: true }).hover()
  await expect(gateway).toHaveAttribute("aria-checked", "true")
  await expect(direct).toHaveAttribute("aria-checked", "false")
  await direct.click()
  await page.locator(modelTrigger).click()
  await page.getByRole("menuitem", { name: "Qwen", exact: true }).hover()
  await expect(direct).toHaveAttribute("aria-checked", "true")
  await expect(gateway).toHaveAttribute("aria-checked", "false")
})

test("touch-sized model menus stay inside the viewport", async ({ page }, info) => {
  await openHome(page, 390)
  await page.locator(modelTrigger).click()
  await page.getByRole("menuitem", { name: "DeepSeek", exact: true }).click()
  const option = page.getByRole("menuitemradio", { name: "DeepSeek 测试模型" })
  await expect(option).toBeVisible()
  await expect(page.locator(".home-model-submenu")).toHaveCSS("opacity", "1")
  const box = await option.boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: info.outputPath("mobile-models.png") })
  await option.click()
  await expect(page.locator(modelTrigger)).toContainText("DeepSeek 测试模型")
})

for (const free of [false, true]) {
  test(`history model menus show family groups without setup actions (free=${free})`, async ({
    page,
    baseURL,
  }, info) => {
    await setupHomePage(page, { models: true, history: true, free })
    await page.goto(`/server/${base64Encode(baseURL!)}/session/${homeSession.id}`)
    await expect(page.locator('[data-component="session-composer"]')).toBeVisible()
    await page.locator(modelTrigger).click()
    await expect(page.getByText("Free", { exact: true })).toHaveCount(0)
    if (!free) await expect(page.getByText("Kimi", { exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "管理模型", exact: true })).toHaveCount(0)
    await expect(page.getByRole("button", { name: "连接提供商", exact: true })).toHaveCount(0)
    await expect(page.getByText("公司网关", { exact: true })).toHaveCount(0)
    await page.screenshot({ path: info.outputPath("history-models.png") })
    if (free) {
      await expect(page.getByRole("button", { name: "测试免费模型 免费", exact: true })).toHaveCount(0)
      await expect(page.getByText("未找到模型", { exact: true })).toBeVisible()
      return
    }
    await page.getByRole("button", { name: "Kimi 测试模型", exact: true }).click()
    await expect(page.locator(modelTrigger)).toContainText("Kimi 测试模型")
  })
}

test("history restores its model rather than applying the new draft default", async ({ page, baseURL }) => {
  await setupHomePage(page, { models: true, history: true, bailian: true })
  await page.route(`**/session/${homeSession.id}/message*`, (route) =>
    route.fulfill({
      json: [
        {
          info: {
            id: "msg_existing_model",
            sessionID: homeSession.id,
            role: "user",
            time: { created: 1 },
            agent: "build",
            model: { providerID: "alibaba-cn", modelID: "kimi-k2.6" },
          },
          parts: [
            {
              id: "part_existing_model",
              messageID: "msg_existing_model",
              sessionID: homeSession.id,
              type: "text",
              text: "保留历史模型",
            },
          ],
        },
      ],
    }),
  )
  await page.goto(`/server/${base64Encode(baseURL!)}/session/${homeSession.id}`)
  await expect(page.locator(modelTrigger)).toContainText("Kimi 测试模型")
  await page.reload()
  await expect(page.locator(modelTrigger)).toContainText("Kimi 测试模型")
})

test("history sessions retain their existing model and agent controls", async ({ page, baseURL }) => {
  await setupHomePage(page, { models: true, history: true })
  await page.goto(`/server/${base64Encode(baseURL!)}/session/${homeSession.id}`)
  await expect(page.locator('[data-component="session-composer"]')).toBeVisible()
  await expect(page.locator(".home-agent-control")).toHaveCount(0)
  await expect(page.locator('[data-action="prompt-agent"]')).toContainText("构建")
  await page.getByRole("button", { name: "打开更多操作" }).click()
  await expect(page.locator('[data-component="cmcc-prompt-panels"]')).toBeVisible()
  await expect(page.locator(".home-actions-popover")).toHaveCount(0)
})
