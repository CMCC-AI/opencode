import { expect, test, type Page } from "@playwright/test"
import manifest from "../../scripts/image-optimization.json" with { type: "json" }

const baseline = process.env.CMCC_LANDING_BASELINE === "1"
const animated = manifest.images.filter((item) => item.source.startsWith("public/landing/") && item.frames > 1)
const isAnimation = (url: string) =>
  /\.gif(?:\?|$)/.test(url) || animated.some((item) => url.includes(item.output.slice(6)))

async function staticImagesReady(page: Page) {
  await expect
    .poll(() =>
      page
        .locator('[data-media-kind="static"]')
        .evaluateAll(
          (nodes) =>
            nodes.length > 0 &&
            nodes.every((node) =>
              node instanceof HTMLImageElement
                ? node.complete && node.naturalWidth > 0
                : getComputedStyle(node).backgroundImage !== "none",
            ),
        ),
    )
    .toBe(true)
}

for (const width of [1440, 390]) {
  test(`landing prepares static artwork without scrolling at ${width}`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    const animations: string[] = []
    page.on("request", (request) => {
      if (isAnimation(request.url())) animations.push(request.url())
    })
    await page.route("**/*.mp4", (route) => route.abort())
    await page.goto("/landing/index.html", { waitUntil: "domcontentloaded" })
    await expect(page.getByRole("heading", { name: "DeepInsight", exact: true })).toBeVisible()
    if (!baseline) await staticImagesReady(page)
    const state = await page.evaluate(() => ({
      scrollY,
      images: Array.from(document.images).map((node) => ({
        alt: node.alt,
        src: node.getAttribute("src"),
        ready: node.complete && node.naturalWidth > 0,
      })),
      sections: Array.from(document.querySelectorAll(".reveal-item")).map((node) => ({
        id: node.id,
        opacity: getComputedStyle(node).opacity,
        transform: getComputedStyle(node).transform,
      })),
      requests: performance
        .getEntriesByType("resource")
        .filter((entry) => /\.(png|webp|gif)$/.test(entry.name))
        .map((entry) => ({ name: entry.name, start: entry.startTime, duration: entry.duration })),
    }))
    await info.attach("initial-loading", { body: JSON.stringify(state, null, 2), contentType: "application/json" })
    await page.screenshot({ path: info.outputPath("first-screen.png") })
    if (baseline) return
    expect(state.scrollY).toBe(0)
    expect(state.sections.every((node) => node.opacity === "1" && node.transform === "none")).toBe(true)
    expect(animations).toEqual([])
    await expect(page.getByAltText("DeepInsight 四层 Agentic 架构图")).toHaveAttribute("src", /\.optimized\.webp$/)
    for (const image of await page.locator(".tile-img").all())
      await expect(image).toHaveAttribute("src", /\.optimized\.webp$/)
    await page.evaluate(() =>
      scrollTo({ top: document.getElementById("architecture")!.offsetTop, behavior: "instant" }),
    )
    await expect(page.getByAltText("DeepInsight 四层 Agentic 架构图")).toBeVisible()
    await page.screenshot({ path: info.outputPath("fast-scroll.png") })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    const board = page.locator("#proof")
    await board.scrollIntoViewIfNeeded()
    await expect
      .poll(async () => Number((await board.locator(".metric-val").first().innerText()).replace(/\D/g, "")))
      .toBeGreaterThan(0)
  })
}

