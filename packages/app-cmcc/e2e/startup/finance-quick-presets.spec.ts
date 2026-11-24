import { expect, test } from "@playwright/test"
import { selectHomeTeam, setupHomePage } from "./home-fixture"

test.use({ locale: "zh-CN" })

for (const width of [1440, 390]) {
  test(`finance quick presets match the two modes and stay within the composer at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await setupHomePage(page, { models: true, teams: true })
    await page.route("**/agent?*", (route) =>
      route.fulfill({
        json: [
          "build",
          "plan",
          "deepinsight/deepinsight-team-lead",
          "deeptrading/deeptrading-team-lead",
          "deeptrading/deeptrading-quick",
          "deeptrading/deeptrading-lite-quick",
        ].map((name) => ({ name, mode: "primary" })),
      }),
    )
    await page.goto("/app")
    if (width === 390) await page.getByRole("button", { name: "隐藏左栏", exact: true }).click()
    const bar = page.locator('[data-component="quick-preset-bar"]')
    await expect(bar).toHaveCount(0)
    await selectHomeTeam(page, "DeepTrading 财经分析专家团")
    const teamMode = page.getByRole("group", { name: "团队模式" })
    const quickMode = teamMode.getByRole("button", { name: "快速", exact: true })
    await quickMode.click()

    const quick = bar.getByRole("button", { name: "快速问答", exact: true })
    const analysis = bar.getByRole("button", { name: /^选择分析大类/ })
    const menu = page.getByRole("menu", { name: "分析大类" })
    const chooseCategory = async (name: string) => {
      await analysis.click()
      await menu.getByRole("menuitemradio", { name, exact: true }).click()
      await expect(page.locator(".quick-preset-menu")).toHaveCount(0)
    }
    const input = page.locator('[data-component="session-new-composer"] [data-component="prompt-input"]')
    const market = bar.getByRole("group", { name: "大势研判场景" })
    await expect(analysis).toHaveText("大势研判")
    await expect(quick).toHaveAttribute("aria-pressed", "true")
    await expect(quick).toHaveCSS("background-image", /linear-gradient/)
    await expect(analysis).toHaveAttribute("aria-pressed", "false")
    await expect(market).toHaveCount(0)
    await expect(input).toHaveText("")

    await analysis.press("ArrowDown")
    await expect(menu.getByRole("menuitemradio")).toHaveText(["大势研判", "行业分析", "股票诊断", "AI复盘"])
    await page.keyboard.press("Escape")
    await expect(page.locator(".quick-preset-menu")).toHaveCount(0)
    await expect(analysis).toBeFocused()

    await quick.click()
    await expect(quick).toHaveAttribute("aria-pressed", "true")
    await expect(quick).toHaveCSS("background-image", /linear-gradient/)
    await expect(analysis).toHaveAttribute("aria-pressed", "false")
    await expect(market).toHaveCount(0)
    await expect(input).toContainText("一句话快速看下")
    await page.screenshot({ path: info.outputPath("finance-quick-qa.png") })

    await chooseCategory("大势研判")
    await expect(market).toBeVisible()
    await expect(market.locator('button[aria-pressed="true"]')).toHaveCount(0)
    await expect(quick).toHaveAttribute("aria-pressed", "false")
    await expect(analysis).toHaveAttribute("aria-pressed", "true")
    await expect(analysis).toHaveCSS("background-image", /linear-gradient/)
    await quickMode.click()
    await expect(market).toBeVisible()

    await chooseCategory("行业分析")
    await expect(analysis).toHaveText("行业分析")
    const industry = bar.getByRole("group", { name: "行业分析场景" })
    const trend = industry.getByRole("button", { name: "行业趋势" })
    const sector = industry.getByRole("button", { name: "板块分析" })
    await expect(industry.getByRole("button")).toHaveCount(4)
    await expect(industry.locator('button[aria-pressed="true"]')).toHaveCount(0)
    await trend.click()
    await expect(input).toContainText("未来1-2年")
    await sector.click()
    await expect(trend).toHaveAttribute("aria-pressed", "false")
    await expect(sector).toHaveAttribute("aria-pressed", "true")
    await expect(input).toContainText("未来6个月")

    const barBox = (await bar.boundingBox())!
    for (const button of await bar.getByRole("button").all()) {
      const box = (await button.boundingBox())!
      expect(box.x).toBeGreaterThanOrEqual(barBox.x)
      expect(box.x + box.width).toBeLessThanOrEqual(barBox.x + barBox.width + 1)
    }
    if (width === 1440) {
      expect((await trend.boundingBox())!.y).toBeCloseTo((await analysis.boundingBox())!.y, 0)
    }
    await page.screenshot({ path: info.outputPath("finance-categories.png") })

    await chooseCategory("股票诊断")
    await expect(bar.getByRole("button", { name: "诊股报告" })).toBeVisible()
    await expect(industry).toHaveCount(0)
    await chooseCategory("AI复盘")
    await expect(bar.getByRole("button", { name: "操作复盘" })).toBeVisible()
    await teamMode.getByRole("button", { name: "专家", exact: true }).click()
    await expect(bar).toHaveCount(0)
    await quickMode.click()
    await expect(quick).toHaveAttribute("aria-pressed", "true")
    await expect(bar.getByRole("group", { name: "AI复盘场景" })).toHaveCount(0)
  })
}
