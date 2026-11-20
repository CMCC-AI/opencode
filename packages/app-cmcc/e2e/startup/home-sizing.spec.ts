import { expect, test } from "@playwright/test"
import { selectHomeTeam, setupHomePage } from "./home-fixture"

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
    if (!baseline) await selectHomeTeam(page, "灵犀")
    await page.evaluate(() => document.fonts.ready)
    await page.locator(".cmcc-page-content").evaluate((element) =>
      Promise.all(element.getAnimations().map((animation) => animation.finished.catch(() => undefined))),
    )
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
          greeting: document.querySelector(".cmcc-home-greeting") ? bounds(".cmcc-home-greeting") : undefined,
          subtitle: bounds(`${home} p`),
          logo: bounds(document.querySelector(".cmcc-home-greeting img") ? ".cmcc-home-greeting img" : `${home} img`),
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
    expect(metrics.title.height).toBeLessThanOrEqual(Number.parseFloat(metrics.title.font) * 1.25 + 6)
    expect(metrics.subtitle.y + metrics.subtitle.height).toBeLessThanOrEqual(metrics.composer.y)
    expect(metrics.greeting!.x).toBeCloseTo(metrics.composer.x, 1)
    expect(metrics.title.x).toBeCloseTo(metrics.composer.x, 1)
    expect(metrics.subtitle.x).toBeCloseTo(metrics.composer.x, 1)
    const wide = viewport.width >= 1440
    expect(metrics.editor.font).toBe(wide ? "22.176px" : "14px")
    expect(metrics.editor.y).toBeGreaterThanOrEqual(metrics.composer.y)
    expect(metrics.composer.height).toBeCloseTo(wide ? 190.08 : 200, 1)
    await expect(page.locator(`${home} [data-action="prompt-model"]`)).toHaveCSS("font-size", "15px")
    await expect(page.getByRole("button", { name: "执行", exact: true })).toBeVisible()
    if (wide) {
      expect(metrics.title.font).toBe("50.688px")
      expect(metrics.subtitle.font).toBe("22.176px")
      expect(metrics.logo.height).toBeCloseTo(57.024, 1)
      expect(metrics.composer.width).toBeCloseTo(950.4, 1)
      await expect(page.locator(".cmcc-sidebar-brand").getByText("深度洞察", { exact: true })).toHaveCSS("font-size", "20px")
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
