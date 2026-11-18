import { expect, test, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { setupGeneralChat } from "./general-chat.fixture"
import { homeDirectory } from "./home-fixture"
import { previewFiles } from "./preview-files.fixture"

test.use({ locale: "zh-CN" })

async function setup(page: Page, agentType?: string, multiPage = false) {
  const data = await setupGeneralChat(page, { turns: 1, agentType })
  const files: Record<string, { mime: string; bytes: Buffer }> = await previewFiles()
  files["report.md"] = { mime: "text/markdown", bytes: Buffer.from("## Markdown preview fixture\n\nReport content.") }
  files["report.html"] = {
    mime: "text/html",
    bytes: Buffer.from("<!doctype html><html><body><h1>HTML preview fixture</h1></body></html>"),
  }
  if (multiPage)
    files["report.pdf"].bytes = await readFile(new URL("./fixtures/preview-chinese-multipage.pdf", import.meta.url))
  const real = process.env.CMCC_PREVIEW_FIXTURE_DIR
  if (real) {
    files["report.pdf"].bytes = await readFile(`${real}/market_report_20260921.pdf`)
    files["report.docx"].bytes = await readFile(`${real}/market_report_20260921.docx`)
    files["data.csv"].bytes = await readFile(`${real}/stock_data_20260921.csv`)
  }
  const root = "runs/preview-check"
  const requests: string[] = []
  const violations: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error" && /framing|frame-src/i.test(message.text())) violations.push(message.text())
  })
  await page.route("**/server/**", async (route) => {
    if (route.request().resourceType() !== "document") return route.fallback()
    const response = await route.fetch()
    await route.fulfill({
      response,
      headers: { ...response.headers(), "content-security-policy": "frame-src 'self'; object-src 'self'" },
    })
  })
  await page.route(`**/session/${data.session.id}/message?*`, (route) =>
    route.fulfill({
      json: data.messages.map((entry) =>
        entry.info.role === "user"
          ? entry
          : {
              ...entry,
              parts: [
                ...entry.parts,
                ...Object.keys(files).map((name, index) => ({
                  id: `write-${index}`,
                  messageID: entry.info.id,
                  sessionID: data.session.id,
                  type: "tool",
                  tool: "write",
                  callID: `write-${index}`,
                  state: {
                    status: "completed",
                    input: { filePath: `${homeDirectory}/${root}/${name}`, content: "" },
                    title: name,
                    output: "ok",
                    metadata: {},
                    time: { start: 2000, end: 2010 + index },
                  },
                })),
              ],
            },
      ),
    }),
  )
  await page.route("**/file?*", (route) =>
    route.fulfill({
      json: Object.entries(files).map(([name, file]) => ({
        name,
        path: `${root}/${name}`,
        absolute: `${homeDirectory}/${root}/${name}`,
        type: "file",
        size: file.bytes.length,
        ignored: false,
      })),
    }),
  )
  await page.route("**/file/content?*", (route) => {
    const name = new URL(route.request().url()).searchParams.get("path")?.split("/").at(-1) ?? ""
    const file = files[name]
    if (!file) return route.fulfill({ status: 404, json: { message: "not found" } })
    return route.fulfill({
      json: { type: "binary", content: file.bytes.toString("base64"), encoding: "base64", mimeType: file.mime },
    })
  })
  await page.route("**/file/preview?*", (route) => {
    requests.push(route.request().url())
    const file = files[new URL(route.request().url()).searchParams.get("path")?.split("/").at(-1) ?? ""]
    return route.fulfill({
      contentType: file.mime,
      body: file.bytes,
      headers: { "Content-Disposition": "inline", "Accept-Ranges": "bytes" },
    })
  })
  await page.route("**/file/download?*", (route) => {
    const file = files[new URL(route.request().url()).searchParams.get("path")?.split("/").at(-1) ?? ""]
    return route.fulfill({ contentType: "application/octet-stream", body: file.bytes })
  })
  return { ...data, files, requests, violations, real }
}

async function openRight(page: Page) {
  await expect(page.getByRole("button", { name: /^(展开|隐藏)右栏$/ })).toBeVisible()
  const open = page.getByRole("button", { name: "展开右栏" })
  if (await open.isVisible()) await open.click()
  await expect(page.getByRole("button", { name: /^产出/ })).toBeVisible()
}

