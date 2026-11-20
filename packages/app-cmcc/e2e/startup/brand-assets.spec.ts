import { expect, test, type Locator } from "@playwright/test"
import { selectHomeTeam, setupHomePage } from "./home-fixture"

test.use({ locale: "zh-CN", reducedMotion: "reduce" })
const baseline = process.env.MARKDOWN_PHASE?.startsWith("logo-before")

async function ready(image: Locator, source: string | RegExp) {
  await expect(image).toBeVisible()
  if (!baseline) await expect(image).toHaveAttribute("src", source)
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true)
  if (!baseline) {
    await expect(image).toHaveCSS("object-fit", "contain")
    const painted = await image.evaluate((node: HTMLImageElement) => {
      const canvas = document.createElement("canvas")
      canvas.width = 160
      canvas.height = Math.ceil((160 * node.naturalHeight) / node.naturalWidth)
      const context = canvas.getContext("2d")!
      context.drawImage(node, 0, 0, canvas.width, canvas.height)
      return context
        .getImageData(0, 0, canvas.width, canvas.height)
        .data.filter((value, index) => index % 4 === 3 && value > 16).length
    })
    expect(painted).toBeGreaterThan(100)
  }
}

for (const width of [1440, 390]) {
  for (const mode of ["chat", "research"])
    test(`brand in ${mode} homepage and sidebar at ${width}`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 })
      await setupHomePage(page, { models: true })
      const started = Date.now()
      await page.goto("/app")
      if (mode === "research") await page.getByRole("button", { name: "深度研究", exact: true }).click()
      const sidebar = page.locator('aside[aria-label="CMCC conversations"]')
      const brand = sidebar.locator(".cmcc-sidebar-brand")
      const title = brand.getByText("深度洞察", { exact: true })
      await expect(brand.locator("img")).toHaveCount(0)
      await expect(title).toHaveCSS("font-size", "20px")
      await expect(title).toHaveCSS("font-weight", "700")
      await expect(title).toHaveCSS("color", "rgb(23, 28, 38)")
      await brand.screenshot({ path: info.outputPath("sidebar-title.png") })
      await sidebar.getByRole("button", { name: "隐藏左栏", exact: true }).click()
      const opener = page.getByRole("button", { name: "展开左栏", exact: true })
      await expect(opener.locator("svg")).toBeVisible()
      await expect(opener.locator("img")).toHaveCount(0)
      if (width < 760) {
        await expect.poll(() => sidebar.evaluate((node) => node.getBoundingClientRect().width)).toBeLessThanOrEqual(1)
      } else {
        await expect(sidebar).toHaveCSS("width", "64px")
        await expect(title).toHaveCount(0)
        await opener.click()
        await expect(title).toBeVisible()
      }
      await ready(page.locator(".cmcc-page-brandbar img"), "/brand/mobileai-horizontal.svg")
      if (mode === "chat" && !baseline) await selectHomeTeam(page, "灵犀")
      const greeting = page.locator(".cmcc-home-greeting")
      const avatar = greeting.locator("img")
      await ready(avatar, mode === "research" ? /\/deepinsight[-.]/ : /draft-lingxi/)
      await expect(greeting).toHaveText(mode === "research" ? "您好，我是您的 深度研究专家团" : "您好，我是 灵犀")
      await expect(page.locator(".cmcc-home-brand img")).toHaveCount(0)
      await expect(page.locator(".cmcc-home-brand h1")).toHaveText("DeepInsight深度洞察")
      await expect(page.locator('[data-component="session-new-composer"]')).toBeVisible()
      if (!baseline) await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/brand/logo.svg")
      const geometry = await page.locator(".cmcc-home").evaluate((node) => {
        const image = node.querySelector(".cmcc-home-greeting img")!.getBoundingClientRect()
        const title = node.querySelector(".cmcc-home-brand h1")!.getBoundingClientRect()
        const composer = node.querySelector('[data-component="session-new-composer"]')!.getBoundingClientRect()
        return {
          image: { x: image.x, y: image.y, width: image.width, height: image.height },
          title: { x: title.x, y: title.y, width: title.width, height: title.height },
          composer: { x: composer.x, y: composer.y, width: composer.width, height: composer.height },
        }
      })
      expect(geometry.image.x).toBeCloseTo(geometry.title.x, 1)
      expect(geometry.title.x).toBeCloseTo(geometry.composer.x, 1)
      expect(geometry.image.y + geometry.image.height).toBeLessThanOrEqual(geometry.title.y)
      expect(geometry.image.width).toBeCloseTo(width >= 1440 ? 57.024 : 36, 1)
      console.log(JSON.stringify({ benchmark: "brand-home-ready", mode, width, ms: Date.now() - started, geometry }))
      await page.screenshot({ path: info.outputPath("homepage.png") })
    })

  test(`DeepLens uses the standalone brand mark at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await setupHomePage(page)
    await page.goto("/deeplens")
    if (width < 760) await page.getByRole("button", { name: "隐藏左栏", exact: true }).click()
    await ready(page.locator('[data-testid="cmcc-deeplens-showcase"] .brand-symbol'), "/brand/logo.svg")
    await expect(page.locator(".product-name")).toHaveText("DeepLens拍照即懂")
    await page.screenshot({ path: info.outputPath("deeplens.png") })
  })

  test(`landing header, footer and favicon use the standalone brand mark at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.route("**/*.mp4", (route) => route.abort())
    await page.goto("/landing/index.html")
    const header = page.locator(".topbar .brand img")
    await ready(header, "/brand/logo.svg")
    await expect(page.locator(".topbar .brand")).toContainText("DeepInsight")
    if (!baseline) await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/brand/logo.svg")
    await page.screenshot({ path: info.outputPath("landing-header.png") })
    const footer = page.locator(".prime-brand img")
    await footer.scrollIntoViewIfNeeded()
    await ready(footer, "/brand/logo.svg")
    await page.screenshot({ path: info.outputPath("landing-footer.png") })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
  })

  test(`product introduction uses the standalone mark without clipping at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/product-intro/index.html")
    await ready(page.locator(".brand-mark"), "/brand/logo.svg")
    if (!baseline) await expect(page.locator(".brand-mark")).toHaveCSS("border-radius", "0px")
    await page.screenshot({ path: info.outputPath("product-intro.png") })
  })
}

test("public SVG responses retain the supplied artwork and proper MIME", async ({ request }) => {
  test.skip(!!baseline)
  for (const [file, bytes] of [
    ["logo.svg", 2583],
    ["mobileai-horizontal.svg", 10868],
  ] as const) {
    const response = await request.get(`/brand/${file}`)
    expect(response.status()).toBe(200)
    expect(response.headers()["content-type"]).toContain("image/svg+xml")
    expect((await response.body()).length).toBe(bytes)
  }
})
