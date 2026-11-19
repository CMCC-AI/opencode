import { expect, test } from "@playwright/test"
import { selectHomeTeam, setupHomePage } from "./home-fixture"

test.use({ locale: "zh-CN" })

test("home applies the neutral and blue style without changing its controls", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setupHomePage(page, { models: true, history: true })
  await page.goto("/app")
  const sidebar = page.getByRole("complementary", { name: "CMCC conversations" })
  const home = page.locator(".cmcc-home")
  const shell = page.locator(".cmcc-shell")
  await expect(home).toHaveCSS("background-color", "rgb(252, 252, 253)")
  const homeColor = await home.evaluate((el) => getComputedStyle(el).backgroundColor)
  await expect(shell).toHaveCSS("background-color", homeColor)
  await expect(sidebar).toHaveCSS("background-color", "rgb(248, 249, 251)")
  await expect(sidebar.getByRole("button", { name: "深度研究", exact: true })).toHaveAttribute(
    "data-selected",
    "",
  )
  await expect(sidebar.getByRole("button", { name: "新对话", exact: true }).first()).toHaveCSS(
    "background-color",
    "rgb(79, 106, 214)",
  )
  await expect(page.getByRole("heading", { name: "DeepInsight深度洞察", exact: true })).toHaveCSS(
    "color",
    "rgb(23, 28, 38)",
  )
  const composer = page.locator('[data-component="session-new-composer"]')
  await selectHomeTeam(page, "灵犀")
  await expect(composer).toHaveCSS("border-top-width", "1px")
  await composer.locator('[data-component="prompt-input"]').fill("保留原来的对话操作与草稿")
  await expect(composer).toHaveCSS("border-top-color", "rgb(165, 181, 233)")
  await expect(page.getByRole("button", { name: "执行", exact: true })).toBeVisible()
  await expect(page.getByRole("button", { name: "计划", exact: true })).toBeVisible()
  await page.screenshot({ path: info.outputPath("home.png") })
  await sidebar.getByRole("button", { name: "隐藏左栏" }).click()
  await expect(sidebar).toHaveCSS("width", "64px")
  await expect(shell).toHaveCSS("background-color", homeColor)
  await page.screenshot({ path: info.outputPath("home-rail.png") })
})

test("the compact account footer keeps its blue avatar and menu when the sidebar folds", async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setupHomePage(page)
  await page.goto("/app")
  const sidebar = page.getByRole("complementary", { name: "CMCC conversations" })
  const footer = sidebar.locator(".cmcc-sidebar-footer")
  const account = footer.getByRole("button", { name: "Home sizing test", exact: true })
  const avatar = account.locator(".cmcc-account-avatar")

  await expect(footer).toHaveCSS("height", "53px")
  await expect(account).toHaveCSS("height", "36px")
  await expect(avatar).toHaveCSS("background-color", "rgb(232, 241, 255)")
  await expect(avatar).toHaveCSS("color", "rgb(53, 102, 163)")
  await expect(avatar).toHaveText("H")
  await footer.screenshot({ path: info.outputPath("account-footer.png") })

  for (const folded of [false, true]) {
    if (folded) {
      await sidebar.getByRole("button", { name: "隐藏左栏" }).click()
      await expect(sidebar).toHaveCSS("width", "64px")
      await expect(avatar).toBeVisible()
    }
    await account.click()
    await expect(page.getByRole("menuitem", { name: "Token 额度", exact: true })).toBeVisible()
    await page.keyboard.press("Escape")
    await expect(account).toHaveAttribute("aria-expanded", "false")
  }
})

test("new chat stays prominent and actionable in the sidebar rail", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setupHomePage(page, { models: true })
  await page.goto("/expert")
  const sidebar = page.getByRole("complementary", { name: "CMCC conversations" })
  const nav = sidebar.getByRole("navigation")
  const primary = nav.getByRole("button", { name: "新对话", exact: true })
  const research = nav.getByRole("button", { name: "深度研究", exact: true })
  await expect(primary).toHaveCSS("height", "44px")
  await expect(primary).toHaveCSS("font-size", "16px")
  await expect(primary).toHaveCSS("font-weight", "600")
  await expect(primary.locator("svg")).toHaveCSS("width", "22px")
  await expect(research).toHaveCSS("height", "36px")
  const bounds = (await primary.boundingBox())!
  expect((await research.boundingBox())!.y - bounds.y - bounds.height).toBe(12)
  await sidebar.getByRole("button", { name: "隐藏左栏" }).click()
  await expect(primary).toHaveCSS("width", "40px")
  await expect(primary).toHaveCSS("height", "40px")
  await primary.click()
  await expect(page).toHaveURL(/\/new-session\?.*draftId=/)
})