test("general chat side panel keeps its actions and file preview at narrow widths", async ({ page, baseURL }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: "reduce" })
  const data = await setup(page)
  data.files["report.md"].bytes = Buffer.from(
    "## 研究材料整理\n\n### 分析步骤\n\n1. 核对输入材料和引用来源。\n2. 整理关键事实，标记待核对项。\n\n| 项目 | 状态 |\n| --- | --- |\n| 材料完整性 | 已核对 |\n| 引用来源 | 待复核 |",
  )
  await page.goto(data.href(baseURL!))
  await openRight(page)
  const panel = page.locator("#review-panel")
  const artifact = panel.getByRole("button", { name: /^产出/ })
  const toggle = page.getByRole("button", { name: "隐藏右栏" })
  await panel.getByRole("button", { name: /^计划/ }).click()
  await expect(panel.getByText("暂无计划", { exact: true })).toBeVisible()
  await panel.getByRole("button", { name: "浏览器", exact: true }).click()
  await expect(panel.getByRole("textbox", { name: "URL" })).toBeVisible()
  await panel.getByRole("button", { name: /^审查/ }).click()
  await expect(panel.getByRole("button", { name: /^审查/ })).toHaveAttribute("data-selected", "")
  await artifact.click()
  await panel.getByRole("button", { name: /report.md/ }).first().click()
  const report = panel.getByRole("heading", { name: "研究材料整理", exact: true })
  await expect(report).toBeVisible()
  const baseline = process.env.CMCC_SIDE_PANEL_BASELINE === "1"
  if (!baseline) {
    await expect(toggle).toHaveCSS("border-radius", "8px")
    await expect(toggle.locator("use")).toHaveAttribute("href", /#close$/)
    await expect.poll(() => toggle.locator("svg").evaluate((el: SVGSVGElement) => el.getBBox().width)).toBeGreaterThan(0)
    await expect(artifact).toHaveCSS("background-color", "rgb(237, 244, 255)")
    await expect(artifact.locator(".cmcc-side-count")).toHaveCSS("border-radius", "999px")
    await expect(panel.locator("[data-cmcc-artifact-tab][data-selected]")).toHaveCSS("border-radius", "8px")
    await expect(panel.locator(".cmcc-side-preview")).toHaveCSS("background-color", "rgb(255, 255, 255)")
  }
  await panel.screenshot({ path: info.outputPath(baseline ? "right-panel-before.png" : "right-panel.png") })
  const download = page.waitForEvent("download")
  await panel.getByRole("button", { name: "下载", exact: true }).click()
  expect(await readFile((await (await download).path())!)).toEqual(data.files["report.md"].bytes)
  await page.setViewportSize({ width: 1024, height: 900 })
  const divider = page.locator('[data-cmcc-general-chat] [role="separator"][aria-orientation="vertical"]')
  const handle = (await divider.boundingBox())!
  const width = (await panel.boundingBox())!.width
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + handle.width / 2 + width - 300, handle.y + handle.height / 2, { steps: 8 })
  await page.mouse.up()
  await expect.poll(() => panel.evaluate((el) => el.clientWidth)).toBe(320)
  await expect(report).toBeVisible()
  const review = (await panel.getByRole("button", { name: /^审查/ }).boundingBox())!
  expect(review.x + review.width).toBeLessThan((await toggle.boundingBox())!.x)
  if (!baseline) await panel.screenshot({ path: info.outputPath("right-panel-narrow.png") })
  await panel.getByRole("button", { name: "返回", exact: true }).click()
  await expect(report).toHaveCount(0)
  await toggle.click()
  await expect(panel).toHaveAttribute("aria-hidden", "true")
  if (!baseline) await expect(page.getByRole("button", { name: "展开右栏" }).locator("use")).toHaveAttribute("href", /#open$/)
  await openRight(page)
  expect(data.errors).toEqual([])
})

