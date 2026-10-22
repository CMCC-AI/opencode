import { expect, test, type Page } from "@playwright/test"
import JSZip from "jszip"
import { RESEARCH_UPDATED } from "../../src/pages/general-deepinsight/model"
import { fixture } from "../smoke/session-timeline.fixture"
import { mockOpenCodeServer } from "../utils/mock-server"
import { prepareReferenceDeepInsight, prepareReferenceFeaturedCases } from "./reference-deepinsight"
import { discoveryPayload } from "./discovery.fixture"
import { outlineFixture, thinkingFixture } from "./thinking.fixture"

test.use({ channel: process.env.PLAYWRIGHT_CHANNEL, video: "off" })
const id = "a1cce3d1-eaa2-4f6c-8432-37a2ccbc25df"
const code = "c1cce3d1-eaa2-4f6c-8432-37a2ccbc25df"

const citedReport =
  "# 引用样式验收报告\n\n## 第一章\n\n产业集群<cite>http://www.jinan.gov.cn/</cite>，企业情况<cite>http://www.jngi.gov.cn/</cite>。\n\n{{chart:1}}\n\n## 第二章\n\n重复引用<cite>http://www.jinan.gov.cn/</cite>。普通 [说明链接](https://example.org/plain) 不转换。\n\n`<cite>https://example.org/code</cite>`\n\n```html\n<cite>https://example.org/fence</cite>\n```"

async function prepare(page: Page, initial = "completed", allowed = true, caseCount = 1) {
  let status = initial
  let reportContent = "# 研究报告\n\n这是中文正文。\n\n|主题|结论|\n|---|---|\n|治理|可验证|"
  const requests: { method: string; path: string; body: unknown }[] = []
  const errors: string[] = []
  page.on("pageerror", (error) => errors.push(error.message))
  await mockOpenCodeServer(page, fixture)
  await page.addInitScript(() => localStorage.setItem("dockapi.accessToken", "research-test"))
  const info = () => ({
    id,
    source: "langgraph",
    sourceId: id,
    productType: "general-deepinsight",
    title: "测试研究任务",
    query: "研究中文数据治理",
    status,
    tokenCount: 170,
    sourcesCount: 2,
    reportLength: 150,
    elapsedSeconds: 61,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    capabilities: { open: true, rename: true, delete: true },
  })
  const caseInfo = {
    source: "langgraph",
    productType: "general-deepinsight",
    caseCode: code,
    caseName: "数据治理研究案例",
    caseDescription: "已完成的研究",
    caseTag: "通用深度洞察",
    coverUrl: "/test-research-cover.svg",
    snapshotVersion: "1",
    publishedAt: new Date().toISOString(),
  }
  const cases = Array.from({ length: caseCount }, (_, index) => ({
    ...caseInfo,
    caseCode: index ? `${code.slice(0, -2)}${String(index).padStart(2, "0")}` : code,
    caseName: index ? `数据治理研究案例 ${index + 1}` : caseInfo.caseName,
    publishedAt: new Date(Date.UTC(2026, 9, 1 + index)).toISOString(),
  }))
  let currentCases = cases
  const detail = (caseMode = false) => ({
    session: { ...info(), ...(caseMode ? { status: "completed" } : {}) },
    reportContent,
    dataVersion: "1",
    ...(caseMode ? { readOnly: true, caseInfo } : {}),
    conversationData: {
      steps: [
        { name: "generate_query", createdAt: 1, payload: { research_plan: ["研究资料", "核验证据"] } },
        {
          name: "web_search",
          createdAt: 2,
          payload: { sources_gathered: [{ title: "来源一", url: "https://example.org/a" }] },
        },
      ],
      ...(status === "interrupted"
        ? {
            pendingInterrupt: {
              type: "plan_confirmation",
              question: "请确认研究计划",
              research_plan: ["研究资料", "核验证据"],
              queries: ["数据治理"],
            },
          }
        : {}),
      visualReport: {
        title: "可视化研究报告",
        sections: [
          {
            heading: "结果对比",
            blocks: [
              { type: "markdown", content: "## 图表分析" },
              {
                type: "chart",
                chart: {
                  title: "研究图表",
                  option: {
                    xAxis: { type: "category", data: ["主题甲", "主题乙"] },
                    yAxis: { type: "value" },
                    series: [{ type: "bar", data: [3, 7] }],
                  },
                },
              },
              { type: "table", columns: ["中文", "结果"], rows: [["治理", "完整"]] },
            ],
          },
        ],
      },
      uploadedFiles: [],
    },
  })
  await page.route("**/test-research-cover.svg", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#edf4ff"/><rect x="80" y="80" width="480" height="200" rx="4" fill="#6fa6d6"/></svg>',
    }),
  )
  await page.route("**/api/**", async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    const body = request.postDataJSON()
    requests.push({ method: request.method(), path, body })
    const json = (data: unknown) => route.fulfill({ json: { code: 200, message: "ok", data } })
    if (path === "/api/user/profile")
      return json({
        user: { id: 7, name: "测试用户", enabled: true, casePublishAllowed: allowed },
        workspace: { id: 7, workspaceKey: "test", directoryPath: fixture.directory, status: "READY" },
      })
    if (path === "/api/dockapi/sessions") return json([])
    if (path === "/api/dockapi/token-quota")
      return json({
        enabled: false,
        vip: false,
        weeklyLimit: null,
        used: 0,
        reserved: 0,
        remaining: null,
        weekStart: 1,
        resetAt: 2,
        hasUnknownUsage: false,
      })
    if (path === "/api/dockapi/history") return json([info()])
    if (path.endsWith("/cases") && path.includes("general-deepinsight")) return json(currentCases)
    const selectedCase = currentCases.find((item) => path.endsWith(`/cases/${item.caseCode}`))
    if (selectedCase) {
      if (request.method() === "DELETE") {
        currentCases = currentCases.filter((item) => item.caseCode !== selectedCase.caseCode)
        return json(null)
      }
      return json({ ...detail(true), caseInfo: selectedCase })
    }
    if (path.endsWith("/sessions") && request.method() === "POST") {
      status = "pending"
      return json(info())
    }
    if (path.endsWith(`/sessions/${id}`)) {
      if (request.method() === "PATCH") return json(null)
      return json(detail())
    }
    if (path.endsWith("/stop")) {
      status = "stopped"
      return json(null)
    }
    if (path.endsWith("/stream") || path.endsWith("/resume")) {
      status = "completed"
      return route.fulfill({
        contentType: "text/event-stream",
        body: 'event: updates\ndata: {"finalize_answer":{"final_report":"# 完成报告\\n\\n研究完成。"}}\n\nevent: done\ndata: {"status":"completed"}\n\n',
      })
    }
    if (path.endsWith("/report") && request.method() === "PUT") {
      reportContent = body.reportContent
      return json(null)
    }
    if (path.endsWith("/report/rewrite")) return json({ status: "success", rewritten_text: "AI 润色后的新文" })
    return json([])
  })
  return {
    requests,
    errors,
    detail: detail(),
    cases,
    setReport: (content: string) => {
      reportContent = content
    },
  }
}

async function freezeConfirmationClock(page: Page) {
  await page.clock.install({ time: new Date("2026-10-09T04:00:00Z") })
  await page.clock.pauseAt(new Date("2026-10-09T04:00:01Z"))
}

const limitedQuota = {
  enabled: true,
  vip: false,
  weeklyLimit: 100000,
  used: 90000,
  reserved: 10000,
  remaining: 0,
  weekStart: Date.UTC(2026, 9, 18, 16),
  resetAt: Date.UTC(2026, 9, 25, 16),
  hasUnknownUsage: false,
}

test("weekly quota blocks initial research and supports a manual balance recheck", async ({ page }) => {
  const data = await prepare(page, "pending")
  let remaining = 0
  await page.route("**/api/dockapi/token-quota", (route) =>
    route.fulfill({ json: { code: 200, data: { ...limitedQuota, remaining } } }),
  )
  await page.goto(`/general-deepinsight/session/${id}?start=1`)
  await expect(page.getByText("本周 Token 额度不足，请联系管理员或等待下周一重置", { exact: true })).toBeVisible()
  expect(data.requests.filter((request) => request.path.endsWith("/stream"))).toHaveLength(0)
  remaining = 50000
  await page.getByRole("button", { name: "重新检查", exact: true }).click()
  await expect.poll(() => data.requests.filter((request) => request.path.endsWith("/stream")).length).toBe(1)
  expect(data.errors).toEqual([])
})

test("weekly quota VIP can start research without a finite balance", async ({ page }) => {
  const data = await prepare(page, "pending")
  await page.route("**/api/dockapi/token-quota", (route) =>
    route.fulfill({ json: { code: 200, data: { ...limitedQuota, vip: true, weeklyLimit: null, remaining: null } } }),
  )
  await page.goto(`/general-deepinsight/session/${id}?start=1`)
  await expect.poll(() => data.requests.filter((request) => request.path.endsWith("/stream")).length).toBe(1)
  expect(data.errors).toEqual([])
})

test("weekly quota lookup failures never submit research", async ({ page }) => {
  const data = await prepare(page, "pending")
  await page.route("**/api/dockapi/token-quota", (route) =>
    route.fulfill({ status: 503, json: { code: 503, message: "额度服务暂时不可用", data: null } }),
  )
  await page.goto(`/general-deepinsight/session/${id}?start=1`)
  await expect(page.getByText("额度服务暂时不可用", { exact: true })).toBeVisible()
  expect(data.requests.filter((request) => request.path.endsWith("/stream"))).toHaveLength(0)
  expect(data.errors).toEqual([])
})

test("weekly quota blocks continuing an interrupted plan", async ({ page }) => {
  const data = await prepare(page, "interrupted")
  await page.route("**/api/dockapi/token-quota", (route) => route.fulfill({ json: { code: 200, data: limitedQuota } }))
  await page.goto(`/general-deepinsight/session/${id}`)
  await page.locator(".plan-confirmation-card .confirm-btn").click()
  await expect(page.getByText("本周 Token 额度不足，请联系管理员或等待下周一重置", { exact: true })).toBeVisible()
  expect(data.requests.filter((request) => request.path.endsWith("/resume"))).toHaveLength(0)
  await expect(page.locator(".general-research-result")).toHaveAttribute("data-status", "interrupted")
})

test("weekly quota blocks AI polishing without changing the chapter", async ({ page }) => {
  const data = await openChapterEditor(page)
  await page.route("**/api/dockapi/token-quota", (route) => route.fulfill({ json: { code: 200, data: limitedQuota } }))
  await selectChapterText(page)
  await page.getByRole("textbox", { name: "AI 修改需求", exact: true }).fill("更简练")
  await page.getByRole("button", { name: "AI 润色", exact: true }).click()
  await expect(page.getByText("本周 Token 额度不足，请联系管理员或等待下周一重置", { exact: true })).toBeVisible()
  expect(data.requests.filter((request) => request.path.endsWith("/report/rewrite"))).toHaveLength(0)
  await expect(page.getByRole("button", { name: "应用 AI 修改", exact: true })).toBeDisabled()
  await page.getByRole("button", { name: "取消 AI 修改", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "章节 Markdown 正文", exact: true })).toHaveValue(
    "相同文字，前文。相同文字，后文。\n\n",
  )
  expect(data.requests.filter((request) => request.method === "PUT")).toHaveLength(0)
})

