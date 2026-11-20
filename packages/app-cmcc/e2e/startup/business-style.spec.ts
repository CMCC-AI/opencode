import { expect, test } from "@playwright/test"
import { expectPageBrandBar } from "../utils/expect-page-brand-bar"
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

for (const [width, height] of [[1440, 900], [1440, 768], [1024, 768], [390, 844]]) {
  test(`Wiki and industry overview headings align at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.emulateMedia({ reducedMotion: "reduce" })
    await setupHomePage(page)

    await page.goto("/expert")
    const industry = page.getByRole("heading", { name: "产业洞察专家团", exact: true })
    await expectPageBrandBar(page, industry)
    const industryTop = (await industry.boundingBox())!.y

    await page.goto("/knowledge")
    const wiki = page.getByRole("heading", { name: "DeepInsight Wiki", exact: true })
    await expectPageBrandBar(page, wiki)
    expect((await wiki.boundingBox())!.y).toBeCloseTo(industryTop, 1)
  })
}

for (const width of [1680, 1440, 1280, 390, 320]) {
  test(`expert cards and details retain their layout and actions at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await setupHomePage(page, { models: true })
    await page.goto("/expert")
    const heading = page.getByRole("heading", { name: "产业洞察专家团", exact: true })
    await expect(heading).toBeVisible()
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
    await expectPageBrandBar(page, heading)
    const cards = page.locator(".cmcc-expert-card")
    const banner = page.locator(".cmcc-expert-banner")
    await expect(cards).toHaveCount(6)
    await expect(cards.getByRole("heading", { level: 3 })).toHaveText([
      "AI + 财经",
      "AI + 政企",
      "AI + 科研",
      "AI + 位置",
      "AI + 推荐",
      "AI + 巡察",
    ])
    await expect(banner).toHaveCSS("border-radius", "16px")
    await expect(cards.first()).toHaveCSS("border-radius", "16px")
    const wide = width >= 1280
    const badges = banner.locator("img.cmcc-expert-banner-badges")
    await expect(cards.first().locator("img")).toHaveCSS("width", wide ? "72px" : "60px")
    await expect(heading).toHaveCSS("font-size", wide ? "28.8px" : "24px")
    await expect(banner).toHaveCSS("min-height", wide ? "192px" : "160px")
    if (wide) {
      await expect(badges).toBeVisible()
      await expect(badges).toHaveAttribute("src", /overview-banner-badges.*\.svg/)
      await expect.poll(() => badges.evaluate((img: HTMLImageElement) => img.complete && img.naturalHeight)).toBe(60)
      const badgeBounds = (await badges.boundingBox())!
      const descriptionBounds = (await banner.locator(".cmcc-expert-banner-copy p").boundingBox())!
      expect(badgeBounds.width / badgeBounds.height).toBeCloseTo(379.014 / 60, 2)
      expect(badgeBounds.y + badgeBounds.height).toBeLessThanOrEqual(descriptionBounds.y)
      const center = page.locator(".cmcc-expert-center")
      const available = await center.evaluate((el) => el.clientWidth)
      expect((await banner.boundingBox())!.width).toBeCloseTo(Math.min(1094.4, available - 32), 0)
      const firstRow = await cards.nth(0).boundingBox()
      const third = await cards.nth(2).boundingBox()
      const secondRow = await cards.nth(3).boundingBox()
      const viewport = await center.boundingBox()
      expect(third!.y).toBe(firstRow!.y)
      expect(secondRow!.x).toBe(firstRow!.x)
      expect(secondRow!.y).toBeGreaterThan(firstRow!.y + firstRow!.height)
      expect(secondRow!.y + secondRow!.height).toBeLessThanOrEqual(viewport!.y + viewport!.height)
    } else {
      await expect(badges).toBeHidden()
    }
    for (const card of await cards.all()) {
      await card.scrollIntoViewIfNeeded()
      const bounds = await card.boundingBox()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      await expect
        .poll(() => card.locator("img").evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0))
        .toBe(true)
    }
    await heading.scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath("experts.png") })

    const dialog = page.locator('section:has(> header [aria-label="关闭专家详情"])')
    if (width === 1440) {
      for (const [team, category, copy] of [
        ["DeepTrading 财经分析专家团", "AI + 财经", "多智能体财经分析团队：标的识别、多维并行分析，一站式投研交付。"],
        [
          "DeepGeo 位置决策专家团",
          "AI + 位置",
          "把位置、客流、客群、商业和经营数据转化为可复算、可审查的位置决策报告。",
        ],
        ["AI for Science 科研专家团", "AI + 科研", "覆盖文献综述、论文复现、实验设计与科研写作的中文科研专家团。"],
      ]) {
        const slide = banner.getByRole("button", { name: `查看${team}`, exact: true })
        await slide.click()
        await expect(slide).toHaveAttribute("aria-pressed", "true")
        await expect(banner.locator(".cmcc-expert-banner-copy p")).toHaveText(copy)
        await banner.getByRole("button", { name: "创建任务", exact: true }).click()
        await expect(dialog).toHaveAccessibleName(category)
        await expect(dialog.locator(".cmcc-expert-summary p")).toHaveText(copy)
        await dialog.getByRole("button", { name: "取消", exact: true }).click()
        await expect(dialog).toHaveCount(0)
      }
    }
    await cards.filter({ hasText: "AI + 财经" }).click()
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveCSS("transform", "none")
    await expect(dialog.locator("..")).toHaveCSS("opacity", "1")
    await expect(dialog).toHaveCSS("border-radius", "16px")
    await expect(dialog.locator(".cmcc-expert-summary-brand")).toHaveText("DeepTrading")
    await expect(dialog.locator(".cmcc-expert-skill")).toHaveCount(3)
    await expect(dialog.locator(".cmcc-expert-skill").first()).not.toHaveCSS("background-image", "none")
    if (wide) {
      await expect(dialog).toHaveCSS("width", "800px")
      await expect(dialog).toHaveCSS("height", "600px")
      await expect(dialog.locator(".cmcc-expert-summary")).toHaveCSS("width", "602px")
    }
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
    const scroll = dialog.locator(".cmcc-expert-dialog-scroll")
    await scroll.evaluate((el) => { el.scrollTop = el.scrollHeight })
    expect(await scroll.evaluate((el) => el.scrollTop)).toBeGreaterThan(0)
    expect(await dialog.locator("footer").boundingBox()).toEqual(footer)
    await dialog.getByRole("button", { name: "取消", exact: true }).click()
    await expect(dialog).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width)
  })
}

