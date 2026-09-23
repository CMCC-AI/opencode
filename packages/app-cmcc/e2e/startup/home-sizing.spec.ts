import { expect, test } from "@playwright/test"
import { setupHomePage } from "./home-fixture"

test.use({ locale: "zh-CN" })

const baseline = process.env.CMCC_HOME_BASELINE === "1"
const home = '[data-component="session-new-design"]'
const composer = '[data-component="session-new-composer"]'
const editor = `${home} [data-component="prompt-input"]`

for (const viewport of [
  { width: 1672, height: 941 },
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 320, height: 740 },
]) {
  test(`homepage sizing at ${viewport.width}x${viewport.height}`, async ({ page }, info) => {
    await page.setViewportSize(viewport)
    await setupHomePage(page)
    await page.goto("/app", { waitUntil: "domcontentloaded" })
    await expect(page.locator(editor)).toBeVisible()
    if (viewport.width < 760) {
      await page.getByRole("button", { name: "隐藏左栏", exact: true }).click()
      await expect
        .poll(() =>
          page
            .locator('aside[aria-label="CMCC conversations"]')
            .evaluate((sidebar) => sidebar.getBoundingClientRect().width),
        )
        .toBeLessThanOrEqual(1)
    }
    await page.evaluate(() => document.fonts.ready)
    const metrics = await page.evaluate(
      ({ home, composer, editor }) => {
        const bounds = (selector: string) => {
          const element = document.querySelector(selector)
          if (!element) throw new Error(`Missing element: ${selector}`)
          const rect = element.getBoundingClientRect()
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            font: getComputedStyle(element).fontSize,
          }
        }
        return {
          readyMs: performance.getEntriesByName("home-ready")[0]?.startTime,
          paints: performance
            .getEntriesByType("paint")
            .map((entry) => ({ name: entry.name, startTime: entry.startTime })),
          title: bounds(`${home} h1`),
          subtitle: bounds(`${home} p`),
          logo: bounds(`${home} img`),
          composer: bounds(composer),
          editor: bounds(editor),
        }
      },
      { home, composer, editor },
    )
    console.log(JSON.stringify({ baseline, viewport, ...metrics }))
    await info.attach("home-metrics", { body: JSON.stringify(metrics, null, 2), contentType: "application/json" })
    await page.screenshot({ path: info.outputPath(baseline ? "home-before.png" : "home-after.png") })
    if (baseline) return
    const placeholder = "请告诉您要研究的问题？@召唤领域专家团，/调用技能与指令"
    await expect(page.locator('[data-component="session-new-design-text"]')).toHaveText(placeholder)
    await expect(page.locator(editor)).toHaveAttribute("aria-label", placeholder)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width)
    expect(metrics.composer.x).toBeGreaterThanOrEqual(0)
    expect(metrics.composer.x + metrics.composer.width).toBeLessThanOrEqual(viewport.width)
    expect(metrics.title.y + metrics.title.height).toBeLessThanOrEqual(metrics.subtitle.y)
    expect(metrics.subtitle.y + metrics.subtitle.height).toBeLessThanOrEqual(metrics.composer.y)
    expect(metrics.editor.font).toBe("17px")
    expect(metrics.editor.y).toBeGreaterThanOrEqual(metrics.composer.y)
    expect(metrics.composer.height).toBe(viewport.width >= 760 ? 160 : 200)
    await expect(page.locator(`${home} [data-action="prompt-model"]`)).toHaveCSS("font-size", "15px")
    await expect(page.getByRole("button", { name: "执行", exact: true })).toBeVisible()
    if (viewport.width >= 1440) {
      expect(metrics.title.font).toBe("43px")
      expect(metrics.subtitle.font).toBe("27px")
      expect(metrics.logo.height).toBe(58)
      expect(metrics.composer.width).toBe(900)
      await expect(page.locator('aside img[alt="深度洞察"]')).toHaveCSS("height", "44px")
    }
    await page.locator(editor).fill("请帮我分析这个研究主题，保留当前输入内容。")
    await expect(page.locator(editor)).toHaveText("请帮我分析这个研究主题，保留当前输入内容。")
    await expect(page.locator('[data-component="session-new-design-text"]')).toBeHidden()
    const input = await page.locator(editor).boundingBox()
    expect(input!.x + input!.width).toBeLessThanOrEqual(metrics.composer.x + metrics.composer.width)
    await page.getByRole("button", { name: "打开更多操作" }).click()
    await expect(page.locator('[data-component="session-new-composer"]')).toBeVisible()
  })
}