for (const width of [1440, 390]) {
  test(`weekly quota settings show consumed and reserved separately at ${width}px`, async ({ page }) => {
    const data = await prepare(page)
    await page.setViewportSize({ width, height: 1000 })
    await page.route("**/file/directory*", (route) => route.fulfill({ json: { path: fixture.directory } }))
    await page.route("**/api/dockapi/token-quota", (route) =>
      route.fulfill({ json: { code: 200, data: { ...limitedQuota, used: 32000, reserved: 8000, remaining: 60000 } } }),
    )
    await page.goto("/app")
    await expect(page.locator('[data-component="session-new-design"]').first()).toBeVisible()
    await page.keyboard.press("Control+,")
    await page.getByRole("tab", { name: "Token 额度", exact: true }).click()
    const dialog = page.getByRole("dialog")
    await expect(dialog.getByText("32,000 Token", { exact: true })).toBeVisible()
    await expect(dialog.getByText("8,000 Token", { exact: true })).toBeVisible()
    await expect(dialog.getByText("60,000 Token", { exact: true })).toBeVisible()
    await page.screenshot({ path: test.info().outputPath("weekly-quota.png") })
    expect(data.errors).toEqual([])
  })
}

for (const width of [1920, 390]) {
  test(`final report citations reuse numbers across chapters and Word without changing data at ${width}px`, async ({
    page,
  }) => {
    const data = await prepare(page)
    const detail = { ...data.detail, session: { ...data.detail.session, sourcesCount: 0 }, reportContent: citedReport }
    await page.route(`**/api/dockapi/general-deepinsight/sessions/${id}`, (route) =>
      route.fulfill({ json: { code: 200, data: detail } }),
    )
    await page.setViewportSize({ width, height: 1080 })
    await page.goto(`/general-deepinsight/session/${id}`)
    if (width < 768) await page.getByRole("button", { name: "研究结果", exact: true }).click()
    await page.getByRole("tab", { name: "文字报告", exact: true }).click()
    const citations = page.locator(".report-view sup.gd-report-citation > a")
    await expect(citations).toHaveText(["1", "2", "1"])
    await expect(citations.first()).toHaveAttribute("href", "http://www.jinan.gov.cn/")
    await expect(citations.first()).toHaveAttribute("target", "_blank")
    await expect(citations.first()).toHaveAttribute("rel", "noopener noreferrer")
    await expect(page.locator(".stats-row .stat-value").nth(2)).toHaveText("0个信息源")
    await expect(page.locator('.report-view a[href="https://example.org/plain"]')).toHaveText("说明链接")
    await expect(page.locator(".report-view pre")).toContainText("<cite>https://example.org/fence</cite>")
    expect(await citations.first().evaluate((link) => getComputedStyle(link.parentElement!).verticalAlign)).toBe(
      "super",
    )
    await page.screenshot({ path: test.info().outputPath("report-citations.png") })
    const pending = page.waitForEvent("download")
    await page.getByRole("button", { name: "导出 Word", exact: true }).click()
    const download = await pending
    await download.saveAs(test.info().outputPath("citation-report.docx"))
    const fs = await import("node:fs/promises")
    const zip = await JSZip.loadAsync(await fs.readFile((await download.path())!))
    const documentXml = await zip.file("word/document.xml")!.async("string")
    const links = await zip.file("word/_rels/document.xml.rels")!.async("string")
    const superscripts = await page.evaluate((xml) => {
      const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
      const doc = new DOMParser().parseFromString(xml, "application/xml")
      return Array.from(doc.getElementsByTagNameNS(ns, "r"))
        .filter((run) => run.getElementsByTagNameNS(ns, "vertAlign")[0]?.getAttributeNS(ns, "val") === "superscript")
        .map((run) => run.textContent)
    }, documentXml)
    expect(superscripts).toEqual(["1", "2", "1"])
    expect(links).toContain("http://www.jinan.gov.cn/")
    expect(links).toContain("http://www.jngi.gov.cn/")
    expect(data.requests.some((request) => request.method === "PUT")).toBe(false)
    await page.getByRole("button", { name: "修改文章", exact: true }).click()
    await expect(page.locator(".gd-report-editor sup.gd-report-citation > a")).toHaveText(["1", "2", "1"])
    await page.getByRole("button", { name: "编辑本章", exact: true }).first().click()
    await expect(page.getByRole("textbox", { name: "章节 Markdown 正文", exact: true })).toHaveValue(
      /<cite>http:\/\/www\.jinan\.gov\.cn\/<\/cite>/,
    )
    expect(data.errors).toEqual([])
  })
}

test("case citations render from the existing snapshot and survive async refresh", async ({ page }) => {
  const data = await prepare(page)
  data.setReport(citedReport)
  await page.goto(`/general-deepinsight/cases/${code}`)
  await page.getByRole("tab", { name: "文字报告", exact: true }).click()
  await expect(page.locator(".report-view sup.gd-report-citation > a")).toHaveText(["1", "2", "1"])
  await expect(page.getByRole("button", { name: "修改文章", exact: true })).toHaveCount(0)
  await page.goto(`/general-deepinsight/session/${id}`)
  await page.getByRole("tab", { name: "文字报告", exact: true }).click()
  await expect(page.locator(".report-view sup.gd-report-citation > a")).toHaveText(["1", "2", "1"])
  data.setReport("# 新的引用顺序\n\n<cite>https://example.org/new</cite>\n\n" + citedReport)
  await page.evaluate((event) => window.dispatchEvent(new CustomEvent(event, { detail: "mutation" })), RESEARCH_UPDATED)
  await expect(page.locator(".report-view sup.gd-report-citation > a")).toHaveText(["1", "2", "3", "2"])
  expect(data.requests.some((request) => request.method === "PUT")).toBe(false)
  expect(data.errors).toEqual([])
})

const chapterReport =
  "# 研究报告\n\n## 摘要\n相同文字，前文。相同文字，后文。\n\n## 1.1 分析\n保留正文。\n\n|主题|结论|\n|---|---|\n|治理|可验证|\n"

async function openChapterEditor(page: Page, width = 1920) {
  const data = await prepare(page)
  data.setReport(chapterReport)
  await page.setViewportSize({ width, height: 1080 })
  await page.goto(`/general-deepinsight/session/${id}`)
  if (width < 768) await page.getByRole("button", { name: "研究结果", exact: true }).click()
  await page.getByRole("tab", { name: "文字报告", exact: true }).click()
  await page.getByRole("button", { name: "修改文章", exact: true }).click()
  await expect(page.locator(".gd-report-editor .chapter-heading")).toHaveText(["研究报告", "摘要", "1.1 分析"])
  await page
    .locator(".chapter-section")
    .filter({ has: page.locator(".chapter-heading", { hasText: /^摘要$/ }) })
    .getByRole("button", { name: "编辑本章" })
    .click()
  return data
}

async function selectChapterText(page: Page, text = "相同文字") {
  const editor = page.getByRole("textbox", { name: "章节 Markdown 正文", exact: true })
  await editor.evaluate((element: HTMLTextAreaElement, text) => {
    element.focus()
    const start = element.value.lastIndexOf(text)
    element.setSelectionRange(start, start + text.length)
    element.dispatchEvent(new Event("select", { bubbles: true }))
  }, text)
  await expect(page.getByRole("textbox", { name: "AI 修改需求", exact: true })).toBeVisible()
}

for (const width of [1920, 390]) {
  test(`chapter selection polishing previews differences and only confirmation persists at ${width}px`, async ({
    page,
  }) => {
    const data = await openChapterEditor(page, width)
    const editor = page.getByRole("textbox", { name: "章节 Markdown 正文", exact: true })
    await selectChapterText(page)
    const toolbar = page.locator(".gd-report-selection-toolbar")
    const rect = await toolbar.boundingBox()
    expect(rect!.x).toBeGreaterThanOrEqual(0)
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(width)
    await page.getByRole("textbox", { name: "AI 修改需求", exact: true }).fill("改得更简练")
    await expect(page.locator(".selection-highlight-content mark")).toHaveText("相同文字")
    expect(
      await page
        .locator(".selection-highlight-content")
        .evaluate((element) => getComputedStyle(element).backgroundColor),
    ).toBe("rgba(0, 0, 0, 0)")
    await page.screenshot({ path: test.info().outputPath("chapter-selection.png") })
    await page.getByRole("button", { name: "AI 润色", exact: true }).click()
    await expect(page.locator("del.revision-original")).toHaveText("相同文字")
    await expect(page.getByRole("textbox", { name: "AI 生成内容", exact: true })).toHaveValue("AI 润色后的新文")
    expect(
      await page.locator("del.revision-original").evaluate((element) => ({
        color: getComputedStyle(element).color,
        decoration: getComputedStyle(element).textDecorationLine,
      })),
    ).toEqual({ color: "rgb(220, 38, 38)", decoration: "line-through" })
    expect(
      await page
        .getByRole("textbox", { name: "AI 生成内容", exact: true })
        .evaluate((element) => getComputedStyle(element).color),
    ).toBe("rgb(22, 101, 52)")
    await expect(page.getByRole("button", { name: "确认本章修改", exact: true })).toBeDisabled()
    expect(data.requests.filter((request) => request.method === "PUT")).toHaveLength(0)
    await page.screenshot({ path: test.info().outputPath("chapter-ai-preview.png") })
    await page.getByRole("textbox", { name: "AI 生成内容", exact: true }).fill("人工校正的新文")
    await page.getByRole("button", { name: "应用 AI 修改", exact: true }).click()
    await expect(editor).toHaveValue("相同文字，前文。人工校正的新文，后文。\n\n")
    expect(data.requests.filter((request) => request.method === "PUT")).toHaveLength(0)
    page.once("dialog", (dialog) => dialog.accept())
    await page.getByRole("button", { name: "确认本章修改", exact: true }).click()
    await expect(editor).toHaveCount(0)
    expect(data.requests.filter((request) => request.method === "PUT").map((request) => request.body)).toEqual([
      { reportContent: chapterReport.replace("相同文字，后文", "人工校正的新文，后文") },
    ])
    await page.getByRole("button", { name: "退出修改", exact: true }).click()
    await expect(page.locator(".report-view")).toContainText("人工校正的新文")
    await expect(page.locator(".report-view table")).toContainText("可验证")
    await page.reload()
    if (width < 768) await page.getByRole("button", { name: "研究结果", exact: true }).click()
    await page.getByRole("tab", { name: "文字报告", exact: true }).click()
    await expect(page.locator(".report-view")).toContainText("人工校正的新文")
    expect(data.errors).toEqual([])
  })
}