test("industry teams share the task dialog while retaining their own branding and demo", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await setupHomePage(page, { models: true, teams: true })
  await page.goto("/expert")
  await page.getByRole("button", { name: "隐藏左栏", exact: true }).click()
  for (const [name, brand] of [
    ["AI + 政企", "DeepEngage"],
    ["AI + 科研", "AI for Science"],
    ["AI + 位置", "DeepGeo"],
    ["AI + 推荐", "Shoppers Pro"],
    ["AI + 巡察", "DeepInspect"],
  ]) {
    await page.locator(".cmcc-expert-card").filter({ has: page.getByRole("heading", { name, exact: true }) }).click()
    const dialog = page.getByRole("dialog", { name, exact: true })
    await expect(dialog).toHaveCSS("border-radius", "16px")
    await expect(dialog.locator(".cmcc-expert-summary-brand")).toHaveText(brand)
    await expect(dialog.locator(".cmcc-expert-skill")).toHaveCount(3)
    await expect(dialog.locator(".cmcc-expert-dialog-member").first()).toBeAttached()
    await expect(dialog.getByRole("button", { name: "多股对比", exact: true })).toHaveCount(0)
    const demo = dialog.getByRole("button", { name: "手机演示", exact: true })
    if (brand === "Shoppers Pro") {
      await demo.click()
      const preview = page.getByRole("dialog", { name: "手机演示", exact: true })
      await expect(preview.getByRole("img")).toBeVisible()
      await preview.getByRole("button", { name: "关闭演示" }).click()
      await expect(preview).toHaveCount(0)
    } else {
      await expect(demo).toHaveCount(0)
    }
    await dialog.getByRole("button", { name: "取消", exact: true }).click()
    await expect(dialog).toHaveCount(0)
  }
})