test("PDF renders original files without native reader chrome under strict frame CSP", async ({
  page,
  baseURL,
}, info) => {
  const data = await setup(page)
  await page.goto(data.href(baseURL!))
  await openRight(page)
  await page.getByRole("button", { name: /^产出/ }).click()
  await page
    .getByRole("complementary", { name: "审查和文件" })
    .getByRole("button", { name: /report.pdf/ })
    .first()
    .click()
  const pdf = page.locator("[data-cmcc-pdf-preview]")
  await expect(pdf).toBeVisible()
  await expect(pdf).toHaveAttribute("data-ready", "true")
  await expect(pdf.locator("canvas").first()).toBeVisible()
  await expect(page.locator('iframe[title="report.pdf"]')).toHaveCount(0)
  await expect.poll(() => data.requests.length).toBeGreaterThan(0)
  const url = new URL(data.requests[0])
  expect(url.origin).toBe(baseURL)
  expect(url.pathname).toBe("/file/preview")
  expect(url.searchParams.get("directory")).toBe(homeDirectory)
  expect(url.searchParams.get("path")).toBe("runs/preview-check/report.pdf")
  await expect(pdf.locator(".page")).toHaveCSS("border-top-width", "0px")
  await expect(pdf.locator(".cmcc-pdf-pages")).toHaveCSS("background-color", "rgb(255, 255, 255)")
  expect(
    await pdf
      .locator("canvas")
      .first()
      .evaluate((canvas: HTMLCanvasElement) => {
        const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data
        return pixels.some((value, index) => index % 4 !== 3 && value < 200)
      }),
  ).toBe(true)
  await page.screenshot({ path: info.outputPath("pdf-report.png") })
  await page.getByRole("button", { name: /^产出/ }).click()
  await page
    .getByRole("complementary", { name: "审查和文件" })
    .getByRole("button", { name: /report.pdf/ })
    .first()
    .click()
  await expect(pdf).toHaveAttribute("data-ready", "true")
  expect(data.violations).toEqual([])
  expect(data.errors).toEqual([])
})

test("PDF preserves Chinese text, multi-page scrolling, resizing and original downloads", async ({
  page,
  context,
  baseURL,
}, info) => {
  const assets: string[] = []
  await context.grantPermissions(["clipboard-read", "clipboard-write"])
  page.on("request", (request) => {
    if (/\/pdfjs\/|\/assets\/pdf(?!-preview-lazy-)[^/]*\.(?:m?js)(?:\?|$)/i.test(request.url()))
      assets.push(request.url())
  })
  const data = await setup(page, "deepcampaign", true)
  await page.goto(data.href(baseURL!))
  await openRight(page)
  expect(assets).toEqual([])
  await page.getByRole("button", { name: /^可视化报告/ }).click()
  await page.getByRole("button", { name: "report.pdf", exact: true }).click()
  const pdf = page.locator("[data-cmcc-pdf-preview]")
  await expect(pdf).toHaveAttribute("data-ready", "true")
  await expect(pdf.locator(".page")).toHaveCount(2)
  await expect(pdf.locator(".textLayer").first()).toContainText("中文预览测试")
  await pdf.locator(".cmcc-pdf-pages").focus()
  const selected = await pdf
    .locator(".textLayer span")
    .filter({ hasText: "中文预览测试" })
    .first()
    .evaluate((node) => {
      const range = document.createRange()
      range.selectNodeContents(node)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      return selection.toString()
    })
  expect(selected).toContain("中文预览测试")
  await page.keyboard.press("Control+C")
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("中文预览测试")
  expect(assets.every((url) => new URL(url).origin === baseURL)).toBe(true)
  expect(assets.some((url) => url.includes("/cmaps/"))).toBe(true)
  const shellScroll = await page.evaluate(() => window.scrollY)
  await pdf.locator('.page[data-page-number="2"]').evaluate((node) => {
    const container = node.closest(".cmcc-pdf-pages")!
    container.scrollTop += node.getBoundingClientRect().top - container.getBoundingClientRect().top
  })
  await expect(pdf.locator('.page[data-page-number="2"] canvas')).toBeVisible()
  await expect(pdf.locator('.page[data-page-number="2"] .textLayer')).toContainText("第二页")
  await expect(pdf.locator('.page[data-page-number="2"] .textLayer span').first()).toBeInViewport()
  await page.screenshot({ path: info.outputPath("pdf-second-page.png") })
  const container = pdf.locator(".cmcc-pdf-pages")
  await container.evaluate((node) => {
    node.scrollTop = node.scrollHeight
  })
  await container.hover()
  await page.mouse.wheel(0, 900)
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(shellScroll)
  await page.setViewportSize({ width: 1024, height: 900 })
  await expect
    .poll(() =>
      pdf
        .locator(".page")
        .first()
        .evaluate((page) => {
          const container = page.closest(".cmcc-pdf-pages")!
          return page.getBoundingClientRect().width <= container.clientWidth + 1
        }),
    )
    .toBe(true)
  const download = page.waitForEvent("download")
  await page.locator("#review-panel").getByRole("button", { name: "下载", exact: true }).click()
  expect(await readFile((await (await download).path())!)).toEqual(data.files["report.pdf"].bytes)
  await page.getByRole("button", { name: /^文字报告/ }).click()
  await page.getByRole("button", { name: "report.md", exact: true }).click()
  await expect(pdf).toHaveCount(0)
  await page.getByRole("button", { name: /^可视化报告/ }).click()
  await page.getByRole("button", { name: "report.pdf", exact: true }).click()
  await expect(pdf).toHaveAttribute("data-ready", "true")
  await expect(pdf.locator(".textLayer").first()).toContainText("中文预览测试")
  await page.screenshot({ path: info.outputPath("pdf-resized.png") })
  expect(data.errors).toEqual([])
})