test("sidebar keeps its rounded edge when resized and folded", async ({ page }, info) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.setViewportSize({ width: 1440, height: 900 })
  await setupHomePage(page)
  await page.goto("/expert")
  const sidebar = page.getByRole("complementary", { name: "CMCC conversations" })
  const close = sidebar.getByRole("button", { name: "隐藏左栏" })
  await expect(sidebar).toHaveCSS("border-top-right-radius", "20px")
  const main = (await sidebar.locator("..").boundingBox())!
  const before = (await sidebar.boundingBox())!
  expect(before.y - main.y).toBe(6)
  expect(main.height - before.height).toBe(12)
  await close.hover()
  await expect(close).toHaveCSS("background-color", "rgb(233, 238, 252)")
  const handle = (await sidebar.locator('+ [role="separator"]').boundingBox())!
  const delta = before.width > 350 ? -24 : 24
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2 + delta, handle.y + handle.height / 2)
  await page.mouse.up()
  await expect(sidebar).toHaveCSS("width", `${before.width + delta}px`)
  await page.screenshot({ path: info.outputPath("sidebar-expanded.png") })
  await close.click()
  await expect(sidebar).toHaveCSS("width", "64px")
  await expect(sidebar).toHaveCSS("border-bottom-right-radius", "14px")
  await page.screenshot({ path: info.outputPath("sidebar-rail.png") })
  await sidebar.getByRole("button", { name: "展开左栏" }).click()
  await expect(sidebar).toHaveCSS("width", `${before.width + delta}px`)
})

for (const width of [1440, 390, 320]) {
  test(`expert cards and details retain their layout and actions at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await setupHomePage(page, { models: true })
    await page.goto("/expert")
    await expect(page.getByRole("heading", { name: "产业洞察专家团", exact: true })).toBeVisible()
    if (width < 760) {
      await page.getByRole("button", { name: "隐藏左栏", exact: true }).click()
      await expect
        .poll(() =>
          page
            .locator('aside[aria-label="CMCC conversations"]')
            .evaluate((sidebar) => sidebar.getBoundingClientRect().width),
        )
        .toBeLessThanOrEqual(1)
    }
    const cards = page.locator("button:has(h3)")
    await expect(cards).toHaveCount(6)
    await expect(page.locator(".cmcc-expert-banner")).toHaveCSS("border-radius", "20px")
    await expect(cards.first()).toHaveCSS("border-radius", "16px")
    for (const card of await cards.all()) {
      await card.scrollIntoViewIfNeeded()
      const bounds = await card.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      await expect
        .poll(() => card.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
        .toBe(true)
    }
    await page.getByRole("heading", { name: "产业洞察专家团", exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath("experts.png") })

    await cards.filter({ hasText: "AI + 财经" }).click()
    const dialog = page.locator('section:has(> header [aria-label="关闭专家详情"])')
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveCSS("transform", "none")
    await expect(dialog.locator("..")).toHaveCSS("opacity", "1")
    await expect(dialog.getByRole("button", { name: "多股对比", exact: true })).toBeVisible()
    await expect(dialog.getByRole("button", { name: "召唤产业专家团", exact: true })).toBeVisible()
    const footer = await dialog.locator("footer").boundingBox()
    expect(footer!.y + footer!.height).toBeLessThanOrEqual(900)
    const bounds = await dialog.boundingBox()
    expect(bounds!.x).toBeGreaterThanOrEqual(0)
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
    const buttons = await dialog.locator("footer button").evaluateAll((elements) =>
      elements.map((element) => {
        const bounds = element.getBoundingClientRect()
        return { left: bounds.left, right: bounds.right }
      }),
    )
    expect(buttons.every((button) => button.left >= bounds!.x && button.right <= bounds!.x + bounds!.width)).toBe(true)
    expect(buttons.every((button, index) => index === 0 || button.left >= buttons[index - 1].right)).toBe(true)
    await page.screenshot({ path: info.outputPath("expert-details.png") })
    await dialog.getByRole("button", { name: "取消", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  })
}