test("landing limits background image concurrency and continues after a failed image", async ({ page }) => {
  test.skip(baseline)
  const held: Array<() => void> = []
  const started: string[] = []
  let releaseAll = false
  const queued = /\/(?:deepinsight-system-architecture|grid-\d+|industry-|tool-deeptrack|deeplens-web|prime-closing-bg)/
  await page.route("**/*.mp4", (route) => route.abort())
  await page.route("**/*.optimized.webp", async (route) => {
    if (!queued.test(new URL(route.request().url()).pathname)) return route.continue()
    started.push(route.request().url())
    if (!releaseAll) await new Promise<void>((resolve) => held.push(resolve))
    if (started[0] === route.request().url()) return route.fulfill({ status: 404, body: "missing test image" })
    return route.continue()
  })
  try {
    await page.goto("/landing/index.html", { waitUntil: "domcontentloaded" })
    await expect(page.locator("h1")).toBeVisible()
    await expect.poll(() => started.length).toBe(2)
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    expect(started).toHaveLength(2)
    held.shift()!()
    await expect.poll(() => started.length).toBe(3)
    releaseAll = true
    held.splice(0).forEach((release) => release())
    await expect(page.getByAltText("AI + 科研 系统界面")).toHaveAttribute("src", /\.optimized\.webp$/)
    await expect
      .poll(() =>
        page
          .getByAltText("AI + 科研 系统界面")
          .evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0),
      )
      .toBe(true)
  } finally {
    releaseAll = true
    held.splice(0).forEach((release) => release())
  }
})

test("landing preloads static images without requestIdleCallback", async ({ page }) => {
  test.skip(baseline)
  await page.addInitScript(() => {
    Object.defineProperty(window, "requestIdleCallback", { value: undefined, configurable: true })
    Object.defineProperty(window, "cancelIdleCallback", { value: undefined, configurable: true })
  })
  await page.route("**/*.mp4", (route) => route.abort())
  await page.goto("/landing/index.html")
  await staticImagesReady(page)
  expect(await page.evaluate(() => scrollY)).toBe(0)
})

test("visible artwork bypasses an occupied background queue", async ({ page }) => {
  test.skip(baseline)
  const held: Array<() => void> = []
  let intercepted = 0
  let releaseAll = false
  await page.route("**/*.mp4", (route) => route.abort())
  await page.route("**/*.optimized.webp", async (route) => {
    if (
      /\/(?:deepinsight-system-architecture|grid-\d+)/.test(new URL(route.request().url()).pathname) &&
      intercepted++ < 2 &&
      !releaseAll
    )
      await new Promise<void>((resolve) => held.push(resolve))
    return route.continue()
  })
  try {
    await page.goto("/landing/index.html", { waitUntil: "domcontentloaded" })
    await expect.poll(() => held.length).toBe(2)
    await page.evaluate(() => scrollTo({ top: document.getElementById("tools")!.offsetTop, behavior: "instant" }))
    const image = page.getByAltText("DeepTrack 界面", { exact: true })
    await expect(image).toHaveAttribute("fetchpriority", "auto")
    await expect
      .poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0))
      .toBe(true)
  } finally {
    releaseAll = true
    held.splice(0).forEach((release) => release())
  }
})

test("research animation keeps its animated classification after switching to WebP", async ({ page }) => {
  test.skip(baseline)
  await page.route("**/*.mp4", (route) => route.abort())
  await page.goto("/landing/index.html")
  await page.getByRole("button", { name: /04 反思审查/ }).click()
  const image = page.getByAltText("DeepInsight 反思审查 工作台", { exact: true })
  await expect(image).toHaveAttribute("data-media-kind", "animated")
  await expect(image).toHaveAttribute("src", /research-verify-.*\.optimized\.webp$/)
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true)
})

test("a pending hero video does not block static image warmup", async ({ page }) => {
  test.skip(baseline)
  const releases: Array<() => void> = []
  let finished = false
  await page.route("**/*.mp4", async (route) => {
    if (!finished)
      await new Promise<void>((resolve) => {
        releases.push(resolve)
      })
    return route.abort()
  })
  try {
    await page.goto("/landing/index.html", { waitUntil: "domcontentloaded" })
    await expect(page.locator("h1")).toBeVisible()
    await expect.poll(() => releases.length).toBeGreaterThan(0)
    await staticImagesReady(page)
    expect(await page.evaluate(() => scrollY)).toBe(0)
  } finally {
    finished = true
    releases.forEach((release) => release())
  }
})