test("chapter manual edits keep titles immutable and save failure retains the draft for retry", async ({ page }) => {
  const data = await openChapterEditor(page)
  const editor = page.getByRole("textbox", { name: "章节 Markdown 正文", exact: true })
  await editor.fill("## 不允许新增的标题\n正文")
  await page.getByRole("button", { name: "确认本章修改", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("章节标题不可修改")
  expect(data.requests.filter((request) => request.method === "PUT")).toHaveLength(0)
  await editor.fill("手动修改但尚未保存的正文\n\n")
  await selectChapterText(page, "手动修改但尚未保存的正文")
  await page.getByRole("textbox", { name: "AI 修改需求", exact: true }).fill("润色")
  await page.getByRole("button", { name: "AI 润色", exact: true }).click()
  await expect(page.getByRole("textbox", { name: "AI 生成内容", exact: true })).toBeVisible()
  expect(data.requests.find((request) => request.path.endsWith("/report/rewrite"))!.body).toEqual({
    text: "手动修改但尚未保存的正文",
    requirements: "润色",
  })
  await page.getByRole("textbox", { name: "AI 生成内容", exact: true }).fill("## AI 不允许改标题")
  await page.getByRole("button", { name: "应用 AI 修改", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("包含 Markdown 标题")
  await page.getByRole("button", { name: "取消 AI 修改", exact: true }).click()
  await expect(editor).toHaveValue("手动修改但尚未保存的正文\n\n")
  let fail = true
  await page.route(`**/sessions/${id}/report`, (route) =>
    fail ? route.fulfill({ status: 502, json: { code: 502, message: "测试保存失败", data: null } }) : route.fallback(),
  )
  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("button", { name: "确认本章修改", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("测试保存失败")
  await expect(editor).toHaveValue("手动修改但尚未保存的正文\n\n")
  fail = false
  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("button", { name: "确认本章修改", exact: true }).click()
  await expect(editor).toHaveCount(0)
  expect(data.errors).toEqual([])
})

test("unsaved chapter changes are guarded when switching, exiting and navigating", async ({ page }) => {
  const data = await openChapterEditor(page)
  const editor = page.getByRole("textbox", { name: "章节 Markdown 正文", exact: true })
  await editor.fill("尚未保存的草稿")
  const second = page
    .locator(".chapter-section")
    .filter({ has: page.locator(".chapter-heading", { hasText: "1.1 分析" }) })
  page.once("dialog", (dialog) => dialog.dismiss())
  await second.getByRole("button", { name: "编辑本章" }).click()
  await expect(editor).toHaveValue("尚未保存的草稿")
  page.once("dialog", (dialog) => dialog.dismiss())
  await page.getByRole("button", { name: "退出修改", exact: true }).click()
  await expect(editor).toHaveValue("尚未保存的草稿")
  page.once("dialog", (dialog) => dialog.dismiss())
  await page.getByRole("navigation").getByRole("button", { name: "通用深度洞察", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/session/${id}$`))
  page.once("dialog", (dialog) => dialog.accept())
  await second.getByRole("button", { name: "编辑本章" }).click()
  await expect(editor).toHaveValue(/保留正文/)
  await page.getByRole("button", { name: "取消", exact: true }).click()
  await page.getByRole("button", { name: "退出修改", exact: true }).click()
  expect(data.requests.filter((request) => request.method === "PUT")).toHaveLength(0)
  expect(data.errors).toEqual([])
})

test("AI rewrite failures keep the original chapter and a canceled late response never applies", async ({ page }) => {
  const data = await openChapterEditor(page)
  let fail = true
  let release!: () => void
  await page.route("**/report/rewrite", async (route) => {
    if (fail) return route.fulfill({ status: 502, json: { code: 502, message: "测试润色失败", data: null } })
    await new Promise<void>((resolve) => {
      release = resolve
    })
    await route.fulfill({ json: { code: 200, data: { rewritten_text: "取消后不应应用的结果" } } }).catch(() => {})
  })
  await selectChapterText(page)
  await page.getByRole("textbox", { name: "AI 修改需求", exact: true }).fill("润色")
  await page.getByRole("button", { name: "AI 润色", exact: true }).click()
  await expect(page.getByRole("alert")).toContainText("测试润色失败")
  await expect(page.getByRole("button", { name: "应用 AI 修改", exact: true })).toBeDisabled()
  await page.getByRole("button", { name: "取消 AI 修改", exact: true }).click()
  fail = false
  await selectChapterText(page)
  await page.getByRole("textbox", { name: "AI 修改需求", exact: true }).fill("润色")
  await page.getByRole("button", { name: "AI 润色", exact: true }).click()
  await expect(page.getByText("AI 正在生成...", { exact: true })).toBeVisible()
  await page.getByRole("button", { name: "取消 AI 修改", exact: true }).click()
  release()
  await expect(page.getByRole("textbox", { name: "章节 Markdown 正文", exact: true })).toHaveValue(
    "相同文字，前文。相同文字，后文。\n\n",
  )
  await expect(page.locator(".ai-revision-panel")).toHaveCount(0)
  expect(data.requests.filter((request) => request.method === "PUT")).toHaveLength(0)
  expect(data.errors).toEqual([])
})

test("chapter editor materials and revision colors match the original Vue editor", async ({ page, browser }) => {
  test.skip(!process.env.CMCC_REFERENCE_BASE_URL, "Reference project preview is required for visual comparison")
  const data = await openChapterEditor(page)
  const reference = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  await prepareReferenceDeepInsight(reference, { ...data.detail, reportContent: chapterReport })
  const actualBox = (await page.locator(".general-research-result").boundingBox())!
  const referenceBox = (await reference.locator(".chat-container").boundingBox())!
  await reference.setViewportSize({ width: Math.round(referenceBox.x + actualBox.width), height: 1080 })
  await reference.getByRole("button", { name: "文字报告", exact: true }).click()
  await reference.getByRole("button", { name: "修改文章", exact: true }).click()
  await reference
    .locator(".chapter-section")
    .filter({ has: reference.locator(".chapter-heading", { hasText: /^摘要$/ }) })
    .getByRole("button", { name: "编辑本章" })
    .click()
  const materials = (editor: ReturnType<Page["locator"]>) =>
    editor.evaluate((root) => {
      const result: Record<string, string[]> = {}
      for (const selector of [
        ".chapter-heading.level-2",
        ".chapter-card",
        ".chapter-textarea",
        ".chapter-actions .primary-button",
      ]) {
        const style = getComputedStyle(root.querySelector(selector)!)
        result[selector] = [
          style.fontSize,
          style.lineHeight,
          style.padding,
          style.borderRadius,
          style.borderTopWidth,
          style.color,
          style.backgroundColor,
        ]
      }
      return result
    })
  expect(await materials(page.locator(".gd-report-editor"))).toEqual(
    await materials(reference.locator(".report-editor")),
  )
  await page.locator(".gd-report-editor").screenshot({ path: test.info().outputPath("implemented-editor.png") })
  await reference.locator(".report-editor").screenshot({ path: test.info().outputPath("reference-editor.png") })
  await reference.close()
  expect(data.errors).toEqual([])
})

test("saving a chapter blocks duplicate submissions and accidental exit", async ({ page }) => {
  const data = await openChapterEditor(page)
  await page.getByRole("textbox", { name: "章节 Markdown 正文", exact: true }).fill("确认中的新内容\n\n")
  let release!: () => void
  let saves = 0
  await page.route(`**/sessions/${id}/report`, async (route) => {
    saves++
    await new Promise<void>((resolve) => {
      release = resolve
    })
    await route.fallback()
  })
  page.once("dialog", (dialog) => dialog.accept())
  await page.getByRole("button", { name: "确认本章修改", exact: true }).click()
  await expect(page.getByRole("button", { name: "保存中...", exact: true })).toBeDisabled()
  await expect(page.getByRole("button", { name: "退出修改", exact: true })).toBeDisabled()
  await expect(page.getByRole("button", { name: "取消", exact: true })).toBeDisabled()
  release()
  await expect(page.getByRole("textbox", { name: "章节 Markdown 正文", exact: true })).toHaveCount(0)
  expect(saves).toBe(1)
  expect(data.errors).toEqual([])
})

for (const width of [1920, 390]) {
  test(`outline is structured while report and visual delivery remain completion-only at ${width}px`, async ({
    page,
  }) => {
    const data = await prepare(page)
    await page.setViewportSize({ width, height: 1080 })
    const outline = outlineFixture()
    const detail = {
      ...data.detail,
      conversationData: {
        ...data.detail.conversationData,
        ...thinkingFixture(),
        steps: [
          ...thinkingFixture().steps,
          {
            name: "generate_outline",
            createdAt: 8,
            payload: {
              outline,
              thinking_processes: [{ ai_thought: "不需要展示的大纲思考", output_data: { internal_outline: true } }],
            },
          },
          {
            name: "finalize_answer",
            createdAt: 9,
            payload: {
              final_report: "不应在思考卡片重复出现的报告全文",
              thinking_processes: [{ ai_thought: "不需要展示的报告思考", output_data: { internal_report: true } }],
            },
          },
          {
            name: "viz_post_process",
            createdAt: 10,
            payload: {
              visual_report: { title: "真实可视化产物" },
              thinking_processes: [{ ai_thought: "不需要展示的可视化思考", output_data: { internal_visual: true } }],
            },
          },
        ],
      },
    }
    await page.route(`**/api/dockapi/general-deepinsight/sessions/${id}`, (route) =>
      route.fulfill({ json: { code: 200, data: detail } }),
    )
    await page.goto(`/general-deepinsight/session/${id}`)
    if (width < 768) await page.getByRole("button", { name: "研究结果", exact: true }).click()
    await page.getByRole("button", { name: "查看思考过程", exact: true }).click()
    const right = page.locator(".right-panel")
    const outlineCard = right.locator('[data-node="generate_outline"]')
    await outlineCard.getByRole("button", { name: "生成大纲", exact: true }).click()
    await expect(outlineCard.locator(".outline-section-row")).toHaveCount(7)
    await expect(outlineCard.locator(".outline-sec-title")).toHaveText(
      outline.sections.map((section) => section.section_title),
    )
    await expect(outlineCard.locator(".detail-section h5")).toContainText("测试结构化大纲")
    await expect(outlineCard.locator(".detail-section h5 .count")).toHaveText("目标 22,500 字")
    await expect(outlineCard.locator(".outline-sec-words").first()).toHaveText("3000字")
    await expect(outlineCard.locator("pre,.thinking-process")).toHaveCount(0)
    const report = right.locator('[data-node="finalize_answer"]')
    const visual = right.locator('[data-node="viz_post_process"]')
    await expect(report.locator(".timeline-badge")).toHaveText("报告撰写完成")
    await expect(visual.locator(".timeline-badge")).toHaveText("可视化报告完成")
    await expect(report.locator(".timeline-detail,.timeline-arrow,button")).toHaveCount(0)
    await expect(visual.locator(".timeline-detail,.timeline-arrow,button")).toHaveCount(0)
    await expect(visual.locator(".timeline-dot img")).toHaveAttribute(
      "src",
      (await report.locator(".timeline-dot img").getAttribute("src")) as string,
    )
    await expect(right.getByText(/不需要展示|不应在/)).toHaveCount(0)
    await visual.scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath("delivery-cards.png") })
    await page.getByRole("button", { name: "查看报告", exact: true }).click()
    await page.getByRole("tab", { name: "文字报告", exact: true }).click()
    await expect(right.locator(".report-view")).toContainText("这是中文正文")
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(data.errors).toEqual([])
  })
}

test("running delivery without an observed output is not marked complete", async ({ page }) => {
  const data = await prepare(page, "running")
  const detail = {
    ...data.detail,
    reportContent: "",
    conversationData: { ...data.detail.conversationData, steps: [], runningNode: "viz_post_process" },
  }
  await page.route(`**/api/dockapi/general-deepinsight/sessions/${id}`, (route) =>
    route.fulfill({ json: { code: 200, data: detail } }),
  )
  await page.goto(`/general-deepinsight/session/${id}`)
  await expect(page.locator(".right-panel .active-label")).toHaveText("可视化报告中...")
  await expect(page.locator('.right-panel [data-node="viz_post_process"]')).toHaveCount(0)
  await expect(page.locator(".right-panel").getByText("可视化报告完成", { exact: true })).toHaveCount(0)
})

for (const width of [1920, 390]) {
  test(`right thinking cards use original details and completely collapse at ${width}px`, async ({ page }) => {
    const data = await prepare(page)
    await page.setViewportSize({ width, height: 1080 })
    const detail = { ...data.detail, conversationData: { ...data.detail.conversationData, ...thinkingFixture() } }
    await page.route(`**/api/dockapi/general-deepinsight/sessions/${id}`, (route) =>
      route.fulfill({ json: { code: 200, data: detail } }),
    )
    await page.goto(`/general-deepinsight/session/${id}`)
    if (width < 768) await page.getByRole("button", { name: "研究结果", exact: true }).click()
    await page.getByRole("button", { name: "查看思考过程", exact: true }).click()
    const right = page.locator(".right-panel")
    await expect(
      right.locator(
        '.timeline-item[data-node="safety_check"],.timeline-item[data-node="intent_analysis"],.timeline-item[data-node="continue_research"]',
      ),
    ).toHaveCount(0)
    const plan = right.locator('[data-kind="plan"]')
    await plan.getByRole("button", { name: "生成研究计划", exact: true }).click()
    await expect(plan.locator(".timeline-detail .plan-item")).toHaveCount(8)
    await expect(plan.locator(".timeline-detail")).toHaveCSS("max-height", "300px")
    await plan.getByRole("button", { name: "生成研究计划", exact: true }).click()
    await expect(plan.locator(".timeline-detail,.timeline-plan-preview")).toHaveCount(0)
    const confirmation = right.locator('[data-kind="confirmation"]')
    await confirmation.getByRole("button", { name: "研究计划确认", exact: true }).click()
    await expect(confirmation.locator(".timeline-badge")).toHaveText("已确认")
    await expect(confirmation.locator(".timeline-detail")).toContainText("研究主题：测试研究主题")
    await expect(confirmation.locator(".timeline-detail")).toContainText("确认内容：确认当前方案")
    await expect(confirmation.getByText(/确认方式/)).toHaveCount(0)
    const search = right.locator('[data-node="web_search"]')
    await search.getByRole("button", { name: "查看详细来源", exact: true }).click()
    await expect(search.locator(".source-item")).toHaveCount(44)
    await expect(search.locator(".source-list")).toHaveCSS("max-height", "180px")
    await expect(search.locator(".source-title").first()).toHaveAttribute("href", "https://example.org/source/1")
    const reflection = right.locator('[data-node="reflection"]')
    await reflection.getByRole("button", { name: "深度反思", exact: true }).click()
    await expect(reflection.locator(".detail-section h5")).toHaveText(["评估摘要", "知识缺口", "下轮规划"])
    await expect(reflection.locator(".reflection-text").first()).toHaveText("评估摘要的真实字段内容。")
    await expect(reflection.locator(".next-steps-list li")).toHaveCount(2)
    await expect(reflection.locator(".next-steps-list")).toHaveCSS("list-style-type", "disc")
    await expect(right.locator("pre,.thinking-process,.research-coverage-list,.coverage-step-list")).toHaveCount(0)
    await reflection.scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath("thinking.png") })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(data.errors).toEqual([])
  })
}

test("zero-source search cards do not show invented sources, AI thoughts or JSON", async ({ page }) => {
  const data = await prepare(page)
  const detail = { ...data.detail, conversationData: { ...data.detail.conversationData, ...thinkingFixture(0) } }
  await page.route(`**/api/dockapi/general-deepinsight/sessions/${id}`, (route) =>
    route.fulfill({ json: { code: 200, data: detail } }),
  )
  await page.goto(`/general-deepinsight/session/${id}`)
  await page.getByRole("button", { name: "查看思考过程", exact: true }).click()
  const search = page.locator('.right-panel [data-node="web_search"]')
  await expect(search.locator(".timeline-badge")).toHaveText("本轮搜索0个来源")
  await search.getByRole("button", { name: "网络搜索", exact: true }).click()
  await expect(search.locator(".source-item,pre,.thinking-process")).toHaveCount(0)
  await expect(search.locator("h5")).toHaveText("信息来源 共0个来源")
  expect(data.errors).toEqual([])
})

test("pending right-side plan confirmation is display-only and keeps left actions", async ({ page }) => {
  const data = await prepare(page, "interrupted")
  const fixture = thinkingFixture()
  const detail = {
    ...data.detail,
    reportContent: "",
    conversationData: {
      ...data.detail.conversationData,
      steps: fixture.steps.slice(0, 2),
      interruptHistory: [],
      pendingInterrupt: fixture.interruptHistory[0]!.payload,
    },
  }
  await page.route(`**/api/dockapi/general-deepinsight/sessions/${id}`, (route) =>
    route.fulfill({ json: { code: 200, data: detail } }),
  )
  await page.goto(`/general-deepinsight/session/${id}`)
  const confirmation = page.locator('.right-panel [data-kind="confirmation"]')
  await expect(confirmation.locator(".timeline-badge")).toHaveText("待确认")
  await confirmation.getByRole("button", { name: "研究计划确认", exact: true }).click()
  await expect(confirmation.getByRole("button")).toHaveCount(1)
  await expect(page.locator(".left-panel .confirm-btn")).toBeEnabled()
  expect(data.requests.filter((request) => request.path.endsWith("/resume"))).toHaveLength(0)
  expect(data.errors).toEqual([])
})

test("detail refresh preserves thinking mode and the correct expanded card", async ({ page }) => {
  const data = await prepare(page)
  const fixture = thinkingFixture()
  let detail = { ...data.detail, conversationData: { ...data.detail.conversationData, ...fixture } }
  await page.route(`**/api/dockapi/general-deepinsight/sessions/${id}`, (route) =>
    route.fulfill({ json: { code: 200, data: detail } }),
  )
  await page.goto(`/general-deepinsight/session/${id}`)
  await page.getByRole("button", { name: "查看思考过程", exact: true }).click()
  const search = page.locator('.right-panel [data-node="web_search"]')
  await search.getByRole("button", { name: "网络搜索", exact: true }).click()
  detail = {
    ...detail,
    conversationData: {
      ...detail.conversationData,
      interruptHistory: [
        ...fixture.interruptHistory,
        {
          payload: { ...fixture.interruptHistory[0]!.payload, research_topic: "修改后的研究主题" },
          resume: { action: "confirm" },
          confirmedAt: 5.5,
        },
      ],
    },
  }
  const refresh = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith(`/sessions/${id}`))
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("general-deepinsight-updated", { detail: "mutation" })),
  )
  await refresh
  await expect(page.locator('.right-panel [data-kind="confirmation"]')).toHaveCount(2)
  await expect(search.getByRole("button", { name: "网络搜索", exact: true })).toHaveAttribute("aria-expanded", "true")
  await expect(search.locator(".source-item")).toHaveCount(44)
  await expect(page.getByRole("button", { name: "查看报告", exact: true })).toBeVisible()
  expect(data.errors).toEqual([])
})

test("read-only cases and replay reuse thinking cards without revealing future confirmations", async ({ page }) => {
  const data = await prepare(page)
  const detail = {
    ...data.detail,
    readOnly: true,
    caseInfo: data.cases[0],
    conversationData: { ...data.detail.conversationData, ...thinkingFixture() },
  }
  await page.route(`**/api/dockapi/general-deepinsight/cases/${code}`, (route) =>
    route.fulfill({ json: { code: 200, data: detail } }),
  )
  await page.clock.install({ time: new Date("2026-10-09T04:00:00Z") })
  await page.clock.pauseAt(new Date("2026-10-09T04:00:01Z"))
  await page.goto(`/general-deepinsight/cases/${code}`)
  await page.getByRole("button", { name: "看回放", exact: true }).click()
  await expect(page.locator('.right-panel [data-kind="confirmation"]')).toHaveCount(0)
  await page.clock.runFor(30_000)
  await expect(page.locator('.right-panel [data-kind="confirmation"]')).toHaveCount(1)
  await expect(page.locator('.right-panel [data-kind="confirmation"] .timeline-badge')).toHaveText("已确认")
  expect(data.requests.filter((request) => request.path.endsWith("/resume"))).toHaveLength(0)
  await page.getByRole("button", { name: "停止回放", exact: true }).click()
  await expect(page.getByRole("button", { name: "查看报告", exact: true })).toBeVisible()
  await expect(page.locator('.right-panel [data-kind="confirmation"]')).toHaveCount(1)
  expect(data.errors).toEqual([])
})

test("right plan, search and reflection detail styles match the original Vue view", async ({ page, browser }) => {
  test.skip(!process.env.CMCC_REFERENCE_BASE_URL, "Reference project preview is required for visual comparison")
  const data = await prepare(page)
  await page.setViewportSize({ width: 1920, height: 1300 })
  const detail = {
    ...data.detail,
    conversationData: {
      ...data.detail.conversationData,
      ...thinkingFixture(),
      steps: [
        ...thinkingFixture().steps,
        { name: "generate_outline", payload: { outline: outlineFixture() }, createdAt: 8 },
      ],
    },
  }
  await page.route(`**/api/dockapi/general-deepinsight/sessions/${id}`, (route) =>
    route.fulfill({ json: { code: 200, data: detail } }),
  )
  await page.goto(`/general-deepinsight/session/${id}`)
  await page.getByRole("button", { name: "查看思考过程", exact: true }).click()
  const box = (await page.locator(".general-research-result").boundingBox())!
  const reference = await browser.newPage({ viewport: { width: 1920, height: 1300 } })
  await prepareReferenceDeepInsight(reference, detail)
  const referenceBox = (await reference.locator(".chat-container").boundingBox())!
  await reference.setViewportSize({ width: Math.round(referenceBox.x + box.width), height: 1300 })
  await reference.getByRole("button", { name: "查看思考过程", exact: true }).click()
  for (const title of ["生成研究计划", "网络搜索", "深度反思", "生成大纲"]) {
    const actual = page
      .locator(".right-panel .timeline-item")
      .filter({ has: page.locator(".timeline-title", { hasText: title }) })
    const expected = reference
      .locator(".right-panel .timeline-item")
      .filter({ has: reference.locator(".timeline-title", { hasText: title }) })
    await actual.getByRole("button", { name: title, exact: true }).click()
    await expected.locator(".timeline-header").click()
    const materials = (card: ReturnType<Page["locator"]>) =>
      card.evaluate((card) => {
        const root = card.querySelector(".timeline-detail")!
        const header = getComputedStyle(card.querySelector(".timeline-header")!)
        const selector = root.querySelector(".plan-item")
          ? ".plan-item"
          : root.querySelector(".source-item")
            ? ".source-item"
            : root.querySelector(".outline-section-row")
              ? ".outline-section-row"
              : ".reflection-text"
        const element = root.querySelector(selector)!
        const style = getComputedStyle(root)
        const inner = getComputedStyle(element)
        return {
          width: Math.round(root.getBoundingClientRect().width),
          padding: style.padding,
          background: style.backgroundColor,
          radius: style.borderRadius,
          maxHeight: style.maxHeight,
          innerFont: inner.fontSize,
          innerColor: inner.color,
          innerGap: inner.gap,
          headerPadding: header.padding,
          headerGap: header.gap,
          headerBorderWidth: header.borderTopWidth,
          headerRadius: header.borderRadius,
        }
      })
    expect(await materials(actual)).toEqual(await materials(expected))
    await actual.screenshot({ path: test.info().outputPath(`implemented-${title}.png`) })
    await expected.screenshot({ path: test.info().outputPath(`reference-${title}.png`) })
  }
  await reference.close()
  expect(data.errors).toEqual([])
})

for (const width of [1920, 390]) {
  test(`research discoveries use original cards and real coverage fields at ${width}px`, async ({ page }) => {
    const data = await prepare(page)
    await page.setViewportSize({ width, height: 1080 })
    const payload = discoveryPayload(["充分覆盖", "充分覆盖", ...Array(5).fill("部分覆盖"), "未覆盖", "未覆盖"])
    const detail = {
      ...data.detail,
      conversationData: {
        ...data.detail.conversationData,
        steps: [...data.detail.conversationData.steps, { name: "reflection", payload, createdAt: 3 }],
      },
    }
    await page.route(`**/api/dockapi/general-deepinsight/sessions/${id}`, (route) =>
      route.fulfill({ json: { code: 200, data: detail } }),
    )
    await page.goto(`/general-deepinsight/session/${id}`)
    const card = page.locator(".detect-card.research-discovery-card")
    await expect(card.locator(".coverage-step-item")).toHaveCount(9)
    await expect(card.locator(".coverage-step-item.status-full")).toHaveCount(2)
    await expect(card.locator(".coverage-step-item.status-partial")).toHaveCount(5)
    await expect(card.locator(".coverage-step-item.status-uncovered")).toHaveCount(2)
    await expect(card.locator(".research-progress-head strong")).toHaveText("7/9 步骤")
    await expect(card.locator(".research-progress-meta")).toHaveText("充分覆盖 2部分覆盖 5未覆盖 2")
    await expect(card.locator(".uncovered-step-chips")).toHaveText("步骤 8步骤 9")
    await expect(card.locator(".coverage-step-title").first()).toContainText("研究步骤 1")
    await expect(card.locator(".coverage-step-desc").first()).toContainText("覆盖说明 1")
    await expect(card.locator(".coverage-step-desc.pending").first()).toHaveText("待补充：补充资料 3")
    await expect(card.locator(".coverage-step-list")).toHaveCSS("max-height", "336px")
    await expect(card.locator(".coverage-step-list")).toHaveCSS("overflow-y", "auto")
    await expect(card.locator(".coverage-step-item.status-full .coverage-status-chip").first()).toHaveCSS(
      "background-color",
      "rgb(220, 252, 231)",
    )
    await expect(card.locator(".coverage-step-item.status-partial .coverage-status-chip").first()).toHaveCSS(
      "background-color",
      "rgb(254, 243, 199)",
    )
    await expect(card.locator(".research-list").first()).toHaveCSS("list-style-type", "disc")
    await card.scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath("discovery.png") })
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    expect(data.errors).toEqual([])
  })
}

test("upstream all-uncovered data stays 0/8 even when the task and report are complete", async ({ page }) => {
  const data = await prepare(page)
  const payload = discoveryPayload(Array(8).fill("未覆盖"))
  const detail = {
    ...data.detail,
    conversationData: { ...data.detail.conversationData, steps: [{ name: "reflection", payload, createdAt: 3 }] },
  }
  await page.route(`**/api/dockapi/general-deepinsight/sessions/${id}`, (route) =>
    route.fulfill({ json: { code: 200, data: detail } }),
  )
  await page.goto(`/general-deepinsight/session/${id}`)
  const card = page.locator(".detect-card.research-discovery-card")
  await expect(card.locator(".coverage-step-item.status-uncovered")).toHaveCount(8)
  await expect(card.locator(".coverage-status-chip")).toHaveText(Array(8).fill("未覆盖"))
  await expect(card.locator(".research-progress-head strong")).toHaveText("0/8 步骤")
  await expect(card.locator(".research-progress-fill")).toHaveAttribute("style", /width: 0%/)
  await expect(card.locator(".coverage-step-title").first()).toContainText("研究步骤 1")
  await expect(card.locator(".uncovered-step-chips span")).toHaveCount(8)
  expect(data.errors).toEqual([])
})

test("missing coverage status is shown as unknown instead of uncovered", async ({ page }) => {
  const data = await prepare(page)
  const payload = discoveryPayload([""])
  const detail = {
    ...data.detail,
    conversationData: { ...data.detail.conversationData, steps: [{ name: "reflection", payload, createdAt: 3 }] },
  }
  await page.route(`**/api/dockapi/general-deepinsight/sessions/${id}`, (route) =>
    route.fulfill({ json: { code: 200, data: detail } }),
  )
  await page.goto(`/general-deepinsight/session/${id}`)
  const card = page.locator(".detect-card.research-discovery-card")
  await expect(card.locator(".coverage-step-item.status-default .coverage-status-chip")).toHaveText("状态未知")
  await expect(card.locator(".research-progress-meta")).toContainText("状态未知 1")
  await expect(card.locator(".coverage-step-item.status-uncovered,.uncovered-step-chips")).toHaveCount(0)
  expect(data.errors).toEqual([])
})

test("discovery component dimensions and styles match the original Vue view", async ({ page, browser }) => {
  test.skip(!process.env.CMCC_REFERENCE_BASE_URL, "Reference project preview is required for visual comparison")
  const data = await prepare(page)
  await page.setViewportSize({ width: 1920, height: 1300 })
  const payload = discoveryPayload(["充分覆盖", "部分覆盖", "未覆盖"])
  const detail = {
    ...data.detail,
    conversationData: {
      ...data.detail.conversationData,
      steps: [...data.detail.conversationData.steps, { name: "reflection", payload, createdAt: 3 }],
    },
  }
  await page.route(`**/api/dockapi/general-deepinsight/sessions/${id}`, (route) =>
    route.fulfill({ json: { code: 200, data: detail } }),
  )
  await page.goto(`/general-deepinsight/session/${id}`)
  await expect(page.locator(".coverage-step-item")).toHaveCount(3)
  const box = (await page.locator(".general-research-result").boundingBox())!
  const reference = await browser.newPage({ viewport: { width: 1920, height: 1300 } })
  await prepareReferenceDeepInsight(reference, detail)
  const referenceBox = (await reference.locator(".chat-container").boundingBox())!
  await reference.setViewportSize({ width: Math.round(referenceBox.x + box.width), height: 1300 })
  const actualCard = page.locator(".detect-card.research-discovery-card")
  const referenceCard = reference.locator(".detect-card.research-discovery-card")
  const materials = (card: ReturnType<Page["locator"]>) =>
    card.evaluate((root) => {
      const styles = (selector: string) => {
        const element = root.querySelector(selector)!
        const style = getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          font: style.fontSize,
          color: style.color,
          background: style.backgroundColor,
          padding: style.padding,
          gap: style.gap,
          radius: style.borderRadius,
          maxHeight: style.maxHeight,
        }
      }
      return Object.fromEntries(
        [
          ".card-body",
          ".research-progress-meta",
          ".coverage-step-list",
          ".coverage-step-item",
          ".coverage-status-chip",
          ".coverage-step-title",
          ".coverage-step-desc.pending",
          ".uncovered-step-chips",
        ].map((selector) => [selector, styles(selector)]),
      )
    })
  expect(await materials(actualCard)).toEqual(await materials(referenceCard))
  await actualCard.screenshot({ path: test.info().outputPath("implemented-discovery.png") })
  await referenceCard.screenshot({ path: test.info().outputPath("reference-discovery.png") })
  await reference.close()
  expect(data.errors).toEqual([])
})

for (const scenario of [
  { status: "interrupted", field: "recoveryNotice", message: "研究任务已恢复为等待确认，请确认当前研究计划后继续" },
  { status: "failed", field: "error", message: "研究连接异常，请查看已保存的研究过程或重新发起" },
]) {
  test(`top ${scenario.field} is hidden without a gap or changing execution state`, async ({ page }) => {
    const data = await prepare(page, "interrupted")
    await page.route(`**/api/dockapi/general-deepinsight/sessions/${id}`, (route) =>
      route.fulfill({
        json: {
          code: 200,
          data: {
            ...data.detail,
            session: { ...data.detail.session, status: scenario.status },
            conversationData: { ...data.detail.conversationData, [scenario.field]: scenario.message },
          },
        },
      }),
    )
    await page.goto(`/general-deepinsight/session/${id}`)
    await expect(page.locator(".general-research-result")).toHaveAttribute("data-status", scenario.status)
    await expect(page.locator(".general-research > .research-notice,.general-research > .research-error")).toHaveCount(
      0,
    )
    await expect(page.getByText(scenario.message, { exact: true })).toHaveCount(0)
    const root = (await page.locator(".general-research").boundingBox())!
    const result = (await page.locator(".general-research-result").boundingBox())!
    expect(result.y).toBeCloseTo(root.y, 1)
    if (scenario.status === "interrupted") {
      await expect(page.locator(".plan-confirmation-card .confirm-btn")).toBeEnabled()
      await page.screenshot({ path: test.info().outputPath("without-top-notices.png") })
    } else {
      await expect(page.locator(".plan-confirmation-card")).toHaveCount(0)
    }
    expect(data.errors).toEqual([])
  })
}

test("plan countdown decreases, survives same-plan refresh and confirms only once", async ({ page }) => {
  const data = await prepare(page, "interrupted")
  await freezeConfirmationClock(page)
  await page.goto(`/general-deepinsight/session/${id}`)
  const confirm = page.locator(".plan-confirmation-card .confirm-btn")
  await expect(confirm).toHaveText("确认（60秒）")
  await page.clock.runFor(3000)
  await expect(confirm).toHaveText("确认（57秒）")
  const refresh = page.waitForResponse((response) => new URL(response.url()).pathname.endsWith(`/sessions/${id}`))
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent("general-deepinsight-updated", { detail: "mutation" })),
  )
  await refresh
  await expect(confirm).toHaveText("确认（57秒）")
  await page.clock.runFor(2000)
  await expect(confirm).toHaveText("确认（55秒）")
  await page.screenshot({ path: test.info().outputPath("plan-countdown.png") })
  await page.clock.runFor(55_000)
  await expect(page.locator(".general-research-result")).toHaveAttribute("data-status", "completed")
  const resumes = data.requests.filter((request) => request.path.endsWith("/resume"))
  expect(resumes).toHaveLength(1)
  expect(resumes[0]!.body).toEqual({ resume: { action: "confirm" } })
  await page.clock.runFor(65_000)
  expect(data.requests.filter((request) => request.path.endsWith("/resume"))).toHaveLength(1)
  expect(data.errors).toEqual([])
})

test("manual confirmation sends the existing confirm command without a new task", async ({ page }) => {
  const data = await prepare(page, "interrupted")
  await page.goto(`/general-deepinsight/session/${id}`)
  await page.locator(".plan-confirmation-card .confirm-btn").click()
  await expect(page.locator(".general-research-result")).toHaveAttribute("data-status", "completed")
  expect(data.requests.filter((request) => request.path.endsWith("/resume"))).toHaveLength(1)
  expect(data.requests.find((request) => request.path.endsWith("/resume"))!.body).toEqual({
    resume: { action: "confirm" },
  })
  expect(
    data.requests.filter((request) => request.method === "POST" && request.path.endsWith("/sessions")),
  ).toHaveLength(0)
})

test("failed automatic confirmation never becomes an automatic retry loop", async ({ page }) => {
  await prepare(page, "interrupted")
  await freezeConfirmationClock(page)
  let attempts = 0
  await page.route(`**/api/dockapi/general-deepinsight/sessions/${id}/resume`, (route) => {
    attempts++
    return route.fulfill({ status: 503, json: { code: 503, message: "研究服务暂不可用" } })
  })
  await page.goto(`/general-deepinsight/session/${id}`)
  await expect(page.locator(".plan-confirmation-card .confirm-btn")).toHaveText("确认（60秒）")
  await page.clock.runFor(60_000)
  await expect(page.locator(".plan-confirmation-card .confirm-btn")).toHaveText("确认")
  await expect(page.locator(".plan-confirmation-card .confirm-btn")).toBeEnabled()
  await expect(page.getByRole("alert")).toHaveCount(0)
  await expect(page.locator(".general-research-result")).toHaveAttribute("data-status", "interrupted")
  await page.clock.runFor(65_000)
  expect(attempts).toBe(1)
})

test("rejected modification retains plan, input and countdown for manual retry", async ({ page }) => {
  const data = await prepare(page, "interrupted")
  await freezeConfirmationClock(page)
  let attempts = 0
  await page.route(`**/api/dockapi/general-deepinsight/sessions/${id}/resume`, (route) => {
    attempts++
    if (attempts === 1)
      return route.fulfill({ status: 409, json: { code: 409, message: "任务当前状态不允许执行，请刷新任务详情" } })
    return route.fallback()
  })
  await page.goto(`/general-deepinsight/session/${id}`)
  const confirm = page.locator(".plan-confirmation-card .confirm-btn")
  await expect(confirm).toHaveText("确认（60秒）")
  await page.clock.runFor(5000)
  await page.getByRole("textbox", { name: "补充信息或修改意见", exact: true }).fill("补充真实公开来源")
  await page.getByRole("button", { name: "提交修改意见", exact: true }).click()
  await expect(page.getByRole("button", { name: "提交修改意见", exact: true })).toBeEnabled()
  await expect(page.getByRole("alert")).toHaveCount(0)
  await expect(page.locator(".general-research-result")).toHaveAttribute("data-status", "interrupted")
  await expect(page.getByRole("textbox", { name: "补充信息或修改意见", exact: true })).toHaveValue("补充真实公开来源")
  await expect(confirm).toHaveText("确认（55秒）")
  await page.getByRole("button", { name: "提交修改意见", exact: true }).click()
  await expect(page.locator(".general-research-result")).toHaveAttribute("data-status", "completed")
  expect(attempts).toBe(2)
  expect(data.requests.find((request) => request.path.endsWith("/resume"))!.body).toEqual({
    resume: { action: "modify", modification: "补充真实公开来源" },
  })
  expect(data.errors).toEqual([])
})

test("editing pauses countdown and route changes dispose automatic confirmation", async ({ page }) => {
  const data = await prepare(page, "interrupted")
  await freezeConfirmationClock(page)
  await page.goto(`/general-deepinsight/session/${id}`)
  const confirm = page.locator(".plan-confirmation-card .confirm-btn")
  await expect(confirm).toHaveText("确认（60秒）")
  await page.clock.runFor(2000)
  await expect(confirm).toHaveText("确认（58秒）")
  await page.getByRole("button", { name: "编辑计划", exact: true }).click()
  await page.clock.runFor(65_000)
  expect(data.requests.filter((request) => request.path.endsWith("/resume"))).toHaveLength(0)
  await page.getByRole("button", { name: "取消编辑", exact: true }).click()
  await expect(confirm).toHaveText("确认（58秒）")
  await page.clock.runFor(2000)
  await expect(confirm).toHaveText("确认（56秒）")
  await page.getByRole("navigation").getByRole("button", { name: "通用深度洞察", exact: true }).click()
  await expect(page).toHaveURL(/\/general-deepinsight$/)
  await page.clock.runFor(65_000)
  expect(data.requests.filter((request) => request.path.endsWith("/resume"))).toHaveLength(0)
  expect(data.errors).toEqual([])
})

for (const status of ["running", "failed", "stopped"]) {
  test(`${status} state with saved plan cannot submit or auto-resume`, async ({ page }) => {
    const data = await prepare(page, "interrupted")
    await freezeConfirmationClock(page)
    await page.route(`**/api/dockapi/general-deepinsight/sessions/${id}`, (route) =>
      route.fulfill({
        json: { code: 200, data: { ...data.detail, session: { ...data.detail.session, status } } },
      }),
    )
    await page.goto(`/general-deepinsight/session/${id}`)
    await expect(page.locator(".general-research-result")).toHaveAttribute("data-status", status)
    if (status === "running") {
      const confirm = page.locator(".plan-confirmation-card .confirm-btn")
      await expect(confirm).toHaveText("等待就绪")
      await expect(confirm).toBeDisabled()
      await expect(page.getByRole("button", { name: "提交修改意见", exact: true })).toBeDisabled()
    } else {
      await expect(page.locator(".plan-confirmation-card")).toHaveCount(0)
    }
    await page.clock.runFor(65_000)
    expect(data.requests.filter((request) => request.path.endsWith("/resume"))).toHaveLength(0)
    expect(data.errors).toEqual([])
  })
}

test("separate entry and form create only a LangGraph task", async ({ page }) => {
  const data = await prepare(page)
  await page.goto("/general-deepinsight")
  await expect(page.getByRole("heading", { name: "DeepInsight深度洞察", exact: true })).toBeVisible()
  const sidebar = page
    .getByRole("navigation")
    .filter({ has: page.getByRole("button", { name: "通用深度洞察", exact: true }) })
  await expect(sidebar.getByRole("button", { name: "深度研究", exact: true })).toBeVisible()
  await page.getByRole("textbox", { name: "研究问题", exact: true }).fill("研究中文数据治理")
  await page.getByRole("button", { name: "开始研究", exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/general-deepinsight/session/${id}`))
  await expect(page.locator(".general-research-result")).toHaveAttribute("data-status", "completed")
  expect(
    data.requests.filter((request) => request.method === "POST" && request.path === "/api/dockapi/sessions"),
  ).toHaveLength(0)
  expect(data.requests.some((request) => request.path.endsWith(`/sessions/${id}/stream`))).toBe(true)
  expect(data.errors).toEqual([])
})

test("completed history renders text, tables and real ECharts with stable time", async ({ page }) => {
  const data = await prepare(page)
  const started = Date.now()
  await page.goto(`/general-deepinsight/session/${id}`)
  await expect(page.locator(".general-research-result")).toHaveAttribute("data-status", "completed")
  console.log(
    JSON.stringify({
      benchmark: process.env.RESEARCH_BENCHMARK_PHASE ?? "current",
      ms: Date.now() - started,
      dom: await page.locator("*").count(),
    }),
  )
  expect(
    await page.evaluate(() =>
      performance.getEntriesByType("resource").some((entry) => entry.name.includes("/report-editor-view-")),
    ),
  ).toBe(false)
  await page.getByRole("tab", { name: "文字报告", exact: true }).click()
  await expect(page.locator(".report-view").getByRole("heading", { name: "研究报告", exact: true })).toBeVisible()
  await expect(page.locator(".report-view table")).toContainText("可验证")
  const time = await page.locator(".stats-row .stat-value").first().textContent()
  await page.waitForTimeout(1300)
  expect(await page.locator(".stats-row .stat-value").first().textContent()).toBe(time)
  await page.getByRole("tab", { name: "可视化报告", exact: true }).click()
  await expect(page.locator(".research-chart canvas")).toBeVisible()
  const nonblank = await page.locator(".research-chart canvas").evaluate((canvas: HTMLCanvasElement) => {
    const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height).data
    let count = 0
    for (let index = 3; index < pixels.length; index += 4) if (pixels[index]! > 0) count++
    return count
  })
  expect(nonblank).toBeGreaterThan(1000)
  await expect(page.locator(".visual-report table")).toContainText("治理")
  await page.screenshot({ path: test.info().outputPath("research-desktop.png") })
  expect(data.errors).toEqual([])
})

test("interrupted plan can be edited and resumed without another thread", async ({ page }) => {
  const data = await prepare(page, "interrupted")
  await page.goto(`/general-deepinsight/session/${id}`)
  await expect(page.locator(".general-research-result")).toHaveAttribute("data-status", "interrupted")
  await page.getByRole("textbox", { name: "补充信息或修改意见", exact: true }).fill("补充公开证据")
  await page.getByRole("button", { name: "提交修改意见", exact: true }).click()
  await expect(page.locator(".general-research-result")).toHaveAttribute("data-status", "completed")
  const resume = data.requests.find((request) => request.path.endsWith("/resume"))
  expect(resume?.body).toMatchObject({ resume: { action: "modify", modification: "补充公开证据" } })
  expect(
    data.requests.filter((request) => request.method === "POST" && request.path.endsWith("/sessions")),
  ).toHaveLength(0)
})

test("running history can stop and terminal time stops advancing", async ({ page }) => {
  await prepare(page, "running")
  await page.goto(`/general-deepinsight/session/${id}`)
  await page.getByRole("button", { name: "停止执行", exact: true }).click()
  await expect(page.locator(".general-research-result")).toHaveAttribute("data-status", "stopped")
  const time = await page.locator(".stats-row .stat-value").first().textContent()
  await page.waitForTimeout(1300)
  expect(await page.locator(".stats-row .stat-value").first().textContent()).toBe(time)
})

test("edited plans use the observed confirm_with_edits contract", async ({ page }) => {
  const data = await prepare(page, "interrupted")
  await page.goto(`/general-deepinsight/session/${id}`)
  await page.getByRole("button", { name: "编辑计划", exact: true }).click()
  await page.getByRole("textbox", { name: "研究计划", exact: true }).fill("收集资料\n核验证据\n形成报告")
  await page.getByRole("textbox", { name: "检索问题", exact: true }).fill("公开数据治理资料")
  await page.getByRole("button", { name: "编辑后确认", exact: true }).click()
  await expect(page.locator(".general-research-result")).toHaveAttribute("data-status", "completed")
  expect(data.requests.find((request) => request.path.endsWith("/resume"))?.body).toMatchObject({
    resume: {
      action: "confirm_with_edits",
      research_plan: ["收集资料", "核验证据", "形成报告"],
      queries: ["公开数据治理资料"],
    },
  })
})

test("internal cases use one-shot snapshot handoff and remain read-only", async ({ page }) => {
  const data = await prepare(page, "completed", false)
  await page.goto("/general-deepinsight")
  await page.getByRole("button", { name: /数据治理研究案例/ }).click()
  await expect(page).toHaveURL(new RegExp(`/general-deepinsight/cases/${code}`))
  await expect(page.locator(".general-research-result")).toHaveAttribute("data-read-only", "")
  await page.getByRole("tab", { name: "文字报告", exact: true }).click()
  await expect(page.getByRole("button", { name: "修改文章", exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "删除案例", exact: true })).toHaveCount(0)
  expect(data.requests.filter((request) => request.path.endsWith(`/cases/${code}`))).toHaveLength(1)
  await page.getByRole("button", { name: "做同款", exact: true }).click()
  await expect(page).toHaveURL(/\/general-deepinsight$/)
  await expect(page.getByRole("textbox", { name: "研究问题", exact: true })).toHaveValue("研究中文数据治理")
  expect(
    data.requests.filter((request) => request.method === "POST" && request.path.endsWith("/sessions")),
  ).toHaveLength(0)
})

test("narrow screen switches panels without duplicate charts or overflow", async ({ page }) => {
  const data = await prepare(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/general-deepinsight/session/${id}`)
  await expect(page.locator(".query-header-title")).toContainText("研究中文数据治理")
  await page.getByRole("button", { name: "研究结果", exact: true }).click()
  await expect
    .poll(() =>
      page
        .locator('aside[aria-label="CMCC conversations"]')
        .evaluate((element) => element.getBoundingClientRect().width),
    )
    .toBeLessThanOrEqual(2)
  await page.getByRole("tab", { name: "可视化报告", exact: true }).click()
  await expect(page.locator(".research-chart canvas")).toHaveCount(1)
  await expect(page.locator(".research-chart canvas")).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  expect(
    await page
      .locator(".visual-report .chart-card")
      .evaluate((element) => element.getBoundingClientRect().right <= window.innerWidth),
  ).toBe(true)
  await page.screenshot({ path: test.info().outputPath("research-mobile.png") })
  await page.getByRole("button", { name: "研究内容", exact: true }).click()
  await expect(page.locator(".research-chart canvas")).toHaveCount(0)
  expect(data.errors).toEqual([])
})

test("result presentation matches the original component geometry and materials", async ({ page, browser }) => {
  test.skip(!process.env.CMCC_REFERENCE_BASE_URL, "Reference project preview is required for visual comparison")
  const data = await prepare(page)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto(`/general-deepinsight/session/${id}`)
  await expect(page.locator(".general-research-result")).toHaveAttribute("data-status", "completed")
  const box = (await page.locator(".general-research-result").boundingBox())!
  const reference = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  await prepareReferenceDeepInsight(reference, data.detail)
  const referenceBox = (await reference.locator(".chat-container").boundingBox())!
  await reference.setViewportSize({ width: Math.round(referenceBox.x + box.width), height: 1080 })
  const actual = await page.locator(".general-research-result").evaluate((root) => {
    const styles = (selector: string) => {
      const element = root.querySelector(selector)!
      const style = getComputedStyle(element)
      return {
        height: style.height,
        padding: style.padding,
        background: style.backgroundColor,
        fontSize: style.fontSize,
        borderRadius: style.borderRadius,
      }
    }
    const widths = [".left-panel", ".right-panel"].map(
      (selector) => root.querySelector(selector)!.getBoundingClientRect().width,
    )
    return {
      header: styles(".panel-header"),
      stats: styles(".stat-card"),
      progress: styles(".thinking-header"),
      widths,
    }
  })
  const expected = await reference.locator(".chat-container").evaluate((root) => {
    const styles = (selector: string) => {
      const element = root.querySelector(selector)!
      const style = getComputedStyle(element)
      return {
        height: style.height,
        padding: style.padding,
        background: style.backgroundColor,
        fontSize: style.fontSize,
        borderRadius: style.borderRadius,
      }
    }
    const widths = [".left-panel", ".right-panel"].map(
      (selector) => root.querySelector(selector)!.getBoundingClientRect().width,
    )
    return {
      header: styles(".panel-header"),
      stats: styles(".stat-card"),
      progress: styles(".thinking-header"),
      widths,
    }
  })
  expect(actual.header).toEqual(expected.header)
  expect(actual.stats).toEqual(expected.stats)
  expect(actual.progress).toEqual(expected.progress)
  expect(Math.abs(actual.widths[0]! - expected.widths[0]!)).toBeLessThan(2)
  await page.locator(".general-research-result").screenshot({ path: test.info().outputPath("implemented-result.png") })
  await reference.locator(".chat-container").screenshot({ path: test.info().outputPath("reference-result.png") })
  await reference.close()
})

test("homepage composer matches new conversation and plus directly opens file upload", async ({ page }) => {
  await prepare(page)
  await page.goto("/general-deepinsight")
  const input = page.getByRole("textbox", { name: "研究问题", exact: true })
  await expect(input).toHaveAttribute("placeholder", "请告诉您要研究的问题？")
  expect(
    await page.locator(".research-compose form").evaluate((form) => {
      const style = getComputedStyle(form)
      return { radius: style.borderRadius, border: style.borderTopWidth, minHeight: style.minHeight }
    }),
  ).toEqual({ radius: "24px", border: "2px", minHeight: "160px" })
  await expect(page.getByRole("button", { name: /执行|计划|选择模型/ })).toHaveCount(0)
  const picker = page.waitForEvent("filechooser")
  await page.getByRole("button", { name: "上传文件", exact: true }).click()
  expect((await picker).isMultiple()).toBe(true)
})

test("whole research homepage reuses new conversation branding and geometry", async ({ page }) => {
  const data = await prepare(page, "completed", false, 6)
  await page.setViewportSize({ width: 1440, height: 900 })
  const geometry = () =>
    page.locator('[data-component="session-new-design"]').evaluate((root) => {
      const bounds = (selector: string) => {
        const element = root.querySelector(selector)!
        const rect = element.getBoundingClientRect()
        const style = getComputedStyle(element)
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          font: style.fontSize,
          color: style.color,
        }
      }
      return {
        background: getComputedStyle(root).backgroundColor,
        heading: bounds(".cmcc-home-heading"),
        logo: bounds(".cmcc-home-brand img"),
        title: bounds(".cmcc-home-brand h1"),
        subtitle: bounds(".cmcc-home-heading p"),
        composer: bounds(".cmcc-home-composer"),
        send: {
          background: getComputedStyle(root.querySelector(".cmcc-send-button")!).backgroundImage,
          opacity: getComputedStyle(root.querySelector(".cmcc-send-button")!).opacity,
          border: getComputedStyle(root.querySelector(".cmcc-send-button")!).border,
        },
      }
    })
  await page.goto("/app")
  await expect(page.locator('[data-component="prompt-input"]')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  const native = await geometry()
  await page.goto("/general-deepinsight")
  await expect(page.locator(".featured-list .featured-card")).toHaveCount(5)
  await page.evaluate(() => document.fonts.ready)
  expect(await geometry()).toEqual(native)
  await expect(page.getByText("您想深入研究什么？", { exact: true })).toHaveCount(0)
  await expect(page.getByRole("button", { name: "新建研究", exact: true })).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath("research-home-desktop.png") })
  expect(data.errors).toEqual([])
})

test("featured cases preserve descriptions, sort by date and show more without categories", async ({ page }) => {
  const data = await prepare(page, "completed", true, 7)
  await page.goto("/general-deepinsight")
  const cards = page.locator(".featured-list .featured-card")
  await expect(cards).toHaveCount(5)
  await expect(cards.first().locator(".case-name")).toHaveText("数据治理研究案例 7")
  await expect(cards.first().locator(".case-tag")).toHaveText("已完成的研究")
  await page.getByRole("button", { name: "更多", exact: true }).click()
  const dialog = page.getByRole("dialog", { name: "更多精选案例", exact: true })
  await expect(dialog.locator(".featured-card")).toHaveCount(7)
  await expect(dialog.getByRole("button", { name: /按类型|按日期/ })).toHaveCount(0)
  await expect(dialog.locator(".featured-labels,.featured-dialog-filters")).toHaveCount(0)
  await page.screenshot({ path: test.info().outputPath("research-more-desktop.png") })
  page.once("dialog", (confirm) => confirm.accept())
  await dialog.getByRole("button", { name: "删除案例：数据治理研究案例 7", exact: true }).click()
  await expect(dialog.locator(".featured-card")).toHaveCount(6)
  await expect(cards).toHaveCount(5)
  await expect(cards.first().locator(".case-name")).toHaveText("数据治理研究案例 6")
  await page.keyboard.press("Escape")
  await expect(dialog).not.toBeVisible()
  await page.getByRole("button", { name: "更多", exact: true }).click()
  await dialog.locator(".featured-card").filter({ hasText: "数据治理研究案例 6" }).click()
  await expect(page).toHaveURL(new RegExp(`/general-deepinsight/cases/${data.cases[5]!.caseCode}`))
  expect(data.requests.filter((request) => request.path.endsWith(`/cases/${data.cases[5]!.caseCode}`))).toHaveLength(1)
  expect(data.errors).toEqual([])
})

test("case preloading stays on the clicked cover and failed loads remain retryable", async ({ page }) => {
  const data = await prepare(page, "completed", false)
  let attempts = 0
  let release!: () => void
  const pending = new Promise<void>((resolve) => {
    release = resolve
  })
  await page.route(`**/api/dockapi/general-deepinsight/cases/${code}`, async (route) => {
    attempts++
    if (attempts === 1) {
      await pending
      return route.fulfill({ status: 503, json: { code: 503, message: "测试加载失败" } })
    }
    return route.fallback()
  })
  await page.goto("/general-deepinsight")
  await page.locator(".featured-list .featured-card").click()
  await expect(page.locator(".research-case-loading")).toBeVisible()
  await expect(page).toHaveURL(/\/general-deepinsight$/)
  release()
  await expect(page.locator(".research-case-loading")).toHaveCount(0)
  await expect(page.getByRole("alert")).toHaveCount(0)
  await expect(page).toHaveURL(/\/general-deepinsight$/)
  await page.locator(".featured-list .featured-card").click()
  await expect(page).toHaveURL(new RegExp(`/general-deepinsight/cases/${code}`))
  expect(attempts).toBe(2)
  expect(data.errors).toEqual([])
})

for (const width of [390, 320]) {
  test(`research homepage and more cases fit a ${width}px screen`, async ({ page }) => {
    const data = await prepare(page, "completed", false, 6)
    await page.setViewportSize({ width, height: 844 })
    await page.goto("/general-deepinsight")
    await expect(page.locator(".featured-list .featured-card")).toHaveCount(5)
    await expect
      .poll(() =>
        page
          .locator('aside[aria-label="CMCC conversations"]')
          .evaluate((element) => element.getBoundingClientRect().width),
      )
      .toBeLessThanOrEqual(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const list = page.locator(".featured-list")
    expect(await list.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(true)
    expect(
      await page
        .getByRole("textbox", { name: "研究问题", exact: true })
        .evaluate((element) => element.getBoundingClientRect().right <= window.innerWidth),
    ).toBe(true)
    await page.screenshot({ path: test.info().outputPath("research-home-mobile.png") })
    await page.getByRole("button", { name: "更多", exact: true }).click()
    const dialog = page.getByRole("dialog", { name: "更多精选案例", exact: true })
    await expect(dialog.locator(".featured-card")).toHaveCount(6)
    expect(await dialog.evaluate((element) => element.scrollWidth <= window.innerWidth)).toBe(true)
    const cover = await dialog.locator(".case-cover").first().boundingBox()
    expect(cover!.width / cover!.height).toBeCloseTo(1.25, 1)
    await page.screenshot({ path: test.info().outputPath("research-more-mobile.png") })
    await dialog.getByRole("button", { name: "关闭", exact: true }).click()
    await expect(dialog).not.toBeVisible()
    expect(data.errors).toEqual([])
  })
}

test("featured case materials and card sizing match the original Vue page", async ({ page, browser }) => {
  test.skip(!process.env.CMCC_REFERENCE_BASE_URL, "Reference project preview is required for visual comparison")
  const data = await prepare(page, "completed", false, 6)
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.goto("/general-deepinsight")
  const actualSection = page.locator(".research-featured")
  await expect(actualSection.locator(".featured-card")).toHaveCount(5)
  const reference = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  await prepareReferenceFeaturedCases(reference, data.cases)
  const expectedSection = reference.locator(".featured-cases")
  const width = (await actualSection.boundingBox())!.width
  const referenceWidth = (await expectedSection.boundingBox())!.width
  await reference.setViewportSize({ width: Math.round(1920 + (width - referenceWidth) / 0.8), height: 1080 })
  const materials = async (section: ReturnType<Page["locator"]>) =>
    section.evaluate((root) => {
      const values = (selector: string) => {
        const style = getComputedStyle(root.querySelector(selector)!)
        return {
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          fontWeight: style.fontWeight,
          padding: style.padding,
          margin: style.margin,
          border: style.border,
          borderRadius: style.borderRadius,
          color: style.color,
          background: style.background.replace(/(rgba\([^)]+\)) 0%/g, "$1"),
          boxShadow: style.boxShadow,
        }
      }
      return {
        header: values(".featured-header h2"),
        cover: values(".case-cover"),
        description: values(".case-tag"),
        title: values(".case-name"),
        more: values(".featured-more-btn"),
      }
    })
  expect(await materials(actualSection)).toEqual(await materials(expectedSection))
  const actualCover = (await actualSection.locator(".case-cover").first().boundingBox())!
  const expectedCover = (await expectedSection.locator(".case-cover").first().boundingBox())!
  expect(Math.abs(actualCover.width - expectedCover.width)).toBeLessThan(2)
  expect(Math.abs(actualCover.height - expectedCover.height)).toBeLessThan(2)
  await actualSection.screenshot({ path: test.info().outputPath("implemented-featured.png") })
  await expectedSection.screenshot({ path: test.info().outputPath("reference-featured.png") })
  await reference.close()
  expect(data.errors).toEqual([])
})

test("replay stops without changing source and Word export contains real report text", async ({ page }) => {
  await prepare(page)
  await page.goto(`/general-deepinsight/session/${id}`)
  await page.getByRole("tab", { name: "文字报告", exact: true }).click()
  const download = page.waitForEvent("download")
  await page.getByRole("button", { name: "导出 Word", exact: true }).click()
  const artifact = await download
  expect(artifact.suggestedFilename()).toBe("research-report.docx")
  const fs = await import("node:fs/promises")
  const zip = await JSZip.loadAsync(await fs.readFile((await artifact.path())!))
  const word = await zip.file("word/document.xml")!.async("string")
  expect(word).toContain("这是中文正文")
  expect(word).toContain("可验证")
  await page.getByRole("button", { name: "看回放", exact: true }).click()
  await expect(page.getByRole("button", { name: "停止回放", exact: true })).toBeVisible()
  await page.getByRole("button", { name: "停止回放", exact: true }).click()
  await page.getByRole("button", { name: "查看报告", exact: true }).click()
  await expect(page.locator(".report-view")).toContainText("这是中文正文")
  await expect(page.locator(".general-research-result")).toHaveAttribute("data-status", "completed")
})

for (const width of [1920, 390]) {
  test(`Word exports native fixed-template chapters, lists, tables and images at ${width}px`, async ({ page }) => {
    const data = await prepare(page)
    const content = `# Word 模板验收报告\n\n## 一、研究概述\n\n这是用于验证模板的中文正文，不代表实际研究数据。${"报告内容需要保持字体、行距和段落缩进的一致性。".repeat(8)}\n\n### （一）信息来源\n\n参考[公开资料](https://example.org/source)，保留 **重点内容**。\n\n#### 1. 研究边界\n\n本段用于验证三级标题。\n\n- 第一项资料\n- 第二项资料\n  - 嵌套说明\n\n3. 第三项\n4. 第四项\n\n|项目|结论|\n|---|---|\n|中文表格|保持可编辑|\n\n![示例图片](/test-report-image.svg)\n\n{{chart:1}}\n\n## 二、后续研究\n\n${"这是跨页排版测试段落，内容仅用于导出验收。\n\n".repeat(12)}`
    data.setReport(content)
    const detail = {
      ...data.detail,
      reportContent: content,
      conversationData: {
        ...data.detail.conversationData,
        visualizationsMap: {
          "1": {
            title: "图表导出测试",
            option: {
              animation: false,
              xAxis: { type: "category", data: ["甲", "乙"] },
              yAxis: { type: "value" },
              series: [{ type: "bar", data: [3, 7] }],
            },
          },
        },
      },
    }
    await page.route(`**/api/dockapi/general-deepinsight/sessions/${id}`, (route) =>
      route.fulfill({ json: { code: 200, data: detail } }),
    )
    await page.route("**/test-report-image.svg", (route) =>
      route.fulfill({
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="100"><rect width="320" height="100" fill="#d9e9ff"/><rect x="20" y="20" width="280" height="60" fill="#447ac7"/></svg>',
      }),
    )
    await page.setViewportSize({ width, height: 1080 })
    await page.goto(`/general-deepinsight/session/${id}`)
    if (width < 768) await page.getByRole("button", { name: "研究结果", exact: true }).click()
    await page.getByRole("tab", { name: "文字报告", exact: true }).click()
    expect(
      await page.evaluate(() =>
        performance.getEntriesByType("resource").some((entry) => /\/(export-word|word-document)-/.test(entry.name)),
      ),
    ).toBe(false)
    const pending = page.waitForEvent("download")
    await page.getByRole("button", { name: "导出 Word", exact: true }).click()
    const download = await pending
    expect(download.suggestedFilename()).toBe("research-report.docx")
    await download.saveAs(test.info().outputPath("word-template.docx"))
    const fs = await import("node:fs/promises")
    const zip = await JSZip.loadAsync(await fs.readFile((await download.path())!))
    const documentXml = await zip.file("word/document.xml")!.async("string")
    const stylesXml = await zip.file("word/styles.xml")!.async("string")
    const properties = await page.evaluate(
      ({ documentXml, stylesXml }) => {
        const ns = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
        const doc = new DOMParser().parseFromString(documentXml, "application/xml")
        const styles = new DOMParser().parseFromString(stylesXml, "application/xml")
        const body = Array.from(styles.getElementsByTagNameNS(ns, "style")).find(
          (node) => node.getAttributeNS(ns, "styleId") === "ResearchBody",
        )!
        const defaults = styles.getElementsByTagNameNS(ns, "docDefaults")[0]!
        return {
          parseErrors:
            doc.getElementsByTagName("parsererror").length + styles.getElementsByTagName("parsererror").length,
          title: doc.getElementsByTagNameNS(ns, "t")[0]!.textContent,
          firstLineChars: body.getElementsByTagNameNS(ns, "ind")[0]!.getAttributeNS(ns, "firstLineChars"),
          spacing: defaults.getElementsByTagNameNS(ns, "spacing")[0]!.getAttributeNS(ns, "line"),
          lineRule: defaults.getElementsByTagNameNS(ns, "spacing")[0]!.getAttributeNS(ns, "lineRule"),
          tableCount: doc.getElementsByTagNameNS(ns, "tbl").length,
          pictureCount: doc.getElementsByTagNameNS(ns, "drawing").length,
          numbered: doc.getElementsByTagNameNS(ns, "numPr").length,
        }
      },
      { documentXml, stylesXml },
    )
    expect(properties).toEqual({
      parseErrors: 0,
      title: "Word 模板验收报告",
      firstLineChars: "200",
      spacing: "560",
      lineRule: "exact",
      tableCount: 1,
      pictureCount: 2,
      numbered: 5,
    })
    expect(Object.keys(zip.files).filter((name) => /^word\/media\/.+\.png$/.test(name))).toHaveLength(2)
    expect(Object.keys(zip.files).some((name) => name.endsWith(".odttf"))).toBe(false)
    await expect(page.locator(".gd-word-export")).toHaveCount(0)
    await expect(page.locator(".report-view")).toContainText("中文表格")
    await page.screenshot({ path: test.info().outputPath("word-export-source.png") })
    expect(data.errors).toEqual([])
  })
}