test("PDF errors remain readable and allow switching back to other reports", async ({ page, baseURL }) => {
  const data = await setup(page, "deepcampaign")
  data.files["report.pdf"].bytes = Buffer.from("invalid test PDF")
  await page.goto(data.href(baseURL!))
  await openRight(page)
  await page.getByRole("button", { name: /^可视化报告/ }).click()
  await page.getByRole("button", { name: "report.pdf", exact: true }).click()
  await expect(page.getByText("PDF 预览失败，请下载原文件查看。", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: /^文字报告/ }).click()
  await page.getByRole("button", { name: "report.md", exact: true }).click()
  await expect(page.locator('#review-panel [data-component="markdown"] h2')).toHaveText("Markdown preview fixture")
  expect(data.errors).toEqual([])
})

test("loading the PDF renderer keeps the file controls and conversation visible", async ({ page, baseURL }) => {
  const data = await setup(page)
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(/\/assets\/pdf-preview-(?!lazy-)[^/]+\.js$/, async (route) => {
    await pending
    await route.continue()
  })
  try {
    await page.goto(data.href(baseURL!))
    await openRight(page)
    await page.getByRole("button", { name: /^产出/ }).click()
    await page
      .getByRole("complementary", { name: "审查和文件" })
      .getByRole("button", { name: /report.pdf/ })
      .first()
      .click()
    await expect(page.getByRole("status").filter({ hasText: "正在加载 PDF..." })).toBeVisible()
    await expect(page.getByRole("button", { name: "下载", exact: true })).toBeVisible()
    await expect(page.getByRole("button", { name: "返回", exact: true })).toBeVisible()
    await expect(page.locator('[data-component="prompt-input"]')).toBeVisible()
    release()
    await expect(page.locator("[data-cmcc-pdf-preview]")).toHaveAttribute("data-ready", "true")
    expect(data.errors).toEqual([])
  } finally {
    release()
  }
})

test("CSV previews UTF-8 text without losing leading zeros", async ({ page, baseURL }, info) => {
  const data = await setup(page)
  await page.goto(data.href(baseURL!))
  await openRight(page)
  await page.getByRole("button", { name: /^产出/ }).click()
  await page
    .getByRole("complementary", { name: "审查和文件" })
    .getByRole("button", { name: /data.csv/ })
    .first()
    .click()
  await expect(page.locator("[data-cmcc-excel-preview] td").filter({ hasText: /^平安银行$/ })).toBeVisible()
  await expect(page.locator("[data-cmcc-excel-preview] td").filter({ hasText: /^贵州茅台$/ })).toBeVisible()
  await expect(page.locator("[data-cmcc-excel-preview] td").filter({ hasText: /^000001$/ })).toBeVisible()
  await page.screenshot({ path: info.outputPath("csv.png") })
  expect(data.errors).toEqual([])
})

