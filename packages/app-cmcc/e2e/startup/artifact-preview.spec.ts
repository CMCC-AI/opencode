import { expect, test, type Page } from "@playwright/test"
import { readFile } from "node:fs/promises"
import { setupGeneralChat } from "./general-chat.fixture"
import { homeDirectory } from "./home-fixture"
import { previewFiles } from "./preview-files.fixture"

test.use({ locale: "zh-CN" })

async function setup(page: Page) {
  const data = await setupGeneralChat(page, { turns: 1 })
  const files: Record<string, { mime: string; bytes: Buffer }> = await previewFiles()
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
    return route.fulfill({ contentType: file.mime, body: file.bytes })
  })
  return { ...data, files, requests, violations, real }
}

async function openRight(page: Page) {
  await expect(page.getByRole("button", { name: /^(展开|隐藏)右栏$/ })).toBeVisible()
  const open = page.getByRole("button", { name: "展开右栏" })
  if (await open.isVisible()) await open.click()
  await expect(page.getByRole("button", { name: /^产出/ })).toBeVisible()
}

test("PDF uses the original file endpoint in both tabs under strict frame CSP", async ({ page, baseURL }, info) => {
  const data = await setup(page)
  await page.goto(data.href(baseURL!))
  await openRight(page)
  await page.getByRole("button", { name: /^文字报告/ }).click()
  await page.getByRole("button", { name: "report.pdf", exact: true }).click()
  const pdf = page.locator('iframe[title="report.pdf"]')
  await expect(pdf).toBeVisible()
  const url = new URL((await pdf.getAttribute("src"))!)
  expect(url.origin).toBe(baseURL)
  expect(url.pathname).toBe("/file/preview")
  expect(url.searchParams.get("directory")).toBe(homeDirectory)
  expect(url.searchParams.get("path")).toBe("runs/preview-check/report.pdf")
  await expect.poll(() => data.requests.length).toBeGreaterThan(0)
  await expect
    .poll(async () => {
      for (const frame of page.frames().filter((frame) => frame.url() === url.toString())) {
        if (await frame.locator("#sizer").count()) {
          const height = await frame.locator("#sizer").evaluate((element) => element.getBoundingClientRect().height)
          if (height > 0) return true
        }
      }
      return false
    })
    .toBe(true)
  await page.screenshot({ path: info.outputPath("pdf-report.png") })
  await page.getByRole("button", { name: /^产出/ }).click()
  await page
    .getByRole("complementary", { name: "审查和文件" })
    .getByRole("button", { name: /report.pdf/ })
    .first()
    .click()
  await expect(pdf).toHaveAttribute("src", url.toString())
  expect(data.violations).toEqual([])
  expect(data.errors).toEqual([])
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
  await page.getByRole("button", { name: /^文字报告/ }).click()
  await page.getByRole("button", { name: "report.docx", exact: true }).click()
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
