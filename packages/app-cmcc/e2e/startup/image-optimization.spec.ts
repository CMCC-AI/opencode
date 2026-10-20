import { expect, test, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"
import manifest from "../../scripts/image-optimization.json" with { type: "json" }
import { setupHomePage } from "./home-fixture"

test.use({ locale: "zh-CN" })

async function ready(image: ReturnType<Page["locator"]>) {
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true)
}

for (const width of [1440, 390]) {
  test(`optimized login background renders at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/app")
    await expect(page.getByRole("heading", { name: "欢迎登录", exact: true })).toBeVisible()
    const image = page.locator('img[src*="login-bg"]')
    await expect(image).toHaveAttribute("src", /login-bg\.optimized-.*\.webp$/)
    await ready(image)
    expect(await image.evaluate((node: HTMLImageElement) => [node.naturalWidth, node.naturalHeight])).toEqual([
      2880, 1800,
    ])
    await page.screenshot({ path: info.outputPath("login.png") })
  })

  test(`optimized expert artwork renders at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await setupHomePage(page)
    await page.goto("/expert")
    const images = page.locator('img[src*="scene-"]')
    await expect(images.first()).toBeVisible()
    if (width < 760) await page.getByRole("button", { name: "隐藏左栏" }).click()
    expect(await images.count()).toBeGreaterThanOrEqual(6)
    for (const image of await images.all()) {
      await expect(image).toHaveAttribute("src", /\.optimized-.*\.webp$/)
      await image.scrollIntoViewIfNeeded()
      await ready(image)
    }
    await images.first().scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath("experts.png"), fullPage: true })
  })

  test(`optimized public landing artwork renders at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.route("**/*.mp4", (route) => route.abort())
    await page.goto("/landing/index.html")
    await expect(page.locator("h1").first()).toBeVisible()
    for (const image of await page.locator("img:not(.tile-img)").all()) {
      if (!(await image.isVisible())) continue
      await image.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" }))
      await ready(image)
    }
    await expect(page.getByAltText("DeepInsight 四层 Agentic 架构图")).toHaveAttribute("src", /\.optimized\.webp$/)
    await page.evaluate(() => scrollTo(0, 0))
    await page.screenshot({ path: info.outputPath("landing.png"), fullPage: true })
  })

  test(`optimized product introduction background renders at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto("/product-intro/index.html")
    await expect
      .poll(() => page.locator(".hero").evaluate((node) => getComputedStyle(node, "::before").backgroundImage))
      .toContain("llm-wiki-hero.optimized.webp")
    await page.screenshot({ path: info.outputPath("product-intro.png") })
  })
}

test("public WebP derivatives have the correct MIME, bytes and browser dimensions", async ({ page, request }) => {
  await page.goto("/product-intro/index.html")
  for (const image of manifest.images.filter((item) => item.output.startsWith("public/"))) {
    const url = image.output.slice(6)
    const response = await request.get(url)
    expect(response.status()).toBe(200)
    expect(response.headers()["content-type"]).toContain("image/webp")
    expect((await response.body()).length).toBe(image.optimizedBytes)
    expect(
      await page.evaluate(async (url) => {
        const bitmap = await createImageBitmap(await (await fetch(url)).blob())
        const dimensions = [bitmap.width, bitmap.height]
        bitmap.close()
        return dimensions
      }, url),
    ).toEqual([image.width, image.height])
  }
})

test("Wiki WebP compositions preserve the original SVG artwork", async ({ page }, info) => {
  await page.goto("/product-intro/index.html")
  for (const image of manifest.images.filter((item) => item.source.endsWith(".svg"))) {
    const source = await readFile(new URL(`../../${image.source}`, import.meta.url))
    const output = await readFile(new URL(`../../${image.output}`, import.meta.url))
    const difference = await page.evaluate(
      async ({ source, output, width, height }) => {
        async function pixels(uri: string) {
          const image = new Image()
          image.src = uri
          await image.decode()
          const canvas = document.createElement("canvas")
          canvas.width = width
          canvas.height = height
          const context = canvas.getContext("2d")!
          context.fillStyle = "white"
          context.fillRect(0, 0, width, height)
          context.drawImage(image, 0, 0, width, height)
          return context.getImageData(0, 0, width, height).data
        }
        const before = await pixels(source)
        const after = await pixels(output)
        const columns = Math.ceil(width / 64)
        const cells = new Float64Array(columns * Math.ceil(height / 64))
        const counts = new Uint32Array(cells.length)
        let total = 0
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const cell = Math.floor(y / 64) * columns + Math.floor(x / 64)
            const offset = (y * width + x) * 4
            for (let channel = 0; channel < 3; channel++) {
              const squared = (before[offset + channel] - after[offset + channel]) ** 2
              cells[cell] += squared
              counts[cell]++
              total += squared
            }
          }
        }
        return {
          rmse: Math.sqrt(total / (width * height * 3)),
          worstBlock: Math.max(...cells.map((value, index) => Math.sqrt(value / counts[index]))),
        }
      },
      {
        source: `data:image/svg+xml;base64,${source.toString("base64")}`,
        output: `data:image/webp;base64,${output.toString("base64")}`,
        width: image.width,
        height: image.height,
      },
    )
    await info.attach(image.source.split("/").at(-1)!, {
      body: JSON.stringify(difference),
      contentType: "application/json",
    })
    console.log(JSON.stringify({ source: image.source, ...difference }))
    expect(difference.rmse).toBeLessThan(8)
    expect(difference.worstBlock).toBeLessThan(18)
  }
})