test("Word bullets use Unicode while numbering and original downloads stay intact", async ({ page, baseURL }, info) => {
  const data = await setup(page)
  await page.goto(data.href(baseURL!))
  await openRight(page)
  await page.getByRole("button", { name: /^产出/ }).click()
  await page
    .getByRole("complementary", { name: "审查和文件" })
    .getByRole("button", { name: /report.docx/ })
    .first()
    .click()
  const document = page.locator('[data-cmcc-office-preview="docx"]')
  await expect(document.locator(".docx p").first()).toBeVisible()
  const bullets = await document.locator(".docx p").evaluateAll((paras) =>
    paras
      .map((p) => ({
        text: p.textContent,
        marker: getComputedStyle(p, "::before").content,
        font: getComputedStyle(p, "::before").fontFamily,
      }))
      .filter((p) => p.marker.includes("•")),
  )
  expect(bullets.length).toBeGreaterThan(0)
  expect(bullets.every((item) => !item.font.includes("Symbol"))).toBe(true)
  if (!data.real) {
    expect(bullets.map((item) => item.text)).toEqual(["一级圆点项目", "二级圆点项目"])
    const numbered = document.locator("p").filter({ hasText: "数字编号项目" })
    expect(await numbered.evaluate((p) => getComputedStyle(p, "::before").content)).toContain("counter(")
    const indent = await document
      .locator("p")
      .filter({ hasText: /圆点项目/ })
      .evaluateAll((paras) => paras.map((p) => parseFloat(getComputedStyle(p).marginLeft)))
    expect(indent[1]).toBeGreaterThan(indent[0])
  }
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "下载", exact: true }).click()
  expect(await readFile((await (await download).path())!)).toEqual(data.files["report.docx"].bytes)
  await document
    .locator("p")
    .filter({ hasText: data.real ? "A股行情数据" : "一级圆点项目" })
    .scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath("docx.png") })
  expect(data.errors).toEqual([])
})

for (const width of [1440, 1024]) {
  test(`general chat only shows four panel tabs with reports at ${width}`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width, height: 900 })
    const data = await setup(page)
    await page.goto(data.href(baseURL!))
    await openRight(page)
    const panel = page.getByRole("complementary", { name: "审查和文件" })
    const tabs = panel.locator("button[data-selected]").locator("..")
    await expect(panel.getByRole("button", { name: /^文字报告|^可视化报告/ })).toHaveCount(0)
    await expect(tabs.locator("button > span:first-child")).toHaveText(["计划", "产出", "浏览器", "审查"])
    for (const name of ["产出", "浏览器", "审查", "计划"]) {
      const tab = panel.getByRole("button", { name: new RegExp(`^${name}`) })
      await tab.click()
      await expect(tab).toHaveAttribute("data-selected", "")
    }
    await panel.getByRole("button", { name: /^产出/ }).click()
    await panel
      .getByRole("button", { name: /report.md/ })
      .first()
      .click()
    await expect(panel.locator('[data-component="markdown"] h2')).toHaveText("Markdown preview fixture")
    await panel.getByRole("button", { name: "返回", exact: true }).click()
    await panel
      .getByRole("button", { name: /report.html/ })
      .first()
      .click()
    await expect(panel.getByRole("button", { name: /^浏览器/ })).toHaveAttribute("data-selected", "")
    await expect(panel.frameLocator("iframe").getByRole("heading", { name: "HTML preview fixture" })).toBeVisible()
    await page.screenshot({ path: info.outputPath("four-panel-tabs.png") })
    await page.reload()
    await openRight(page)
    await expect(panel.getByRole("button", { name: /^产出/ })).toHaveText("产出5")
    await expect(panel.getByRole("button", { name: /^文字报告|^可视化报告/ })).toHaveCount(0)
    expect(data.errors).toEqual([])
  })
}

