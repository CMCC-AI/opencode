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

test("provider menus select models, search, preserve drafts and switch real modes", async ({ page }, info) => {
  await openHome(page)
  const editor = page.locator(`${composer} [data-component="prompt-input"]`)
  await editor.fill("这段草稿不能丢失")
  const before = await page.locator(composer).boundingBox()
  await page.locator(modelTrigger).click()
  await expect(page.getByRole("menu", { name: "选择模型", exact: true })).toBeVisible()
  const deepseek = page.getByRole("menuitem", { name: "DeepSeek", exact: true })
  await expect(deepseek.locator('[data-component="provider-icon"]')).toBeVisible()
  await deepseek.hover()
  await expect(page.getByRole("menuitemradio", { name: "DeepSeek 测试模型" })).toBeVisible()
  await expect(page.locator(".home-model-submenu")).toHaveCSS("opacity", "1")
  await page.screenshot({ path: info.outputPath("models.png") })
  await page.getByRole("menuitemradio", { name: "DeepSeek 测试模型" }).click()
  await expect(page.locator(modelTrigger)).toContainText("DeepSeek 测试模型")
  await expect(editor).toHaveText("这段草稿不能丢失")
  expect(await page.locator(composer).boundingBox()).toEqual(before)
  await page.getByRole("button", { name: "计划", exact: true }).click()
  await expect(page.getByRole("button", { name: "计划", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(page.getByRole("button", { name: "执行", exact: true })).toHaveAttribute("aria-pressed", "false")
  await page.getByRole("button", { name: "执行", exact: true }).click()
  await expect(page.getByRole("button", { name: "执行", exact: true })).toHaveAttribute("aria-pressed", "true")
  await expect(editor).toHaveText("这段草稿不能丢失")
  await page.locator(modelTrigger).click()
  await page.getByRole("searchbox", { name: "搜索模型" }).fill("网关测试")
  await expect(page.getByRole("menuitem", { name: "公司网关", exact: true })).toBeVisible()
  await expect(deepseek).toHaveCount(0)
  await page.keyboard.press("Escape")
  await expect(page.getByRole("menu", { name: "选择模型", exact: true })).toHaveCount(0)
  await page.locator(modelTrigger).click()
  await page.getByRole("menuitem", { name: "管理模型", exact: true }).click()
  await expect(page.getByRole("dialog")).toBeVisible()
})

test("models work with only free providers", async ({ page }) => {
  await setupHomePage(page, { models: true, free: true })
  await page.goto("/app")
  await page.locator(modelTrigger).click()
  await page.getByRole("menuitem", { name: "DeepInsight", exact: true }).hover()
  await page.getByRole("menuitemradio", { name: "测试免费模型" }).click()
  await expect(page.locator(modelTrigger)).toContainText("测试免费模型")
})

test("empty model lists retain the setup entries", async ({ page }) => {
  await setupHomePage(page)
  await page.goto("/app")
  await page.locator(modelTrigger).click()
  await expect(page.getByText("暂无可选模型", { exact: true })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "管理模型", exact: true })).toBeVisible()
  await expect(page.getByRole("menuitem", { name: "连接提供商", exact: true })).toBeVisible()
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
