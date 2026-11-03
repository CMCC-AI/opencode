import { expect, test, type Locator } from "@playwright/test"
import { setupHomePage } from "./home-fixture"

test.use({ locale: "zh-CN", reducedMotion: "reduce" })
const baseline = process.env.MARKDOWN_PHASE?.startsWith("logo-before")

async function ready(image: Locator, source: string) {
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
      const horizontal = sidebar.locator('img[alt="深度洞察"]')
      await ready(horizontal, "/brand/mobileai-horizontal.svg")
      await horizontal.screenshot({ path: info.outputPath("sidebar-logo.png") })
      if (width < 760) {
        await page.getByRole("button", { name: "隐藏左栏", exact: true }).click()
        await expect.poll(() => sidebar.evaluate((node) => node.getBoundingClientRect().width)).toBeLessThanOrEqual(1)
      }
      const logo = page.locator(".cmcc-home-brand img")
      await ready(logo, "/brand/logo.svg")
      await expect(page.locator(".cmcc-home-brand h1")).toHaveText("DeepInsight深度洞察")
      await expect(page.locator('[data-component="session-new-composer"]')).toBeVisible()
      if (!baseline) await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/brand/logo.svg")
      const geometry = await page.locator(".cmcc-home-brand").evaluate((node) => {
        const image = node.querySelector("img")!.getBoundingClientRect()
        const title = node.querySelector("h1")!.getBoundingClientRect()
        return {
          image: { x: image.x, y: image.y, width: image.width, height: image.height },
          title: { x: title.x, y: title.y, width: title.width, height: title.height },
        }
      })
      expect(
        geometry.image.x + geometry.image.width <= geometry.title.x ||
          geometry.image.y + geometry.image.height <= geometry.title.y,
      ).toBe(true)
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