test("other native agent sessions retain their report tabs", async ({ page, baseURL }) => {
  const data = await setup(page, "deepcampaign")
  await page.goto(data.href(baseURL!))
  await openRight(page)
  await expect(page.locator('[data-cmcc-general-chat="true"]')).toHaveCount(0)
  await page.getByRole("button", { name: /^文字报告/ }).click()
  await page.getByRole("button", { name: "report.md", exact: true }).click()
  await expect(page.locator('#review-panel [data-component="markdown"] h2')).toHaveText("Markdown preview fixture")
  await page.getByRole("button", { name: /^可视化报告/ }).click()
  await page.getByRole("button", { name: "report.html", exact: true }).click()
  await expect(page.locator("#review-panel iframe")).toBeVisible()
  expect(data.errors).toEqual([])
})

for (const width of [1440, 1024]) {
  test(`native report tabs separate text and visual formats at ${width}`, async ({ page, baseURL }, info) => {
    await page.setViewportSize({ width, height: 900 })
    const data = await setup(page, "deepcampaign", true)
    await page.goto(data.href(baseURL!))
    await openRight(page)
    const panel = page.locator("#review-panel")
    const download = async (name: string) => {
      const pending = page.waitForEvent("download")
      await panel.getByRole("button", { name: "下载", exact: true }).click()
      expect(await readFile((await (await pending).path())!)).toEqual(data.files[name].bytes)
    }
    await panel.getByRole("button", { name: /^文字报告/ }).click()
    await expect(panel.getByRole("button", { name: /^文字报告/ })).toHaveText("文字报告2")
    for (const name of ["report.md", "report.docx"]) {
      await expect(panel.getByRole("button", { name, exact: true })).toHaveCount(1)
      await panel.getByRole("button", { name, exact: true }).click()
      if (name.endsWith("md")) await expect(panel.locator('[data-component="markdown"] h2')).toHaveText("Markdown preview fixture")
      if (name.endsWith("docx")) await expect(panel.locator('[data-cmcc-office-preview="docx"]')).toBeVisible()
      await download(name)
    }
    for (const name of ["report.pdf", "report.html"]) await expect(panel.getByRole("button", { name, exact: true })).toHaveCount(0)
    await panel.getByRole("button", { name: /^可视化报告/ }).click()
    await expect(panel.getByRole("button", { name: /^可视化报告/ })).toHaveText("可视化报告2")
    for (const name of ["report.md", "report.docx"]) await expect(panel.getByRole("button", { name, exact: true })).toHaveCount(0)
    await panel.getByRole("button", { name: "report.html", exact: true }).click()
    await expect(panel.frameLocator("iframe").getByRole("heading", { name: "HTML preview fixture" })).toBeVisible()
    await download("report.html")
    await panel.getByRole("button", { name: "report.pdf", exact: true }).click()
    await expect(panel.locator("[data-cmcc-pdf-preview]")).toHaveAttribute("data-ready", "true")
    await expect(panel.locator("iframe")).toHaveCount(0)
    await download("report.pdf")
    await page.screenshot({ path: info.outputPath("visual-report-formats.png") })
    await page.reload()
    await openRight(page)
    await panel.getByRole("button", { name: /^可视化报告/ }).click()
    await expect(panel.getByRole("button", { name: "report.pdf", exact: true })).toHaveCount(1)
    await expect(panel.getByRole("button", { name: "report.html", exact: true })).toHaveCount(1)
    expect(data.errors).toEqual([])
  })
}

for (const name of ["文字报告", "可视化报告"]) {
  test(`returning to general chat leaves the selected ${name} tab`, async ({ page, baseURL }) => {
    const data = await setup(page)
    data.session.agent = "preview-test-agent"
    await page.goto(data.href(baseURL!))
    await openRight(page)
    await page.getByRole("button", { name: new RegExp(`^${name}`) }).click()
    data.session.agent = "build"
    data.events.push({ type: "session.updated", properties: { info: data.session } })
    await expect(page.locator('[data-cmcc-general-chat="true"]')).toHaveCount(1)
    await expect(page.getByRole("button", { name: /^文字报告|^可视化报告/ })).toHaveCount(0)
    await expect(page.getByRole("button", { name: /^产出/ })).toHaveAttribute("data-selected", "")
    await expect(page.locator("#review-panel").getByRole("button", { name: /report.md/ })).toBeVisible()
    expect(data.errors).toEqual([])
  })
}