test("finance task dialog still launches skill drafts and stock comparison", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await setupHomePage(page, { models: true, teams: true })
  await page.goto("/expert")
  const finance = page.locator(".cmcc-expert-card").filter({ has: page.getByRole("heading", { name: "AI + 财经", exact: true }) })
  const dialog = page.getByRole("dialog", { name: "AI + 财经", exact: true })
  await finance.click()
  const skill = dialog.locator(".cmcc-expert-skill").first()
  const example = await skill.getAttribute("title")
  expect(example).toBeTruthy()
  await skill.click()
  await expect(page).toHaveURL(/\/new-session\?.*draftId=/)
  await expect(page.locator('[data-component="prompt-input"]')).toHaveText(example!)

  await page.getByRole("button", { name: "产业洞察", exact: true }).click()
  await finance.click()
  await dialog.getByRole("button", { name: "多股对比", exact: true }).click()
  await expect(page).toHaveURL(/\/mstock$/)
})

test("industry summon reuses the prewarmed agent list", async ({ page }) => {
  await setupHomePage(page, { models: true, teams: true })
  let requests = 0
  await page.route("**/agent?*", (route) => {
    if (new URL(page.url()).pathname === "/expert") requests++
    return route.fallback()
  })
  await page.goto("/expert")
  await expect.poll(() => requests).toBe(1)
  await page.getByRole("button", { name: /^AI \+ 财经/ }).click()
  await page.getByRole("button", { name: "召唤产业专家团", exact: true }).click()

  await expect(page).toHaveURL(/\/new-session\?.*draftId=/)
  await expect(page.getByRole("button", { name: "切换专家团，当前：DeepTrading 财经分析专家团" })).toBeVisible()
  expect(requests).toBe(1)
})

test("industry summon joins an in-flight check, shows progress and can retry", async ({ page }) => {
  await setupHomePage(page, { models: true, teams: true })
  const gate = Promise.withResolvers<void>()
  let requests = 0
  await page.route("**/agent?*", async (route) => {
    if (++requests !== 1) return route.fallback()
    await gate.promise
    return route.fulfill({ json: [{ name: "build", mode: "primary" }] })
  })
  await page.goto("/expert")
  await expect.poll(() => requests).toBe(1)
  await page.getByRole("button", { name: /^AI \+ 财经/ }).click()
  const dialog = page.getByRole("dialog", { name: "AI + 财经", exact: true })
  const summon = dialog.getByRole("button", { name: "召唤产业专家团", exact: true })
  await summon.click()
  const preparing = dialog.getByRole("button", { name: "正在准备…", exact: true })
  await expect(preparing).toBeDisabled()
  await expect(preparing).toHaveAttribute("aria-busy", "true")
  await expect(dialog.locator(".cmcc-expert-skill").first()).toBeDisabled()
  await expect(page).toHaveURL(/\/expert$/)
  expect(requests).toBe(1)

  gate.resolve()
  await expect(page.getByText("专家团配置未加载", { exact: true })).toBeVisible()
  await expect(summon).toBeEnabled()
  await summon.click()
  await expect(page).toHaveURL(/\/new-session\?.*draftId=/)
  expect(requests).toBe(2)
})

test("closing the expert dialog cancels navigation while validation is pending", async ({ page }) => {
  await setupHomePage(page, { models: true, teams: true })
  const gate = Promise.withResolvers<void>()
  await page.route("**/agent?*", async (route) => {
    await gate.promise
    return route.fallback()
  })
  await page.goto("/expert")
  const finance = page.getByRole("button", { name: /^AI \+ 财经/ })
  await finance.click()
  const dialog = page.getByRole("dialog", { name: "AI + 财经", exact: true })
  await dialog.getByRole("button", { name: "召唤产业专家团", exact: true }).click()
  await expect(dialog.getByRole("button", { name: "正在准备…" })).toBeDisabled()
  const response = page.waitForResponse((item) => new URL(item.url()).pathname === "/agent")
  await dialog.getByRole("button", { name: "取消", exact: true }).click()
  await expect(dialog).toHaveCount(0)
  gate.resolve()
  await response

  await finance.click()
  await expect(dialog.getByRole("button", { name: "召唤产业专家团", exact: true })).toBeEnabled()
  await expect(page).toHaveURL(/\/expert$/)
})
