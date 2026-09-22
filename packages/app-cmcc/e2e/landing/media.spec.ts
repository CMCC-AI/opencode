import { expect, test } from "@playwright/test"

test.beforeEach(async ({ page }) => {
  await page.route("**/landing/index.html", async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, headers: {
      ...response.headers(),
      "content-security-policy": "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; media-src 'self' data:; connect-src * data:",
    } })
  })
  await page.route("**/app", (route) => route.fulfill({ contentType: "text/html", body: "<!doctype html><title>App</title>" }))
})

for (const width of [1440, 390]) {
  test(`first screen prioritizes one video and defers offscreen media (${width})`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    const requests: string[] = []
    const errors: string[] = []
    page.on("request", (request) => requests.push(request.url()))
    page.on("pageerror", (error) => errors.push(error.message))
    await page.goto("/landing/index.html")
    await expect(page.locator(".hero-media video")).toBeVisible()
    await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0)
    expect(requests.filter((url) => url.endsWith(".mp4"))).toHaveLength(1)
    expect(requests.filter((url) => /\.(gif|png)$/.test(url) && !url.includes("jiutian-logo"))).toHaveLength(0)
    expect(requests.some((url) => url.endsWith("/app"))).toBe(false)
    await expect(page.locator('link[rel="prerender"]')).toHaveCount(0)
    const metrics = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => {
      const resource = entry as PerformanceResourceTiming
      return { name: resource.name.split("/").pop(), bytes: resource.encodedBodySize, start: resource.startTime }
    }))
    await info.attach("initial-requests.json", { body: JSON.stringify(metrics, null, 2), contentType: "application/json" })
    await page.screenshot({ path: info.outputPath(`hero-${width}.png`), animations: "disabled" })
    await expect(page.locator('link[rel="prefetch"][href="/app"]')).toHaveCount(1)
    expect(errors).toEqual([])
  })
}

test("video and poster start before the application bundle, without a duplicate media request", async ({ page }) => {
  let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  await page.route("**/landing/assets/index-*.js", async (route) => { await gate; await route.continue() })
  const media: string[] = []
  page.on("request", (request) => { if (request.url().endsWith(".mp4")) media.push(request.url()) })
  try {
    await page.goto("/landing/index.html", { waitUntil: "commit" })
    await expect.poll(() => media.length).toBe(1)
    await expect(page.locator("#app")).toBeEmpty()
    await expect(page.locator("video")).toHaveAttribute("hidden", "")
    await expect(page.locator('link[rel="preload"][as="image"]')).toHaveCount(1)
  } finally {
    release()
  }
  await expect(page.locator(".hero-media video")).toBeVisible()
  await expect.poll(() => page.locator("video").evaluate((video: HTMLVideoElement) => video.currentTime)).toBeGreaterThan(0)
  expect(media).toHaveLength(1)
})

test("video failure retains its poster and does not block deferred images or step switching", async ({ page }, info) => {
  await page.route("**/*.mp4", (route) => route.abort())
  await page.goto("/landing/index.html")
  const video = page.locator(".hero-media video")
  await expect(video).toBeVisible()
  expect(await video.evaluate(async (element: HTMLVideoElement) => {
    const poster = new Image()
    poster.src = element.poster
    await poster.decode()
    return poster.naturalWidth > 0 && getComputedStyle(element).opacity === "1"
  })).toBe(true)
  await page.screenshot({ path: info.outputPath("hero-fallback.png"), animations: "disabled" })
  await expect(page.locator('link[rel="prefetch"]')).toHaveCount(0)
  const preview = page.locator(".research-stage-wrapper img")
  await page.locator("#research").scrollIntoViewIfNeeded()
  await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBe(960)
  for (const step of ["understand", "plan", "gather", "verify", "deliver"]) {
    const index = ["understand", "plan", "gather", "verify", "deliver"].indexOf(step)
    await page.locator(".timeline-step-btn").nth(index).click()
    await expect(preview).toHaveAttribute("src", new RegExp(`research-${step}-`))
    await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
  }
})

test("scrolling loads media without changing image proportions and footer background", async ({ page }) => {
  await page.goto("/landing/index.html")
  const footer = page.locator("#contact")
  expect(await footer.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe("none")
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  for (let top = 0; top <= height; top += 500) {
    await page.evaluate((top) => window.scrollTo(0, top), top)
    await page.waitForTimeout(60)
  }
  await footer.scrollIntoViewIfNeeded()
  await expect.poll(() => footer.evaluate((element) => getComputedStyle(element).backgroundImage)).toContain("prime-closing-bg-")
  for (const selector of [".arch-diagram-img", ".industry-full-img", ".tool-visual img", ".wiki-hero-img", ".tile-img"]) {
    for (const image of await page.locator(selector).all()) {
      await expect.poll(() => image.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true)
      if (selector === ".tile-img") continue
      expect(await image.evaluate((image: HTMLImageElement) => {
        const rect = image.getBoundingClientRect()
        return Math.abs(rect.width / rect.height - image.naturalWidth / image.naturalHeight) < 0.01
      })).toBe(true)
    }
  }
})
